// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Storage } from 'happy-dom';
import App from './App';
import { STORAGE_KEY } from './model';
beforeEach(() => {
  vi.stubGlobal('localStorage', new Storage());
  localStorage.clear();
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: true, addListener: vi.fn(), removeListener: vi.fn() }) });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
async function fillPeople() {
  fireEvent.change(screen.getByRole('textbox', { name: 'اسم میرزا' }), { target: { value: 'مهدی' } }); click('دفتر را باز کن');
  fireEvent.change(screen.getByRole('textbox', { name: 'اسم سفره‌دار' }), { target: { value: 'عرفان' } }); click('بریم سراغ اهلِ سفره');
  fireEvent.change(screen.getByRole('textbox', { name: 'اسم ریزه‌خوار ۱' }), { target: { value: 'سارا' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'اسم ریزه‌خوار ۲' }), { target: { value: 'علی' } }); click('حالا، فاکتورها');
}
describe('user journey', () => {
  it('validates names, completes the four stages and settles the exact shares', async () => {
    render(<App />); click('دفتر را باز کن'); expect(screen.getByRole('alert').textContent).toContain('اسم');
    await fillPeople();
    fireEvent.change(screen.getByRole('textbox', { name: 'اسم فاکتور ۱' }), { target: { value: 'کافه سمفونی' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'آیتم ۱' }), { target: { value: 'قهوه' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'مبلغ به تومان' }), { target: { value: '۱۰۰٬۰۰۰' } });
    expect(within(screen.getByRole('group', { name: /چه کسانی/ })).queryByRole('button', { name: 'عرفان' })).toBeNull();
    click('میرزا، حساب کن!'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(screen.getByRole('button', { name: 'دانلود تصویرِ رسید' })).toBeTruthy();
    expect(screen.getByText('۳۳٬۳۳۴')).toBeTruthy(); expect(screen.getAllByText('۳۳٬۳۳۳')).toHaveLength(2);
    click('برگشت و اصلاح حساب'); expect(screen.getByRole('textbox', { name: 'آیتم ۱' }).getAttribute('value')).toBe('قهوه');
  });
  it('recovers a saved draft and requires confirmation before resetting', async () => {
    const first = render(<App />); await fillPeople();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).mirza.name).toBe('مهدی');
    first.unmount(); render(<App />); expect(screen.getByRole('textbox', { name: 'اسم فاکتور ۱' })).toBeTruthy();
    click('حساب جدید'); expect(screen.getByRole('dialog')).toBeTruthy();
    click('همین دفتر را نگه دار'); expect(screen.queryByRole('dialog')).toBeNull();
    click('حساب جدید'); click('پاک کن و حساب جدید بساز'); expect(screen.getByRole('textbox', { name: 'اسم میرزا' }).getAttribute('value')).toBe('');
  });
  it('supports selectable Mirza and blocks items with no partners', async () => {
    render(<App />); await fillPeople();
    fireEvent.change(screen.getByRole('textbox', { name: 'اسم فاکتور ۱' }), { target: { value: 'کافه' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'آیتم ۱' }), { target: { value: 'چای' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'مبلغ به تومان' }), { target: { value: '90' } });
    const group = screen.getByRole('group', { name: /چه کسانی/ });
    for (const p of ['میرزا مهدی', 'سارا', 'علی']) fireEvent.click(within(group).getByRole('button', { name: p }));
    click('میرزا، حساب کن!'); expect(screen.getByRole('alert').textContent).toContain('حداقل یک شریک');
    fireEvent.click(within(group).getByRole('button', { name: 'علی' })); click('میرزا، حساب کن!');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(screen.getAllByText('سهمی از آیتم‌ها ندارد')).toHaveLength(2); expect(screen.getByText('۹۰', { selector: '.settlement-row strong' })).toBeTruthy();
  });
  it('plays and resets the abacus', () => {
    render(<App />); click('مهرهٔ پنج‌تایی ستون 5');
    expect(screen.getByText('۵', { selector: 'output' })).toBeTruthy();
    click('ستون 5، 2 مهرهٔ یک‌تایی'); expect(screen.getByText('۷', { selector: 'output' })).toBeTruthy();
    click('صفر کن'); expect(screen.getByText('۰', { selector: 'output' })).toBeTruthy();
  });
});
