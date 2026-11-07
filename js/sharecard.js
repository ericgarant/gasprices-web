// Share card: a pump-sign style image drawn on a canvas, e.g. "Le moins cher à Magog en ce moment : 158,9¢".
import { fmt1, splitPrice } from './util.js';
import { t } from './i18n.js';

const W = 1080, H = 1350;

function fit(g, text, max, font, size, min = 40) {
  let s = size;
  for (; s > min; s -= 4) { g.font = font(s); if (g.measureText(text).width <= max) break; }
  g.font = font(s);
  return s;
}

function wrap(g, text, max, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1,2}$/, '…'); }
  return lines;
}

/** opts: { headline, place, price, fuel, name, addr, level, when } → Promise<Blob> */
export async function renderShareCard(opts) {
  try { await Promise.race([document.fonts.load('800 100px "Barlow Condensed"'), document.fonts.load('600 40px Barlow'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* fallback fonts */ }
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const disp = (s) => `800 ${s}px "Barlow Condensed", "Arial Narrow", Impact, sans-serif`;
  const body = (s, w = 600) => `${w} ${s}px Barlow, system-ui, sans-serif`;
  const accent = { cheap: '#5BE08F', avg: '#FFC53D', pricey: '#FF6A55' }[opts.level] || '#5BE08F';

  g.fillStyle = '#0B0C0E'; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 640, 40, W / 2, 640, 700);
  glow.addColorStop(0, accent + '33'); glow.addColorStop(1, '#0B0C0E00');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#F1EDE422'; g.lineWidth = 6; g.strokeRect(36, 36, W - 72, H - 72);

  g.textBaseline = 'alphabetic'; g.fillStyle = '#F1EDE4'; g.textAlign = 'left';
  g.font = disp(64); g.fillText('LE PLEIN', 96, 150);
  g.font = body(30, 500); g.fillStyle = '#8E897F'; g.textAlign = 'right'; g.fillText(t('card.tag'), W - 96, 148);

  g.textAlign = 'center'; g.fillStyle = '#F1EDE4';
  fit(g, opts.headline.toUpperCase(), W - 200, disp, 112, 64);
  const hl = wrap(g, opts.headline.toUpperCase(), W - 200, 2);
  hl.forEach((l, i) => g.fillText(l, W / 2, 330 + i * 120));
  g.font = disp(72); g.fillStyle = accent;
  g.fillText(opts.place.toUpperCase(), W / 2, 330 + hl.length * 120 + 20);

  const { whole, tenth } = splitPrice(opts.price);
  g.font = disp(440);
  const wW = g.measureText(whole).width;
  g.font = disp(220);
  const tW = g.measureText(tenth).width;
  const total = wW + tW + 16;
  const x0 = (W - total) / 2;
  g.shadowColor = accent; g.shadowBlur = 40; g.fillStyle = accent;
  g.textAlign = 'left';
  g.font = disp(440); g.fillText(whole, x0, 960);
  g.font = disp(220); g.fillText(tenth, x0 + wW + 16, 960 - 230);
  g.shadowBlur = 0;
  g.font = disp(70); g.fillStyle = '#F1EDE4'; g.fillText('¢/L', x0 + wW + 16, 960);

  g.textAlign = 'center'; g.fillStyle = '#F1EDE4';
  g.font = body(46, 700); g.fillText(`${opts.fuel} · ${opts.name}`.slice(0, 44), W / 2, 1060);
  g.font = body(36, 500); g.fillStyle = '#B9B3A7'; g.fillText(opts.addr.slice(0, 54), W / 2, 1112);
  g.font = body(30, 500); g.fillStyle = '#8E897F'; g.fillText(opts.when, W / 2, 1170);
  g.font = body(26, 500); g.fillText(t('credit'), W / 2, 1236);
  g.fillText('ericgarant.github.io/gasprices-web', W / 2, 1274);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}

export { fmt1 };
