import { useEffect, useRef, useState } from 'react';

const GUIDE_KEY = 'hesab-ketab:install-guide:v1';
type Phone = 'ios' | 'android';
function phoneType(): Phone | null {
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent) || /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1) return 'ios';
  return /Android/i.test(navigator.userAgent) ? 'android' : null;
}
function installed() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function firstVisit() {
  if (!phoneType() || installed()) return false;
  try { return localStorage.getItem(GUIDE_KEY) !== 'dismissed'; } catch { return true; }
}
function GuideIcon({ name }: { name: 'share' | 'menu' | 'home' }) {
  const paths = { share: 'M12 15V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3', menu: 'M12 4v.1M12 12v.1M12 20v.1', home: 'm3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7' };
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={name === 'menu' ? 4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export default function InstallGuide() {
  const [open, setOpen] = useState(firstVisit);
  const [phone, setPhone] = useState<Phone>(() => phoneType() ?? 'ios');
  const [isInstalled, setInstalled] = useState(installed);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const update = () => { const value = installed(); setInstalled(value); if (value) setOpen(false); };
    const onInstalled = () => { setInstalled(true); setOpen(false); };
    media.addEventListener('change', update);
    window.addEventListener('appinstalled', onInstalled);
    return () => { media.removeEventListener('change', update); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  function dismiss() {
    try { localStorage.setItem(GUIDE_KEY, 'dismissed'); } catch { /* The guide also works without browser storage. */ }
    setOpen(false);
  }
  return <>
    {!isInstalled && <button type="button" className="install-guide-link" onClick={() => setOpen(true)}><GuideIcon name="home" />راهنمای افزودن به صفحهٔ اصلی</button>}
    <dialog ref={dialog} className="modal install-guide" aria-labelledby="install-title" aria-describedby="install-intro" onCancel={event => { event.preventDefault(); dismiss(); }} onClick={event => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
      }
    }}>
      <button type="button" className="install-close" aria-label="بستن راهنمای نصب" onClick={dismiss}>×</button>
      <div className="install-illustration"><img src={`${import.meta.env.BASE_URL}art/character-0.webp`} alt="" /><span><GuideIcon name="home" /></span></div>
      <span className="install-eyebrow">دفترِ میرزا، همیشه دمِ دست!</span>
      <h2 id="install-title">حساب کتاب را به<br />صفحهٔ اصلی گوشی اضافه کن</h2>
      <p id="install-intro">یک آیکون برای دفترت داشته باش تا دفعهٔ بعد با یک لمس بازش کنی.</p>
      <div className="install-platforms" role="group" aria-label="نوع گوشی"><button type="button" aria-pressed={phone === 'ios'} onClick={() => setPhone('ios')}>آیفون و آیپد</button><button type="button" aria-pressed={phone === 'android'} onClick={() => setPhone('android')}>اندروید</button></div>
      {phone === 'ios' ? <ol className="install-steps">
        <li><span className="install-number">۱</span><span>این صفحه را در <strong dir="ltr">Safari</strong> باز کن.</span></li>
        <li><span className="install-number">۲</span><span>روی دکمهٔ اشتراک‌گذاری <strong dir="ltr">Share</strong> <GuideIcon name="share" /> بزن.</span></li>
        <li><span className="install-number">۳</span><span>گزینهٔ <strong dir="ltr">Add to Home Screen</strong> (افزودن به صفحهٔ اصلی) را انتخاب کن؛ اگر پیدایش نکردی، فهرست را پایین بکش.</span></li>
        <li><span className="install-number">۴</span><span>با زدن <strong dir="ltr">Add</strong> (افزودن)، آیکون دفتر به گوشی‌ات اضافه می‌شود.</span></li>
      </ol> : <ol className="install-steps">
        <li><span className="install-number">۱</span><span>این صفحه را در <strong dir="ltr">Chrome</strong> باز کن.</span></li>
        <li><span className="install-number">۲</span><span>روی منوی سه‌نقطه <GuideIcon name="menu" /> بزن.</span></li>
        <li><span className="install-number">۳</span><span>گزینهٔ <strong dir="ltr">Add to Home screen</strong> (افزودن به صفحهٔ اصلی) یا <strong dir="ltr">Install app</strong> (نصب برنامه) را انتخاب کن.</span></li>
        <li><span className="install-number">۴</span><span>با زدن «افزودن» یا «نصب»، آیکون دفتر به گوشی‌ات اضافه می‌شود.</span></li>
      </ol>}
      <button type="button" className="primary" onClick={dismiss}>فهمیدم، بریم سرِ حساب!</button>
    </dialog>
  </>;
}
