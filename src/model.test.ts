import { describe, expect, it } from 'vitest';
import { calculate, parseAmount, removeGuest, restoreDraft } from './model';
import type { Draft } from './model';
const fixture = (): Draft => ({ version: 1, step: 4, mirza: { id: 'm', name: 'مهدی' }, payer: 'عرفان', guests: [{ id: 'a', name: 'علی' }, { id: 'b', name: 'سارا' }], invoices: [{ id: 'f', name: 'کافه', items: [{ id: 'i', name: 'قهوه', amountInput: '۱۰۰٬۰۰۰', sharedBy: ['b', 'a', 'm'] }] }] });
describe('exact ledger', () => {
  it('parses all three numeral systems and rejects invalid amounts', () => {
    for (const v of ['۱۲۳٬۴۵۶', '١٢٣٤٥٦', '123,456']) expect(parseAmount(v)).toBe(123456);
    for (const v of ['', '0', '-10', '1.5', '۱٫۵', 'abc', '9007199254740992']) expect(parseAmount(v)).toBeNull();
  });
  it('shares remainder in participant order, never selection order', () => {
    expect(calculate(fixture()).rows.map(p => p.amount)).toEqual([33334, 33333, 33333]);
  });
  it('supports single-person items, selectable Mirza and multiple invoices', () => {
    const d = fixture(); d.invoices[0].items[0].sharedBy = ['a'];
    d.invoices.push({ id: 'f2', name: 'رستوران', items: [{ id: 'i2', name: 'غذا', amountInput: '9', sharedBy: ['m', 'b'] }] });
    const result = calculate(d);
    expect(result.rows.map(p => p.amount)).toEqual([5, 100000, 4]);
    expect(result.rows.reduce((s, p) => s + p.amount, 0)).toBe(result.total);
    expect(result.rows.some(p => p.name === d.payer)).toBe(false);
  });
  it('keeps conservation across arbitrary amounts and participant subsets', () => {
    for (let amount = 1; amount < 1000; amount += 7) {
      const d = fixture(); d.invoices[0].items[0].amountInput = String(amount);
      const r = calculate(d); expect(r.rows.reduce((s, p) => s + p.amount, 0)).toBe(amount);
    }
  });
  it('preserves links after renaming; cleans links on removal', () => {
    const d = fixture(); d.guests[0].name = 'علی رضایی';
    expect(calculate(d).rows[1].amount).toBe(33333);
    const removed = removeGuest(d, 'a'); expect(removed.invoices[0].items[0].sharedBy).toEqual(['b', 'm']);
  });
  it('rejects incomplete data, duplicate names, unknown people and empty selection', () => {
    const d = fixture(); d.invoices[0].items[0].sharedBy = []; expect(() => calculate(d)).toThrow('حداقل یک شریک');
    d.invoices[0].items[0].sharedBy = ['missing']; expect(() => calculate(d)).toThrow();
    d.guests[0].name = d.mirza.name; expect(() => calculate(d)).toThrow('تکراری');
    d.guests[0].name = ''; expect(() => calculate(d)).toThrow('کامل');
  });
  it('rejects aggregate overflow', () => {
    const d = fixture(); d.invoices[0].items[0].amountInput = String(Number.MAX_SAFE_INTEGER);
    d.invoices[0].items.push({ id: 'i2', name: 'چای', amountInput: '1', sharedBy: ['m'] });
    expect(() => calculate(d)).toThrow('محدوده');
  });
  it('roundtrips drafts and rejects corrupt storage', () => {
    expect(restoreDraft(JSON.stringify(fixture()))).toEqual(fixture());
    for (const raw of ['{', '{}', 'null', '{"version":2}']) expect(restoreDraft(raw)).toBeNull();
  });
  it('supports twelve guests plus Mirza', () => {
    const d = fixture(); d.guests = Array.from({ length: 12 }, (_, n) => ({ id: `p${n}`, name: `نفر ${n}` }));
    d.invoices[0].items[0].sharedBy = [d.mirza.id, ...d.guests.map(p => p.id)];
    expect(calculate(d).rows).toHaveLength(13);
    expect(calculate(d).rows.reduce((s, p) => s + p.amount, 0)).toBe(100000);
  });
});
