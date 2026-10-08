import { MAX_IMAGE_BYTES, MAX_REQUEST_BYTES, parseModelReceipt, SCAN_PROMPT, scanUsage } from '../shared/scan';

export interface ScanEnv {
  AI: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  SCAN_RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  ALLOWED_ORIGIN: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
}
const MODEL = '@cf/google/gemma-4-26b-a4b-it';
function imageData(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0 || match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) return false;
  // Only images with a matching magic prefix are passed to the model; no remote fetch/SSRF.
  return match[1] === 'jpeg' ? match[2].startsWith('/9j/') : match[1] === 'png' ? match[2].startsWith('iVBORw0KGgo') : match[2].startsWith('UklGR');
}
async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) throw new RangeError('large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('empty');
  let bytes = 0, raw = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) { await reader.cancel(); throw new RangeError('large'); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw);
  } finally { reader.releaseLock(); }
}

export default {
  async fetch(request: Request, env: ScanEnv): Promise<Response> {
    const origin = request.headers.get('origin');
    const allowed = env.ALLOWED_ORIGIN;
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'vary': 'Origin', 'x-content-type-options': 'nosniff' });
    const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });
    if (!allowed || origin !== allowed) return reply(403, { code: 'origin', error: 'این نشانی اجازهٔ اسکن ندارد.' });
    headers.set('access-control-allow-origin', allowed);
    if (request.method === 'OPTIONS') {
      headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
      headers.set('access-control-allow-headers', 'Content-Type');
      return new Response(null, { status: 204, headers });
    }
    const route = new URL(request.url).pathname;
    if (!env.AI || !env.SCAN_RATE_LIMITER || !env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return reply(503, { code: 'setup', error: 'اسکن هنوز آماده نیست؛ فعلاً آیتم‌ها را دستی وارد کن.' });
    if (route === '/config' && request.method === 'GET') return reply(200, { siteKey: env.TURNSTILE_SITE_KEY });
    if (route !== '/scan') return reply(404, { code: 'not-found', error: 'مسیر پیدا نشد.' });
    if (request.method !== 'POST') return reply(405, { code: 'method', error: 'روش درخواست مجاز نیست.' });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { code: 'type', error: 'نوع درخواست درست نیست.' });
    // A conservative anonymous limit; an IP may represent multiple people on a mobile network.
    try {
      const { success } = await env.SCAN_RATE_LIMITER.limit({ key: `scan:${request.headers.get('cf-connecting-ip') ?? 'unknown'}` });
      if (!success) { headers.set('retry-after', '60'); return reply(429, { code: 'rate', error: 'چند لحظه صبر کن و دوباره عکس را بخوان.' }); }
    } catch { return reply(503, { code: 'rate', error: 'اسکن فعلاً در دسترس نیست؛ چند لحظه بعد تلاش کن.' }); }
    let body: { image?: unknown; token?: unknown };
    try { body = await readBody(request) as typeof body; }
    catch (e) { return reply(e instanceof RangeError ? 413 : 400, { code: 'body', error: e instanceof RangeError ? 'حجم عکس زیاد است؛ عکس کوچک‌تری انتخاب کن.' : 'درخواست اسکن نامعتبر است.' }); }
    if (!body || typeof body !== 'object' || !imageData(body.image) || typeof body.token !== 'string' || !body.token || body.token.length > 2048) return reply(400, { code: 'input', error: 'عکس یا تأیید امنیتی معتبر نیست.' });
    let verified: { success?: boolean; hostname?: string; action?: string };
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: body.token }), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('turnstile');
      verified = await response.json() as typeof verified;
    } catch { return reply(503, { code: 'verify', error: 'تأیید امنیتی در دسترس نیست؛ دوباره تلاش کن.' }); }
    if (!verified.success || verified.hostname !== new URL(allowed).hostname || verified.action !== 'receipt-scan') return reply(403, { code: 'verify', error: 'تأیید امنیتی منقضی شد؛ دوباره تلاش کن.' });
    try {
      const response = await env.AI.run(MODEL, {
        messages: [ { role: 'system', content: SCAN_PROMPT }, { role: 'user', content: [ { type: 'text', text: 'Extract this receipt using the exact JSON fields requested.' }, { type: 'image_url', image_url: { url: body.image } } ] } ],
        max_completion_tokens: 2500, chat_template_kwargs: { enable_thinking: false }, response_format: { type: 'json_object' },
      });
      return reply(200, { receipt: parseModelReceipt(response), usage: scanUsage(response) });
    } catch (e) {
      // Never echo upstream errors: they can contain request data. Do not log images or receipt text.
      const message = e instanceof Error ? e.message : '';
      const quota = /quota|neuron|daily|3042|limit exceeded/i.test(message);
      return reply(quota ? 429 : 502, { code: quota ? 'quota' : 'ai', error: quota ? 'سهمیهٔ اسکن فعلاً تمام شده؛ آیتم‌ها را دستی وارد کن یا بعداً امتحان کن.' : 'عکس خوانده نشد؛ عکس واضح‌تری امتحان کن یا دستی وارد کن.' });
    }
  },
};
