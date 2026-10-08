import { describe, expect, it } from 'vitest';
import { appendScan, reviewError, toToman } from './scan';
import { calculate, freshDraft, newInvoice, setMirzaParticipation } from './model';
import { parseModelReceipt, scanUsage, validateReceipt } from '../shared/scan';
const extracted = { title: 'کافه آزمایشی', unit: 'unknown', items: [{ name: 'چای', quantity: 3, total: 900000 }], charges: [{ name: 'مالیات', kind: 'tax', amount: 90000 }], printedTotal: 990000, warnings: [] };
describe('receipt extraction and import', () => {
  it('imports scanned items without adding an accountant-only Mirza back to the account', () => {
    let draft = freshDraft(); draft.mirza.name = 'مهدی'; draft.payer = 'عرفان'; draft.guests[0].name = 'سارا'; draft.guests[1].name = 'علی';
    draft.invoices = [newInvoice(draft)]; draft = setMirzaParticipation(draft, false);
    const scanned = appendScan(draft, draft.invoices[0].id, { title: 'کافه', unit: 'toman', lines: [{ name: 'چای', amountInput: '90', include: true }] });
    expect(scanned.invoices[0].items[0].sharedBy).toEqual(draft.guests.map(p => p.id));
    expect(calculate(scanned).rows.map(p => p.amount)).toEqual([45, 45]);
  });
  it('parses current chat and legacy envelopes and rejects incomplete or unsafe results', () => {
    expect(parseModelReceipt({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(extracted) } }] }).items[0].total).toBe(900000);
    expect(parseModelReceipt({ response: '```json\n'+JSON.stringify(extracted)+'\n```' }).unit).toBe('unknown');
    expect(() => parseModelReceipt({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(extracted) } }] })).toThrow();
    expect(() => validateReceipt({ ...extracted, items: [] })).toThrow();
    expect(() => validateReceipt({ ...extracted, items: [{ name: 'چای', quantity: 3, total: Number.MAX_SAFE_INTEGER + 1 }] })).toThrow();
    expect(() => validateReceipt({ ...extracted, items: [{ name: 'چای', quantity: 3, total: -10 }] })).toThrow();
  });
  it('preserves an unknown unit and nullable amounts for explicit correction', () => {
    const receipt = validateReceipt({ ...extracted, items: [{ name: 'نامشخص', quantity: null, total: null }] });
    expect(receipt.items[0].total).toBeNull();
    expect(toToman('900000', receipt.unit)).toBeNull();
    expect(toToman('۹۰۰٬۰۰۰', 'rial')).toBe(90000);
    expect(toToman('٩٠٠٠٠', 'toman')).toBe(90000);
    expect(toToman('۹۰۱', 'rial')).toBeNull();
  });
  it('adds one line total per purchased row without multiplying quantity and keeps invoice partners', () => {
    const draft = freshDraft(); draft.mirza.name = 'مهدی'; draft.payer = 'عرفان'; draft.guests[0].name = 'سارا'; draft.guests[1].name = 'علی';
    const first = newInvoice(draft), second = newInvoice(draft); draft.invoices = [first, second];
    first.items[0].sharedBy = draft.guests.map(p => p.id); // Mirza excluded by the invoice selection.
    const scanned = appendScan(draft, first.id, { title: 'کافه آزمایشی', unit: 'rial', lines: [ { name: 'چای (سه سفارش)', amountInput: '900000', include: true }, { name: 'مالیات', amountInput: '90000', include: true } ] });
    expect(scanned.invoices[0].items).toHaveLength(2); // Blank starter removed.
    expect(scanned.invoices[0].items.map(i => i.amountInput)).toEqual(['90000', '9000']);
    expect(scanned.invoices[0].items.every(i => i.sharedBy.length === 2 && !i.sharedBy.includes('mirza'))).toBe(true);
    expect(scanned.invoices[1]).toEqual(second);
    scanned.invoices.pop(); expect(calculate(scanned).total).toBe(99000);
    expect(new Set(scanned.invoices[0].items.map(i => i.id)).size).toBe(2);
  });
  it('retains existing title, manual items and legacy mixed selections without modifying the original', () => {
    const draft = freshDraft(); const invoice = newInvoice(draft); draft.invoices = [invoice];
    invoice.name = 'اسم قبلی'; invoice.items[0].name = 'آیتم دستی'; invoice.items[0].amountInput = '100';
    const revised = appendScan(draft, invoice.id, { title: 'اسم اسکن', unit: 'toman', lines: [{ name: 'ردیف حذف‌شده', amountInput: '50', include: false }, { name: 'آیتم تازه', amountInput: '300', include: true }] });
    expect(revised.invoices[0].name).toBe('اسم قبلی'); expect(revised.invoices[0].items).toHaveLength(2);
    expect(revised.invoices[0].items[0]).toEqual(invoice.items[0]); expect(draft.invoices[0].items).toHaveLength(1);
  });
  it('blocks invalid, empty, fractional toman and overflowing imports', () => {
    const base = { title: 'کافه', unit: 'toman' as const, lines: [{ name: 'چای', amountInput: '0', include: true }] };
    expect(reviewError(base)).toBeTruthy(); expect(reviewError({ ...base, lines: [] })).toBeTruthy();
    expect(reviewError({ ...base, unit: 'unknown' })).toBeTruthy();
    expect(reviewError({ ...base, lines: [{ name: '', amountInput: '100', include: true }] })).toBeTruthy();
    expect(reviewError({ ...base, lines: [1, 2].map(() => ({ name: 'چای', amountInput: String(Number.MAX_SAFE_INTEGER), include: true })) })).toBeTruthy();
    expect(() => appendScan(freshDraft(), 'deleted', { ...base, lines: [{ name: 'چای', amountInput: '100', include: true }] })).toThrow();
  });
  it('derives approximate usage only from actual valid response token counts', () => {
    expect(scanUsage({ usage: { prompt_tokens: 2000, completion_tokens: 800 } })).toEqual({ inputTokens: 2000, outputTokens: 800, estimatedNeurons: 40 });
    expect(scanUsage({ usage: { prompt_tokens: -1, completion_tokens: 800 } })).toBeUndefined();
    expect(scanUsage({})).toBeUndefined();
  });
});
