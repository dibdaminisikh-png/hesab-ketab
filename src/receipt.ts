import type { Draft, Settlement } from './model';
import { cleanName, format } from './model';
export async function createReceipt(draft: Draft, settlement: Settlement): Promise<Blob> {
  await document.fonts.load('700 42px Vazir');
  await document.fonts.load('400 36px Vazir');
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ساخت تصویر روی این مرورگر ممکن نیست.');
  const lines = (text: string, width: number, font: string): string[] => {
    ctx.font = font;
    const result: string[] = []; let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width) { line = next; continue; }
      if (line) { result.push(line); line = ''; }
      // Break even very long single-word names without clipping the receipt.
      for (const character of Array.from(word)) {
        if (ctx.measureText(line + character).width > width && line) { result.push(line); line = ''; }
        line += character;
      }
    }
    if (line) result.push(line);
    return result;
  };
  const payerLines = lines(`به حساب سفره‌دار ${cleanName(draft.payer)}`, 880, '400 36px Vazir');
  const mirzaLines = lines(`به قلم میرزا ${cleanName(draft.mirza.name)}`, 880, '400 32px Vazir');
  const rowData = settlement.rows.map(row => ({ ...row, nameLines: lines(`${row.isMirza ? 'میرزا ' : ''}${row.name}`, 495, '400 36px Vazir') }));
  const headerHeight = 290 + payerLines.length * 52 + mirzaLines.length * 45;
  const height = headerHeight + rowData.reduce((s, row) => s + Math.max(105, row.nameLines.length * 50 + 44), 0) + 230;
  canvas.height = height;
  ctx.fillStyle = '#fff4d8'; ctx.fillRect(0, 0, 1080, height);
  ctx.strokeStyle = '#a76739'; ctx.lineWidth = 10; ctx.strokeRect(25, 25, 1030, height - 50);
  ctx.strokeStyle = '#e9bd70'; ctx.lineWidth = 2; ctx.strokeRect(42, 42, 996, height - 84);
  ctx.fillStyle = '#0d7b7c'; ctx.beginPath(); ctx.roundRect(72, 75, 936, 110, 28); ctx.fill();
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff4d8'; ctx.font = '700 60px Vazir'; ctx.fillText('حساب کتاب', 540, 151);
  ctx.fillStyle = '#673c2a'; let y = 247;
  ctx.font = '400 32px Vazir'; mirzaLines.forEach(line => { ctx.fillText(line, 540, y); y += 45; });
  y += 12; ctx.font = '400 36px Vazir'; payerLines.forEach(line => { ctx.fillText(line, 540, y); y += 52; });
  y = headerHeight;
  rowData.forEach((row, index) => {
    const rowHeight = Math.max(105, row.nameLines.length * 50 + 44);
    if (index % 2 === 0) { ctx.fillStyle = '#f6e5ba'; ctx.fillRect(76, y, 928, rowHeight); }
    ctx.fillStyle = '#573824'; ctx.font = '400 36px Vazir'; ctx.textAlign = 'right';
    row.nameLines.forEach((line, n) => ctx.fillText(line, 968, y + 62 + n * 50));
    ctx.textAlign = 'left'; ctx.fillStyle = '#08767a';
    const amountText = format(row.amount); let amountSize = 36;
    ctx.font = `700 ${amountSize}px Vazir`;
    while (ctx.measureText(amountText).width > 320 && amountSize > 24) { amountSize -= 1; ctx.font = `700 ${amountSize}px Vazir`; }
    ctx.fillText(amountText, 110, y + rowHeight / 2 + 7);
    ctx.font = '400 24px Vazir'; ctx.fillText('تومان', 110, y + rowHeight / 2 + 36);
    y += rowHeight;
  });
  y += 32; ctx.fillStyle = '#0d7b7c'; ctx.beginPath(); ctx.roundRect(76, y, 928, 100, 22); ctx.fill();
  ctx.fillStyle = '#fff4d8'; ctx.textAlign = 'right'; ctx.font = '700 38px Vazir'; ctx.fillText('جمع کل', 966, y + 64);
  ctx.textAlign = 'left'; ctx.fillText(`${format(settlement.total)} تومان`, 112, y + 64);
  ctx.textAlign = 'center'; ctx.fillStyle = '#8c694c'; ctx.font = '400 26px Vazir'; ctx.fillText('حساب روشن، رفاقت برقرار', 540, y + 154);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('ساخت تصویر کامل نشد؛ دوباره امتحان کن.')), 'image/png'));
}
export async function downloadReceipt(draft: Draft, settlement: Settlement): Promise<string | null> {
  const blob = await createReceipt(draft, settlement);
  const url = URL.createObjectURL(blob);
  // Safari on iOS can present the image inline for Save Image.
  if (/iP(ad|hone|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return url;
  const a = document.createElement('a'); a.href = url; a.download = 'hesab-ketab.png'; document.body.append(a); a.click(); a.remove();
  // Keep an explicit image link available in browsers that restrict automatic downloads.
  // The component revokes this URL when its preview is replaced or closed.
  return url;
}
