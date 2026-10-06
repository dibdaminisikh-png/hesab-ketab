import { useState } from 'react';
import { format } from './model';
export default function Abacus() {
  const [digits, setDigits] = useState([0, 0, 0, 0, 0]);
  const set = (column: number, value: number) => setDigits(d => d.map((v, i) => i === column ? value : v));
  const value = digits.reduce((s, digit, index) => s + digit * 10 ** (4 - index), 0);
  return <div className="abacus-game">
    <div className="abacus" aria-label="چرتکهٔ پنج‌ستونه" dir="ltr">
      {digits.map((digit, column) => <div className="abacus-rod" key={column}>
        <span className="rod" />
        <button type="button" className={`bead upper ${digit >= 5 ? 'engaged' : ''}`} aria-label={`مهرهٔ پنج‌تایی ستون ${column + 1}`} aria-pressed={digit >= 5}
          onClick={e => { if (e.currentTarget.dataset.dragged === 'yes') { delete e.currentTarget.dataset.dragged; return; } set(column, digit >= 5 ? digit - 5 : digit + 5); }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.startY = String(e.clientY); }}
          onPointerUp={e => { const delta = e.clientY - Number(e.currentTarget.dataset.startY); if (Math.abs(delta) > 8) { set(column, digit % 5 + (delta > 0 ? 5 : 0)); e.currentTarget.dataset.dragged = 'yes'; } }} />
        <div className="abacus-bar" />
        {[1, 2, 3, 4].map(n => <button type="button" key={n} className={`bead lower ${digit % 5 >= n ? 'engaged' : ''}`} style={{ top: `${94 + (n - 1) * 22 + (digit % 5 >= n ? -8 : 6)}px` }}
          aria-label={`ستون ${column + 1}، ${n} مهرهٔ یک‌تایی`} aria-pressed={digit % 5 >= n}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.startY = String(e.clientY); }}
          onPointerUp={e => {
            const delta = e.clientY - Number(e.currentTarget.dataset.startY);
            if (Math.abs(delta) > 8) { set(column, digit - digit % 5 + (delta < 0 ? n : n - 1)); e.currentTarget.dataset.dragged = 'yes'; }
          }}
          onClick={e => { if (e.currentTarget.dataset.dragged === 'yes') { delete e.currentTarget.dataset.dragged; return; } set(column, digit - digit % 5 + (digit % 5 === n ? n - 1 : n)); }} />)}
        <span className="place-label">{['ده‌هزار', 'هزار', 'صد', 'ده', 'یک'][column]}</span>
      </div>)}
    </div>
    <div className="abacus-bottom"><output aria-live="polite">{format(value)}</output><button className="text-button" type="button" onClick={() => setDigits([0, 0, 0, 0, 0])}>صفر کن</button></div>
    <p className="abacus-hint">مهره‌ها را جابه‌جا کن؛ دستت گرم شود!</p>
  </div>;
}
