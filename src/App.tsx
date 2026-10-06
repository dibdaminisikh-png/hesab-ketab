import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import Abacus from './Abacus';
import { calculate, cleanName, format, freshDraft, newInvoice, newItem, parseAmount, participants, peopleError, removeGuest, restoreDraft, STORAGE_KEY, uid } from './model';
import type { Draft, Invoice, Item, Settlement } from './model';
import { downloadReceipt } from './receipt';
const asset = (name: string) => `${import.meta.env.BASE_URL}art/${name}`;
const titles = ['میرزا', 'سفره‌دار', 'ریزه‌خواران', 'فاکتورها'];
function Icon({ name }: { name: 'plus' | 'close' | 'check' | 'download' | 'edit' | 'book' | 'reset' }) {
  const paths = { plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M18 6 6 18', check: 'm5 12 4 4 10-10', download: 'M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4', edit: 'm15 5 4 4M4 20l4-1L20 7l-4-4L4 15v5', book: 'M4 4h6l2 2 2-2h6v16h-6l-2 1-2-1H4V4Zm8 2v15', reset: 'M4 10a8 8 0 1 1 1 8M4 4v6h6' };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Character({ kind, className = '' }: { kind: number; className?: string }) {
  return <img className={`character character-${kind} ${className}`} src={asset(`character-${kind}.webp`)} alt="" aria-hidden="true" />;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export default function App() {
  const [draft, setDraft] = useState<Draft>(() => { try { return restoreDraft(localStorage.getItem(STORAGE_KEY)) ?? freshDraft(); } catch { return freshDraft(); } });
  const [storageIssue, setStorageIssue] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Settlement | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const modalCancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); setStorageIssue(false); } catch { setStorageIssue(true); } }, [draft]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (confirmReset) modalCancel.current?.focus(); }, [confirmReset]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  const update = (change: Partial<Draft>) => { setDraft(d => ({ ...d, ...change })); setError(''); };
  const focusPanel = () => requestAnimationFrame(() => { panel.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); heading.current?.focus({ preventScroll: true }); });
  function go(step: number) { update({ step }); focusPanel(); }
  function next(e: FormEvent) {
    e.preventDefault();
    if (draft.step === 1 && !cleanName(draft.mirza.name)) { setError('اول اسم میرزای حساب و کتاب را بنویس.'); return; }
    if (draft.step === 2 && !cleanName(draft.payer)) { setError('اسم سفره‌دار را بنویس.'); return; }
    if (draft.step === 3) { const message = peopleError(draft); if (message) { setError(message); return; } }
    if (draft.step === 3 && !draft.invoices.length) update({ invoices: [newInvoice(draft)], step: 4 }); else go(draft.step + 1);
    focusPanel();
  }
  function updateInvoice(id: string, change: Partial<Invoice>) { update({ invoices: draft.invoices.map(f => f.id === id ? { ...f, ...change } : f) }); }
  function updateItem(invoiceId: string, itemId: string, change: Partial<Item>) { update({ invoices: draft.invoices.map(f => f.id === invoiceId ? { ...f, items: f.items.map(i => i.id === itemId ? { ...i, ...change } : i) } : f) }); }
  function compute() {
    try {
      const settlement = calculate(draft); setError(''); setCelebrating(true); setBusy(true);
      timer.current = setTimeout(() => { setResult(settlement); setCelebrating(false); setBusy(false); focusPanel(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1000);
    } catch (e) { setError((e as Error).message); requestAnimationFrame(() => document.getElementById('form-error')?.scrollIntoView({ block: 'nearest' })); }
  }
  const currentPeople = participants(draft);
  const enteredTotal = draft.invoices.reduce((total, f) => total + f.items.reduce((s, i) => s + (parseAmount(i.amountInput) ?? 0), 0), 0);
  const unlocked = !cleanName(draft.mirza.name) ? 1 : !cleanName(draft.payer) ? 2 : peopleError(draft) ? 3 : 4;
  async function download() {
    if (!result) return;
    setBusy(true); setError('');
    try { setImageUrl(await downloadReceipt(draft, result)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function reset() { setDraft(freshDraft()); setResult(null); setError(''); setConfirmReset(false); setImageUrl(null); focusPanel(); }
  return <div className="app-shell">
    <a className="skip-link" href="#ledger">رفتن به دفتر حساب</a>
    <header className="topbar">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="حساب کتاب، خانه"><span className="brand-icon"><Icon name="book" /></span><span>حساب کتاب<small>دفترِ دورهمی‌ها</small></span></a>
      <button ref={resetButton} type="button" className="new-account" disabled={busy} onClick={() => setConfirmReset(true)}><Icon name="reset" /><span>حساب جدید</span></button>
    </header>
    <main className="game-layout">
      <aside className="scene" aria-label="حیاط دفتر میرزا">
        <div className="scene-image" />
        <div className="scene-shade" />
        <div className="hanging-sign"><span className="sign-small">بفرمایید به</span><strong>دفترِ میرزا</strong><span className="sign-divider" /><span>حساب روشن، رفاقت برقرار</span></div>
        <div className="scene-cast"><Character kind={1} className="scene-merchant" /><Character kind={0} className="scene-mirza" /></div>
        <div className="scene-caption">یکی حساب کند، همه خیالشان راحت!</div>
      </aside>
      <section className="ledger" id="ledger" ref={panel}>
        <div className="ledger-top"><span className="chapter-label">{result ? 'حسابِ آخر' : `پردهٔ ${format(draft.step)} از ۴`}</span><span className={`save-status ${storageIssue ? 'warning' : ''}`} role="status">{storageIssue ? 'ذخیره در این مرورگر ممکن نیست' : 'دفترت همین‌جا محفوظ است'}</span></div>
        {(cleanName(draft.mirza.name) && draft.step > 1 || result) && <div className="identity-strip">
          <button type="button" disabled={busy} onClick={() => { setResult(null); go(1); }} className="identity"><span className="identity-avatar"><Character kind={0} /></span><span><small>به قلم</small><strong>میرزا {cleanName(draft.mirza.name)}</strong></span><Icon name="edit" /></button>
          {(draft.step > 2 || result) && <button type="button" disabled={busy} className="identity" onClick={() => { setResult(null); go(2); }}><span className="identity-avatar"><Character kind={1} /></span><span><small>به حساب</small><strong>سفره‌دار {cleanName(draft.payer)}</strong></span><Icon name="edit" /></button>}
        </div>}
        {!result && <nav className="steps" aria-label="مراحل دفتر حساب">{titles.map((name, index) => <button type="button" key={name} disabled={index + 1 > unlocked || busy} className={`${draft.step === index + 1 ? 'active' : ''} ${draft.step > index + 1 ? 'complete' : ''}`} aria-current={draft.step === index + 1 ? 'step' : undefined} onClick={() => go(index + 1)}><span className="step-number">{draft.step > index + 1 ? <Icon name="check" /> : format(index + 1)}</span><span>{name}</span></button>)}</nav>}
        {error && <div className="error-note" id="form-error" role="alert">{error}</div>}
        {!result && <fieldset className="chapter chapter-controls" key={draft.step} disabled={busy}>
          {draft.step === 1 && <>
            <div className="chapter-heading"><span className="eyebrow">اول، صاحبِ دفتر</span><h1 ref={heading} tabIndex={-1}>اسمِ میرزای<br /><em>حساب و کتاب؟</em></h1><p>اسم خودت را بنویس تا دفتر به نامت شود.</p></div>
            <form onSubmit={next} className="name-form"><Field label="اسم میرزا"><input autoComplete="given-name" name="mirza" value={draft.mirza.name} onChange={e => update({ mirza: { ...draft.mirza, name: e.target.value } })} placeholder="مثلاً مهدی" maxLength={80} className="big-input" aria-invalid={!!error} /></Field><button className="primary" type="submit">دفتر را باز کن <Icon name="book" /></button></form>
            <div className="play-divider"><span>تا قلم آماده شود…</span></div><Abacus />
          </>}
          {draft.step === 2 && <>
            <div className="character-heading"><div className="chapter-heading"><span className="eyebrow">این بار، مهمانِ سفرهٔ کی بودیم؟</span><h1 ref={heading} tabIndex={-1}>سفره‌دار<br /><em>چه کسی بود؟</em></h1><p>همان که کل صورت‌حساب را پرداخت کرده.</p></div><Character kind={1} /></div>
            <form onSubmit={next} className="name-form"><Field label="اسم سفره‌دار"><input name="payer" autoComplete="off" className="big-input" value={draft.payer} onChange={e => update({ payer: e.target.value })} maxLength={80} placeholder="مثلاً عرفان" aria-invalid={!!error} /></Field><button className="primary" type="submit">بریم سراغ اهلِ سفره <Icon name="check" /></button></form>
          </>}
          {draft.step === 3 && <>
            <div className="chapter-heading"><span className="eyebrow">اهلِ سفره را صدا بزن</span><h1 ref={heading} tabIndex={-1}>ریزه‌خوارانِ <em>عزیز!</em></h1><p>۲ تا ۱۲ نفر؛ میرزا هم جداگانه شریک حساب است.</p></div>
            <div className="crowd"><Character kind={2} /><Character kind={3} /><Character kind={4} /></div>
            <form onSubmit={next}><div className="guest-list">{draft.guests.map((guest, index) => <div className="guest-row" key={guest.id}><span className="guest-number">{format(index + 1)}</span><label className="sr-only" htmlFor={`guest-${guest.id}`}>اسم ریزه‌خوار {format(index + 1)}</label><input id={`guest-${guest.id}`} autoComplete="off" value={guest.name} onChange={e => update({ guests: draft.guests.map(p => p.id === guest.id ? { ...p, name: e.target.value } : p) })} placeholder={index === 0 ? 'مثلاً سارا' : index === 1 ? 'مثلاً علی' : 'اسم اهلِ سفره'} maxLength={80} /><button className="icon-button delete" type="button" aria-label={`حذف ریزه‌خوار ${format(index + 1)}`} disabled={draft.guests.length <= 2} onClick={() => { setDraft(d => removeGuest(d, guest.id)); setError(''); }}><Icon name="close" /></button></div>)}</div>
            <button className="add-button" type="button" disabled={draft.guests.length >= 12} onClick={() => update({ guests: [...draft.guests, { id: uid(), name: '' }] })}><Icon name="plus" />یک نفر دیگر <span>{format(draft.guests.length)} از ۱۲</span></button>
            <div className="mirza-note"><Icon name="check" />میرزا {cleanName(draft.mirza.name)} هم در فهرست شریک‌هاست.</div><button className="primary" type="submit">حالا، فاکتورها <Icon name="book" /></button></form>
          </>}
          {draft.step === 4 && <>
            <div className="chapter-heading compact"><span className="eyebrow">ریزِ حساب، روی کاغذ</span><h1 ref={heading} tabIndex={-1}>فاکتورها و <em>خُرده‌حساب‌ها</em></h1><p>هر آیتم، فقط بین شریک‌های انتخاب‌شده تقسیم می‌شود.</p></div>
            <div className="invoices">{draft.invoices.map((invoice, index) => <section className="invoice" key={invoice.id} aria-label={`فاکتور ${format(index + 1)}`}>
              <div className="invoice-title"><span className="invoice-count">{format(index + 1)}</span><label className="sr-only" htmlFor={`invoice-${invoice.id}`}>اسم فاکتور {format(index + 1)}</label><input id={`invoice-${invoice.id}`} value={invoice.name} onChange={e => updateInvoice(invoice.id, { name: e.target.value })} placeholder="اسم فاکتور، مثلاً کافه سمفونی" maxLength={120} /><button className="icon-button delete" type="button" aria-label={`حذف فاکتور ${format(index + 1)}`} onClick={() => update({ invoices: draft.invoices.filter(f => f.id !== invoice.id) })}><Icon name="close" /></button></div>
              <div className="invoice-items">{invoice.items.map((item, itemIndex) => <div className="item" key={item.id}>
                <div className="item-fields"><Field label={`آیتم ${format(itemIndex + 1)}`}><input value={item.name} onChange={e => updateItem(invoice.id, item.id, { name: e.target.value })} placeholder="مثلاً قهوه" maxLength={120} /></Field><Field label="مبلغ به تومان"><input dir="ltr" inputMode="numeric" value={item.amountInput} onChange={e => updateItem(invoice.id, item.id, { amountInput: e.target.value })} placeholder="۱۲۰٬۰۰۰" maxLength={30} className="amount-input" /></Field><button className="icon-button delete item-delete" type="button" aria-label={`حذف آیتم ${format(itemIndex + 1)} از فاکتور ${format(index + 1)}`} onClick={() => updateInvoice(invoice.id, { items: invoice.items.filter(i => i.id !== item.id) })}><Icon name="close" /></button></div>
                <fieldset className="sharers"><legend>چه کسانی شریک‌اند؟ <span>{format(item.sharedBy.length)} نفر</span></legend><div className="chips">{currentPeople.map(p => <button key={p.id} type="button" className={`chip ${item.sharedBy.includes(p.id) ? 'selected' : ''}`} aria-pressed={item.sharedBy.includes(p.id)} onClick={() => updateItem(invoice.id, item.id, { sharedBy: item.sharedBy.includes(p.id) ? item.sharedBy.filter(id => id !== p.id) : [...item.sharedBy, p.id] })}>{item.sharedBy.includes(p.id) && <Icon name="check" />}{p.id === draft.mirza.id ? 'میرزا ' : ''}{cleanName(p.name)}</button>)}</div>{item.sharedBy.length === 0 && <p className="inline-warning">حداقل یک شریک انتخاب کن.</p>}</fieldset>
              </div>)}</div>
              <button type="button" className="add-item" onClick={() => updateInvoice(invoice.id, { items: [...invoice.items, newItem(draft)] })}><Icon name="plus" />افزودن آیتم</button>
              <div className="invoice-subtotal"><span>جمع این فاکتور</span><strong>{format(invoice.items.reduce((sum, i) => sum + (parseAmount(i.amountInput) ?? 0), 0))} <small>تومان</small></strong></div>
            </section>)}</div>
            <button type="button" className="add-button add-invoice" onClick={() => update({ invoices: [...draft.invoices, newInvoice(draft)] })}><Icon name="plus" />یک فاکتور دیگر</button>
            <div className="calculation-bar"><div className="grand-total"><span>جمع کلِ سفره</span><strong>{format(enteredTotal)} <small>تومان</small></strong></div><div className="calculate-wrap"><button type="button" className="primary calculate-button" disabled={busy} onClick={compute}>{busy ? 'میرزا دارد حساب می‌کند…' : 'میرزا، حساب کن!'}<Icon name="check" /></button>{celebrating && <div className="money-burst" aria-hidden="true">{Array.from({ length: 20 }, (_, n) => <img key={n} src={asset(n % 3 ? 'coin.webp' : 'banknote.webp')} style={{ '--x': `${Math.sin(n * 2.4) * 170}px`, '--y': `${-130 - n % 5 * 38}px`, '--rot': `${n * 67}deg`, animationDelay: `${n % 5 * 40}ms` } as CSSProperties} />)}</div>}</div></div>
          </>}
        </fieldset>}
        {result && <div className="result chapter">
          <div className="chapter-heading result-heading"><span className="eyebrow">دفتر بسته، حساب روشن!</span><h1 ref={heading} tabIndex={-1}>سهم هر کس، <em>معلوم شد.</em></h1></div>
          <div className="receipt-paper"><div className="receipt-seal"><Icon name="check" /></div><div className="receipt-header"><small>دفتر حسابِ دورهمی</small><h2>حساب کتاب</h2><p>به حساب <strong>سفره‌دار {cleanName(draft.payer)}</strong></p></div>
            <div className="receipt-labels"><span>اهلِ سفره</span><span>مبلغ پرداختی</span></div>
            <div className="settlement-list">{result.rows.map((p, index) => <div className="settlement-row" key={p.id}><span className="settlement-person"><span className={`person-badge badge-${index % 4}`}>{p.isMirza ? 'م' : Array.from(p.name)[0]}</span><span>{p.isMirza ? 'میرزا ' : ''}{p.name}{p.amount === 0 && <small>سهمی از آیتم‌ها ندارد</small>}</span></span><strong>{format(p.amount)}<small>تومان</small></strong></div>)}</div>
            <div className="receipt-total"><span>جمع کل</span><strong>{format(result.total)} <small>تومان</small></strong></div><p className="receipt-footer">حساب روشن، رفاقت برقرار</p></div>
          <button type="button" className="primary download-button" disabled={busy} onClick={download}><Icon name="download" />{busy ? 'آماده کردن تصویر…' : 'دانلود تصویرِ رسید'}</button>
          <button type="button" className="secondary edit-result" disabled={busy} onClick={() => { setResult(null); setImageUrl(null); go(4); }}><Icon name="edit" />برگشت و اصلاح حساب</button>
          {imageUrl && <div className="ios-save" role="status"><p>برای ذخیره در آیفون، تصویر را لمس کن و نگه دار و «ذخیرهٔ تصویر» را انتخاب کن.</p><img src={imageUrl} alt="تصویر رسید حساب کتاب، آمادهٔ ذخیره" /></div>}
        </div>}
        <footer className="ledger-footer"><span className="footer-ornament">✦</span>حساب و کتاب، به رسم رفاقت<span className="footer-ornament">✦</span></footer>
      </section>
    </main>
    {confirmReset && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setConfirmReset(false); resetButton.current?.focus(); } }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title" onKeyDown={e => {
      if (e.key === 'Escape') { setConfirmReset(false); resetButton.current?.focus(); }
      if (e.key === 'Tab') { const buttons = [...e.currentTarget.querySelectorAll('button')]; const first = buttons[0], last = buttons[buttons.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    }}><span className="modal-icon"><Icon name="book" /></span><h2 id="reset-title">یک دفترِ تازه؟</h2><p>حساب فعلی پاک می‌شود. اگر رسیدش را لازم داری، اول دانلودش کن.</p><button ref={modalCancel} type="button" className="primary" onClick={() => { setConfirmReset(false); resetButton.current?.focus(); }}>همین دفتر را نگه دار</button><button type="button" className="text-button danger" onClick={reset}>پاک کن و حساب جدید بساز</button></div></div>}
  </div>;
}
