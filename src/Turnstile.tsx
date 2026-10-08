import { useEffect, useRef, useState } from 'react';
interface TurnstileAPI {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: TurnstileAPI } }
let loading: Promise<TurnstileAPI> | undefined;
function load(): Promise<TurnstileAPI> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) loading = new Promise<TurnstileAPI>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
    const timeout = setTimeout(() => { script.remove(); reject(new Error('timeout')); }, 15000);
    script.onload = () => { clearTimeout(timeout); if (window.turnstile) resolve(window.turnstile); else reject(new Error('missing')); };
    script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('load')); };
    document.head.appendChild(script);
  }).catch(e => { loading = undefined; throw e; });
  return loading;
}
export default function Turnstile({ siteKey, refresh, onToken }: { siteKey: string; refresh: number; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [failed, setFailed] = useState(false);
  callback.current = onToken;
  useEffect(() => {
    let alive = true, widget: string | undefined;
    setFailed(false); callback.current('');
    load().then(api => {
      if (!alive || !container.current) return;
      widget = api.render(container.current, { sitekey: siteKey, action: 'receipt-scan', language: 'fa', size: 'flexible',
        callback: (token: string) => { if (alive) { setFailed(false); callback.current(token); } },
        'expired-callback': () => { if (alive) callback.current(''); },
        'error-callback': () => { if (alive) { callback.current(''); setFailed(true); } },
      });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (widget) window.turnstile?.remove(widget); };
  }, [siteKey, refresh]);
  return <div className="scan-security"><div ref={container} />{failed && <p role="alert">تأیید امنیتی بارگیری نشد؛ اتصال را بررسی کن و «تلاش دوباره» را بزن.</p>}</div>;
}
