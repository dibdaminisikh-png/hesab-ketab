import { useEffect, useRef, useState } from 'react';
import { format, parseAmount } from './model';
import type { MoneyUnit, ScanReceipt } from '../shared/scan';
import { prepareScanImage, reviewError, scanApiUrl, scanConfig, scanImage, toToman } from './scan';
import type { ReviewedLine, ReviewedScan } from './scan';
import Turnstile from './Turnstile';
type ReviewLine = ReviewedLine & { quantity?: number | null; kind?: string };

export default function ScanDialog({ onClose, onImport }: { onClose: () => void; onImport: (scan: ReviewedScan) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const running = useRef(false);
  const [siteKey, setSiteKey] = useState('');
  const [token, setToken] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [configRefresh, setConfigRefresh] = useState(0);
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<ScanReceipt | null>(null);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState<MoneyUnit>('unknown');
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { request.current?.abort(); dialog.current?.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!scanApiUrl()) { setStatus('ورود دستی آیتم‌ها در دفتر در دسترس است.'); setError('اسکن عکس هنوز فعال نشده؛ فعلاً آیتم‌ها را دستی وارد کن.'); return; }
    const controller = new AbortController();
    let alive = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    scanConfig(controller.signal).then(data => { if (!controller.signal.aborted) { setSiteKey(data.siteKey); setError(''); } })
      .catch(e => { if (alive) setError(controller.signal.aborted ? 'اتصال به اسکن طول کشید؛ دوباره تلاش کن.' : (e as Error).message); })
      .finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [configRefresh]);
  function close() { request.current?.abort(); onClose(); }
  async function choose(file?: File) {
    if (!file) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    running.current = true; setBusy(true); setError(''); setStatus('آماده کردن عکس…'); setReceipt(null); setConfirmed(false); setToken(''); setImage('');
    try { const data = await prepareScanImage(file, controller.signal); if (!controller.signal.aborted) { setImage(data); setRefresh(n => n + 1); setStatus('عکس آماده است؛ حالا میرزا آن را بخواند.'); } }
    catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
    finally { if (request.current === controller) { running.current = false; setBusy(false); } }
  }
  async function read() {
    if (running.current || !token || !image || !siteKey) return;
    running.current = true; setBusy(true); setError(''); setStatus('میرزا دارد عکس فاکتور را می‌خواند…');
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const { receipt: data } = await scanImage(image, token, controller.signal);
      if (controller.signal.aborted) return;
      setReceipt(data); setTitle(data.title); setUnit(data.unit);
      setLines([ ...data.items.map(item => ({ name: item.name, amountInput: item.total === null ? '' : String(item.total), include: true, quantity: item.quantity })),
        ...data.charges.filter(charge => charge.kind !== 'discount' && charge.amount !== 0).map(charge => ({ name: charge.name, amountInput: charge.amount === null ? '' : String(charge.amount), include: true, kind: charge.kind })) ]);
      setConfirmed(false); setStatus('عکس خوانده شد؛ پیش از افزودن، ریز حساب را بررسی کن.');
    } catch (e) { setError(controller.signal.aborted ? 'خواندن عکس طول کشید؛ دوباره تلاش کن یا دستی وارد کن.' : (e as Error).message); }
    finally { clearTimeout(timeout); running.current = false; setBusy(false); setToken(''); setRefresh(n => n + 1); }
  }
  function changeLine(index: number, change: Partial<ReviewLine>) { setLines(current => current.map((line, n) => n === index ? { ...line, ...change } : line)); setConfirmed(false); }
  const reviewed = { title, unit, lines };
  const invalid = reviewError(reviewed);
  const selected = lines.filter(line => line.include);
  const total = selected.reduce((sum, line) => sum + (toToman(line.amountInput, unit) ?? 0), 0);
  const rawSum = selected.reduce((sum, line) => sum + (parseAmount(line.amountInput) ?? 0), 0);
  const mismatch = receipt?.printedTotal !== null && receipt?.printedTotal !== undefined && rawSum !== receipt.printedTotal;
  const discounts = receipt?.charges.filter(charge => charge.kind === 'discount' && charge.amount !== 0) ?? [];
  function commit() {
    if (running.current) return;
    if (invalid) { setError(invalid); return; }
    if (!confirmed) { setError('اول مبلغ‌ها و واحد پول را تأیید کن.'); return; }
    try { running.current = true; onImport(reviewed); }
    catch (e) { running.current = false; setError((e as Error).message); }
  }
  return <dialog ref={dialog} className="scan-dialog" aria-labelledby="scan-title" onCancel={e => { e.preventDefault(); close(); }}>
    <header className="scan-heading"><div><span className="eyebrow">چشمِ میرزا، روی فاکتور</span><h2 id="scan-title">{receipt ? 'یک نگاه به ریزِ حساب' : 'اسکن عکس فاکتور'}</h2></div><button type="button" className="icon-button" aria-label="بستن اسکن فاکتور" onClick={close}>×</button></header>
    <p className="scan-intro">عکس فاکتور چاپی را انتخاب کن. برای خواندن، عکس به هوش مصنوعی کلودفلر ارسال می‌شود؛ در دفتر فقط آیتم‌های تأییدشده ذخیره می‌شوند.</p>
    <div className="scan-body">
      {!receipt && <div className="scan-pickers">
        <label className={`scan-pick ${busy ? 'disabled' : ''}`}><span aria-hidden="true">▧</span>انتخاب از گالری<input type="file" aria-label="انتخاب از گالری" accept="image/jpeg,image/png,image/webp" disabled={busy || !siteKey} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <label className={`scan-pick ${busy ? 'disabled' : ''}`}><span aria-hidden="true">◎</span>گرفتن عکس<input type="file" aria-label="گرفتن عکس" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy || !siteKey} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} /></label>
      </div>}
      {image && <details className="scan-preview" open={!receipt}><summary>عکس فاکتور</summary><img src={image} alt="عکس فاکتور برای مقایسه با آیتم‌های استخراج‌شده" /></details>}
      <p className="scan-status" role="status" aria-live="polite">{status || (siteKey ? 'عکس واضح و کامل، تا ۱۰ مگابایت؛ JPG، PNG یا WebP.' : 'در حال اتصال به اسکن…')}</p>
      {error && <p className="error-note" role="alert">{error}</p>}
      {!receipt && <>
        {siteKey && image && <Turnstile siteKey={siteKey} refresh={refresh} onToken={setToken} />}
        {scanApiUrl() && <button type="button" className="text-button" disabled={busy} onClick={() => { setError(''); if (siteKey) setRefresh(n => n + 1); else setConfigRefresh(n => n + 1); }}>تلاش دوباره برای اتصال</button>}
      </>}
      {receipt && <div className="scan-review">
        <label className="field"><span>اسم فاکتور استخراج‌شده</span><input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} /><small>اگر فاکتور فعلی اسم دارد، همان اسم حفظ می‌شود.</small></label>
        <label className="field"><span>واحد مبلغ روی عکس</span><select value={unit} onChange={e => { setUnit(e.target.value as MoneyUnit); setConfirmed(false); }}><option value="unknown">انتخاب کن…</option><option value="rial">ریال — تبدیل به تومان هنگام افزودن</option><option value="toman">تومان</option></select></label>
        <p className="scan-hint">مبلغ هر ردیف، قیمت کل همان ردیف است. تعداد دوباره در مبلغ ضرب نمی‌شود.</p>
        {receipt.warnings.map((warning, i) => <p className="inline-warning" key={i}>{warning}</p>)}
        {discounts.length > 0 && <div className="scan-warning">{discounts.map((discount, i) => <p key={i}>{discount.name || 'تخفیف'}: {discount.amount === null ? 'ناخوانا' : format(discount.amount)} — تخفیف خودکار تقسیم نمی‌شود؛ مبلغ آیتم‌ها را با درنظرگرفتن تخفیف اصلاح کن.</p>)}</div>}
        <div className="scan-lines">{lines.map((line, index) => <div className={`scan-line ${!line.include ? 'excluded' : ''}`} key={index}>
          <label className="scan-check"><input type="checkbox" checked={line.include} onChange={e => changeLine(index, { include: e.target.checked })} /><span>ردیف {format(index + 1)}{line.kind ? ' · هزینهٔ جانبی' : line.quantity ? ` · تعداد ${format(line.quantity)}` : ''}</span></label>
          <div className="scan-line-fields"><label className="field"><span>نام ردیف {format(index + 1)}</span><input value={line.name} maxLength={120} disabled={!line.include} onChange={e => changeLine(index, { name: e.target.value })} /></label><label className="field"><span>مبلغ کل ردیف {format(index + 1)}{unit === 'unknown' ? '' : unit === 'rial' ? ' · ریال' : ' · تومان'}</span><input dir="ltr" inputMode="numeric" value={line.amountInput} maxLength={30} disabled={!line.include} onChange={e => changeLine(index, { amountInput: e.target.value })} /></label></div>
        </div>)}</div>
        <div className="scan-totals"><span>جمع آیتم‌های انتخاب‌شده</span><strong>{unit === 'unknown' ? 'واحد را انتخاب کن' : `${format(total)} تومان`}</strong></div>
        {receipt.printedTotal !== null && <p className="scan-hint">جمع چاپ‌شده روی عکس: {format(receipt.printedTotal)} {receipt.unit === 'unknown' ? '(واحد نامشخص)' : receipt.unit === 'rial' ? 'ریال' : 'تومان'}</p>}
        {mismatch && <p className="scan-warning">جمع انتخاب‌ها با جمع چاپ‌شده برابر نیست؛ ردیف‌ها، هزینه‌ها و تخفیف را بررسی کن.</p>}
        <label className="scan-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>نام‌ها، مبلغ‌ها و واحد پول را با عکس تطبیق دادم{discounts.length > 0 ? ' و تخفیف را در مبلغ‌ها اعمال کردم' : ''}.</span></label>
        {invalid && <p className="inline-warning">{invalid}</p>}
      </div>}
    </div>
    <footer className="scan-actions">{receipt ? <><button type="button" className="primary" disabled={!confirmed || !!invalid} onClick={commit}>افزودن {format(selected.length)} آیتم به فاکتور</button><button type="button" className="text-button" onClick={() => { setReceipt(null); setLines([]); setConfirmed(false); setError(''); setRefresh(n => n + 1); }}>خواندن عکس دیگر</button></> : <button type="button" className="primary" disabled={busy || !token || !image} onClick={() => void read()}>{busy ? 'میرزا مشغول است…' : 'عکس را بخوان'}</button>}<button type="button" className="secondary" onClick={close}>{busy ? 'لغو و برگشت' : 'برگشت به دفتر'}</button></footer>
  </dialog>;
}
