import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import type { ScanEnv } from './index';
const origin = 'https://dibdaminisikh-png.github.io';
const extracted = { title: 'کافه آزمایشی', unit: 'unknown', items: [{ name: 'چای', quantity: 3, total: 900000 }], charges: [], printedTotal: 900000, warnings: [] };
function env(): ScanEnv {
  return { AI: { run: vi.fn().mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(extracted) } }], usage: { prompt_tokens: 2000, completion_tokens: 800 } }) }, SCAN_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) }, ALLOWED_ORIGIN: origin, TURNSTILE_SITE_KEY: 'public-key', TURNSTILE_SECRET_KEY: 'test-secret' };
}
function req(body: unknown = { image: 'data:image/jpeg;base64,/9j/AAAA', token: 'token' }, requestOrigin = origin) { return new Request('https://scan.example/scan', { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function verified(extra = {}) { vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ success: true, hostname: 'dibdaminisikh-png.github.io', action: 'receipt-scan', ...extra }))); }
afterEach(() => vi.unstubAllGlobals());
describe('scan worker boundary', () => {
  it('requires the configured origin and security setup before running AI', async () => {
    const bindings = env();
    expect((await worker.fetch(req(undefined, 'https://elsewhere.example'), bindings)).status).toBe(403);
    expect((await worker.fetch(req(), { ...bindings, TURNSTILE_SECRET_KEY: '' })).status).toBe(503);
    expect(bindings.AI.run).not.toHaveBeenCalled();
    const config = await worker.fetch(new Request('https://scan.example/config', { headers: { origin } }), bindings);
    expect(await config.json()).toEqual({ siteKey: 'public-key' });
    expect(config.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(await worker.fetch(req(), { ...bindings, TURNSTILE_SECRET_KEY: '' }).then(r => r.json()))).not.toContain('test-secret');
  });
  it('rejects remote images, unsupported files, excessive bodies and rate excess before AI', async () => {
    const bindings = env();
    expect((await worker.fetch(req({ image: 'https://internal.example/photo.jpg', token: 'token' }), bindings)).status).toBe(400);
    expect((await worker.fetch(req({ image: 'data:text/html;base64,AAAA', token: 'token' }), bindings)).status).toBe(400);
    expect((await worker.fetch(req({ image: 'data:image/jpeg;base64,'+'A'.repeat(2_200_000), token: 'token' }), bindings)).status).toBe(413);
    vi.mocked(bindings.SCAN_RATE_LIMITER.limit).mockResolvedValue({ success: false });
    expect((await worker.fetch(req(), bindings)).status).toBe(429);
    expect(bindings.AI.run).not.toHaveBeenCalled();
  });
  it('rejects failed or wrong-host and wrong-action Turnstile verification', async () => {
    const bindings = env();
    for (const extra of [{ success: false }, { hostname: 'other.example' }, { action: 'other' }]) {
      verified(extra); expect((await worker.fetch(req(), bindings)).status).toBe(403);
    }
    expect(bindings.AI.run).not.toHaveBeenCalled();
  });
  it('sends the image with a fixed extraction prompt and preserves row totals and unknown units', async () => {
    verified(); const bindings = env(); const response = await worker.fetch(req(), bindings);
    expect(response.status).toBe(200); const body = await response.json();
    expect(body.receipt.items[0]).toEqual({ name: 'چای', quantity: 3, total: 900000 }); expect(body.receipt.unit).toBe('unknown'); expect(body.usage.estimatedNeurons).toBe(40);
    expect(bindings.AI.run).toHaveBeenCalledWith('@cf/google/gemma-4-26b-a4b-it', expect.objectContaining({ chat_template_kwargs: { enable_thinking: false }, max_completion_tokens: 2500 }));
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  });
  it('returns controlled errors for quota and invalid model results without leaking upstream content', async () => {
    verified(); const bindings = env(); vi.mocked(bindings.AI.run).mockRejectedValue(new Error('daily neuron quota exceeded PRIVATE_RECEIPT_DATA'));
    let response = await worker.fetch(req(), bindings); expect(response.status).toBe(429); expect(await response.text()).not.toContain('PRIVATE_RECEIPT_DATA');
    vi.mocked(bindings.AI.run).mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(extracted) } }] });
    response = await worker.fetch(req(), bindings); expect(response.status).toBe(502);
  });
});
