export interface Person { id: string; name: string }
export interface Item { id: string; name: string; amountInput: string; sharedBy: string[] }
export interface Invoice { id: string; name: string; items: Item[] }
export interface Draft { version: 1; mirza: Person; payer: string; guests: Person[]; invoices: Invoice[]; step: number }
export interface Settlement { total: number; rows: (Person & { amount: number; isMirza: boolean })[] }
export const STORAGE_KEY = 'hesab-ketab:draft:v1';
export const uid = () => crypto.randomUUID();
export const format = (value: number) => new Intl.NumberFormat('fa-IR').format(value);
export const cleanName = (value: string) => value.trim().replace(/\s+/g, ' ').normalize('NFC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
export function parseAmount(input: string): number | null {
  const normalized = input.replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[,٬\s]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
export const participants = (draft: Draft) => [draft.mirza, ...draft.guests];
export const newItem = (draft: Draft): Item => ({ id: uid(), name: '', amountInput: '', sharedBy: participants(draft).map(p => p.id) });
export const newInvoice = (draft: Draft): Invoice => ({ id: uid(), name: '', items: [newItem(draft)] });
export function freshDraft(): Draft {
  return { version: 1, mirza: { id: 'mirza', name: '' }, payer: '', guests: [{ id: uid(), name: '' }, { id: uid(), name: '' }], invoices: [], step: 1 };
}
export function peopleError(draft: Draft): string | null {
  if (!cleanName(draft.mirza.name)) return 'اسم میرزای حساب و کتاب را بنویس.';
  if (!cleanName(draft.payer)) return 'اسم سفره‌دار را بنویس.';
  if (draft.guests.length < 2 || draft.guests.length > 12) return 'تعداد ریزه‌خواران باید بین ۲ تا ۱۲ نفر باشد.';
  if (draft.guests.some(p => !cleanName(p.name))) return 'اسم همهٔ ریزه‌خواران را کامل کن.';
  const names = participants(draft).map(p => cleanName(p.name));
  if (new Set(names).size !== names.length) return 'اسم شریک‌ها تکراری است؛ برای تشخیص، نام کامل‌تری بنویس.';
  return null;
}
export function calculate(draft: Draft): Settlement {
  const error = peopleError(draft);
  if (error) throw new Error(error);
  if (!draft.invoices.length) throw new Error('حداقل یک فاکتور اضافه کن.');
  const rows = participants(draft).map(p => ({ ...p, name: cleanName(p.name), amount: 0, isMirza: p.id === draft.mirza.id }));
  let total = 0;
  for (const invoice of draft.invoices) {
    if (!cleanName(invoice.name)) throw new Error('اسم همهٔ فاکتورها را بنویس.');
    if (!invoice.items.length) throw new Error(`فاکتور «${invoice.name}» آیتم ندارد.`);
    for (const item of invoice.items) {
      if (!cleanName(item.name)) throw new Error(`اسم آیتم‌های «${invoice.name}» را کامل کن.`);
      const amount = parseAmount(item.amountInput);
      if (amount === null) throw new Error(`مبلغ «${item.name}» باید تومانِ صحیح و بیشتر از صفر باشد.`);
      const sharing = rows.filter(p => item.sharedBy.includes(p.id));
      if (!sharing.length) throw new Error(`برای «${item.name}» حداقل یک شریک انتخاب کن.`);
      if (item.sharedBy.some(id => !rows.some(p => p.id === id))) throw new Error(`شریک‌های «${item.name}» را دوباره انتخاب کن.`);
      if (!Number.isSafeInteger(total + amount)) throw new Error('جمع مبالغ از محدودهٔ محاسبهٔ دقیق بزرگ‌تر است.');
      total += amount;
      // Integer arithmetic keeps the ledger balanced down to the last toman.
      const base = Math.floor(amount / sharing.length);
      const remainder = amount % sharing.length;
      sharing.forEach((p, i) => { p.amount += base + (i < remainder ? 1 : 0); });
    }
  }
  return { total, rows };
}
export function removeGuest(draft: Draft, id: string): Draft {
  return { ...draft, guests: draft.guests.filter(p => p.id !== id), invoices: draft.invoices.map(f => ({ ...f, items: f.items.map(i => ({ ...i, sharedBy: i.sharedBy.filter(key => key !== id) })) })) };
}
export function restoreDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    const isPerson = (p: Person) => p && typeof p.id === 'string' && p.id.length > 0 && typeof p.name === 'string';
    if (!d || d.version !== 1 || !isPerson(d.mirza) || typeof d.payer !== 'string' || !Array.isArray(d.guests) || d.guests.length < 2 || d.guests.length > 12 || !d.guests.every(isPerson) || !Array.isArray(d.invoices) || !Number.isInteger(d.step) || d.step < 1 || d.step > 4) return null;
    if (new Set(participants(d).map(p => p.id)).size !== participants(d).length) return null;
    const ids = new Set<string>();
    for (const f of d.invoices) {
      if (!f || typeof f.id !== 'string' || ids.has(f.id) || typeof f.name !== 'string' || !Array.isArray(f.items)) return null;
      ids.add(f.id);
      for (const i of f.items) {
        if (!i || typeof i.id !== 'string' || ids.has(i.id) || typeof i.name !== 'string' || typeof i.amountInput !== 'string' || !Array.isArray(i.sharedBy) || !i.sharedBy.every(key => typeof key === 'string')) return null;
        ids.add(i.id);
      }
    }
    return d;
  } catch { return null; }
}
