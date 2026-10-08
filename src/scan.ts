import { MAX_IMAGE_BYTES, validateReceipt } from '../shared/scan';
import type { MoneyUnit, ScanResult } from '../shared/scan';
import { cleanName, parseAmount, participants, uid } from './model';
import type { Draft, Invoice } from './model';

export interface ReviewedLine { name: string; amountInput: string; include: boolean }
export interface ReviewedScan { title: string; unit: MoneyUnit; lines: ReviewedLine[] }
export const scanApiUrl = () => (import.meta.env.VITE_SCAN_API_URL ?? '').trim().replace(/\/$/, '');
export function toToman(input: string, unit: MoneyUnit): number | null {
  const value = parseAmount(input);
  if (value === null || unit === 'unknown') return null;
  const toman = unit === 'rial' ? value / 10 : value;
  return Number.isSafeInteger(toman) && toman > 0 ? toman : null;
}
export function reviewError(scan: ReviewedScan): string | null {
  if (scan.unit === 'unknown') return 'واحد مبلغ روی فاکتور را انتخاب کن: ریال یا تومان.';
  const selected = scan.lines.filter(line => line.include);
  if (!selected.length) return 'حداقل یک آیتم برای افزودن انتخاب کن.';
  if (selected.some(line => !cleanName(line.name))) return 'نام آیتم‌های انتخاب‌شده را کامل کن.';
  if (selected.some(line => toToman(line.amountInput, scan.unit) === null)) return 'مبلغ‌ها باید مثبت باشند و پس از تبدیل، تومانِ صحیح شوند؛ مبلغ نامشخص را اصلاح کن.';
  const sum = selected.reduce((total, line) => total + toToman(line.amountInput, scan.unit)!, 0);
  if (!Number.isSafeInteger(sum)) return 'جمع مبلغ‌ها از محدودهٔ محاسبهٔ دقیق بزرگ‌تر است.';
  return null;
}
export function appendScan(draft: Draft, invoiceId: string, scan: ReviewedScan): Draft {
  const error = reviewError(scan);
  if (error) throw new Error(error);
  const invoice = draft.invoices.find(f => f.id === invoiceId);
  if (!invoice) throw new Error('این فاکتور دیگر در دفتر نیست.');
  // Match the existing per-invoice add-item behavior, including legacy mixed selections.
  const sharedBy = participants(draft).filter(p => !invoice.items.length || invoice.items.some(item => item.sharedBy.includes(p.id))).map(p => p.id);
  const imported = scan.lines.filter(line => line.include).map(line => ({ id: uid(), name: cleanName(line.name), amountInput: String(toToman(line.amountInput, scan.unit)), sharedBy: [...sharedBy] }));
  const revised: Invoice = { ...invoice, name: cleanName(invoice.name) ? invoice.name : cleanName(scan.title), items: [ ...invoice.items.filter(item => cleanName(item.name) || item.amountInput.trim()), ...imported ] };
  return { ...draft, invoices: draft.invoices.map(f => f.id === invoiceId ? revised : f) };
}

function checkCancelled(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('خواندن عکس ممکن نشد.')); reader.readAsDataURL(blob); });
}
export async function prepareScanImage(file: File, signal: AbortSignal): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('عکس JPG، PNG یا WebP انتخاب کن. عکس HEIC را به JPG تبدیل کن.');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('حجم عکس باید کمتر از ۱۰ مگابایت باشد.');
  checkCancelled(signal);
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
    checkCancelled(signal);
    if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 36_000_000) throw new Error('ابعاد عکس زیاد است؛ عکس کوچک‌تری انتخاب کن.');
    const ratio = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * ratio); canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('آماده‌کردن عکس در این مرورگر ممکن نیست.');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [.88, .76, .64]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      checkCancelled(signal);
      if (blob && blob.size <= MAX_IMAGE_BYTES) { const data = await blobDataUrl(blob); checkCancelled(signal); return data; }
    }
    throw new Error('عکس هنوز بزرگ است؛ فقط قسمت فاکتور را عکس بگیر.');
  } catch (e) {
    if (e instanceof DOMException && e.name !== 'AbortError') throw new Error('عکس باز نشد؛ یک عکس JPG واضح انتخاب کن.');
    throw e;
  } finally { URL.revokeObjectURL(url); }
}
async function api(path: string, options: RequestInit): Promise<unknown> {
  const base = scanApiUrl();
  if (!base) throw new Error('اسکن عکس هنوز فعال نشده؛ فعلاً آیتم‌ها را دستی وارد کن.');
  if (!base.startsWith('https://') && !import.meta.env.DEV) throw new Error('نشانی اسکن امن نیست.');
  if (!navigator.onLine) throw new Error('برای اسکن عکس به اینترنت وصل شو؛ ورود دستی همچنان در دسترس است.');
  let response: Response;
  try { response = await fetch(`${base}${path}`, { ...options, cache: 'no-store', credentials: 'omit' }); }
  catch (e) { if (e instanceof DOMException && e.name === 'AbortError') throw e; throw new Error('اتصال به اسکن برقرار نشد؛ اینترنت را بررسی کن و دوباره تلاش کن.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body && typeof body.error === 'string' && body.error.length < 500 ? body.error : 'اسکن فعلاً در دسترس نیست؛ بعداً امتحان کن.');
  return body;
}
export async function scanConfig(signal: AbortSignal): Promise<{ siteKey: string }> {
  const data = await api('/config', { signal }) as { siteKey?: unknown } | null;
  if (!data || typeof data.siteKey !== 'string' || !data.siteKey) throw new Error('اسکن هنوز آماده نیست؛ فعلاً دستی وارد کن.');
  return { siteKey: data.siteKey };
}
export async function scanImage(image: string, token: string, signal: AbortSignal): Promise<ScanResult> {
  const data = await api('/scan', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, token }) }) as ScanResult | null;
  if (!data) throw new Error('پاسخ اسکن خالی بود.');
  return { receipt: validateReceipt(data.receipt), usage: data.usage };
}
