// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Storage } from 'happy-dom';
import App from './App';
import { prepareScanImage, scanConfig, scanImage } from './scan';
import { freshDraft, newInvoice, STORAGE_KEY } from './model';
vi.mock('./scan', async importOriginal => ({ ...await importOriginal<typeof import('./scan')>(), prepareScanImage: vi.fn(), scanConfig: vi.fn(), scanImage: vi.fn() }));
vi.mock('./Turnstile', async () => {
  const { useEffect } = await import('react');
  return { default: ({ onToken }: { onToken: (value: string) => void }) => { useEffect(() => onToken('test-token'), [onToken]); return <div>تأیید آزمایشی</div>; } };
});
beforeEach(() => {
  vi.stubEnv('VITE_SCAN_API_URL', 'https://scan.example'); vi.stubGlobal('localStorage', new Storage());
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  Element.prototype.scrollIntoView = vi.fn(); HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.mocked(scanConfig).mockResolvedValue({ siteKey: 'public-key' }); vi.mocked(prepareScanImage).mockResolvedValue('data:image/jpeg;base64,/9j/AAAA');
  vi.mocked(scanImage).mockResolvedValue({ receipt: { title: 'کافه اسکن', unit: 'unknown', items: [ { name: 'چای', quantity: 3, total: 900000 }, { name: 'آیتم ناخوانا', quantity: 1, total: null } ], charges: [{ name: 'مالیات', kind: 'tax', amount: 90000 }], printedTotal: 1090000, warnings: ['مبلغ یک ردیف خوانا نیست.'] } });
  const draft = freshDraft(); draft.mirza.name = 'مهدی'; draft.payer = 'عرفان'; draft.guests[0].name = 'سارا'; draft.guests[1].name = 'علی'; draft.step = 4;
  draft.invoices = [newInvoice(draft), newInvoice(draft)]; draft.invoices[0].items[0].sharedBy = draft.guests.map(p => p.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function extract() {
  fireEvent.click(within(screen.getByRole('region', { name: 'فاکتور ۱' })).getByRole('button', { name: /اسکنش کن/ }));
  await waitFor(() => expect(screen.getByLabelText('انتخاب از گالری').hasAttribute('disabled')).toBe(false));
  fireEvent.change(screen.getByLabelText('انتخاب از گالری'), { target: { files: [new File(['photo'], 'receipt.jpg', { type: 'image/jpeg' })] } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'عکس را بخوان' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'عکس را بخوان' }));
  await screen.findByRole('textbox', { name: 'نام ردیف ۱' });
}
describe('scan preview in the existing invoice form', () => {
  it('requires unit, amount correction and confirmation before adding exactly the reviewed rows', async () => {
    render(<App />); await extract();
    expect(scanImage).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('مبلغ کل ردیف ۱').getAttribute('value')).toBe('900000');
    expect(screen.getByRole('button', { name: 'افزودن ۳ آیتم به فاکتور' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('واحد مبلغ روی عکس'), { target: { value: 'rial' } });
    fireEvent.change(screen.getByLabelText('مبلغ کل ردیف ۲ · ریال'), { target: { value: '100000' } });
    fireEvent.change(screen.getByLabelText('نام ردیف ۲'), { target: { value: 'کیک اصلاح‌شده' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /نام‌ها، مبلغ‌ها و واحد پول/ }));
    fireEvent.click(screen.getByRole('button', { name: 'افزودن ۳ آیتم به فاکتور' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const first = screen.getByRole('region', { name: 'فاکتور ۱' });
    expect(within(first).getAllByRole('textbox', { name: /^آیتم/ })).toHaveLength(3);
    expect(within(first).getAllByRole('textbox', { name: 'مبلغ به تومان' }).map(input => (input as HTMLInputElement).value)).toEqual(['90000', '10000', '9000']);
    expect(within(first).getByRole('textbox', { name: 'اسم فاکتور ۱' }).getAttribute('value')).toBe('کافه اسکن');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.invoices[0].items.every((item: { sharedBy: string[] }) => !item.sharedBy.includes('mirza'))).toBe(true);
    expect(saved.invoices[1].items).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /اسکنش کن/ })).toHaveLength(2);
  });
  it('lets users exclude unreadable rows and cancel without changing the account', async () => {
    const original = localStorage.getItem(STORAGE_KEY); render(<App />); await extract();
    fireEvent.click(screen.getByRole('checkbox', { name: /ردیف ۲/ }));
    fireEvent.click(screen.getByRole('button', { name: 'برگشت به دفتر' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('leaves manual entry intact when the service is unavailable or offline', async () => {
    vi.mocked(scanConfig).mockRejectedValue(new Error('اسکن فعلاً در دسترس نیست'));
    render(<App />); fireEvent.click(within(screen.getByRole('region', { name: 'فاکتور ۱' })).getByRole('button', { name: /اسکنش کن/ }));
    await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'برگشت به دفتر' }));
    fireEvent.change(within(screen.getByRole('region', { name: 'فاکتور ۱' })).getByRole('textbox', { name: 'آیتم ۱' }), { target: { value: 'ورود دستی' } });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).invoices[0].items[0].name).toBe('ورود دستی');
  });
});
