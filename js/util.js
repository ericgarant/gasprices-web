// Small pure helpers: formatting, distance, text normalisation. Formats follow the current language.
import { t, locale, INDEPENDENT } from './i18n.js';

export const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const fmtCache = new Map();
const nf = (kind) => {
  const k = kind + locale();
  if (!fmtCache.has(k)) fmtCache.set(k, kind === 'n' ? new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : new Intl.NumberFormat(locale(), { style: 'currency', currency: 'CAD' }));
  return fmtCache.get(k);
};
export const fmt1 = (n) => nf('n').format(n);
export const fmtMoney = (n) => nf('m').format(n);
export const fmtDate = (d, opts) => new Intl.DateTimeFormat(locale(), opts).format(d);

/** 171.9 -> { whole: '171', tenth: '9', label: '171,9 cents le litre' } */
export function splitPrice(p) {
  const r = Math.round(p * 10);
  return { whole: String(Math.floor(r / 10)), tenth: String(r % 10), label: t('price.aria', { p: fmt1(r / 10) }) };
}

export function priceHTML(p, size, level, { unit = false, roll = false } = {}) {
  if (p == null) return `<span class="price price--${size} price--na">${t('price.na')}</span>`;
  const { whole, tenth, label } = splitPrice(p);
  return `<span class="price price--${size}${level ? ' price--' + level : ''}${roll ? ' rolling' : ''}" aria-label="${label}">` +
    `<span class="price__digits">${whole}</span><span class="price__tenth">${tenth}</span>` +
    `${unit ? '<span class="price__unit">¢/L</span>' : ''}</span>`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function distanceKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

export const fmtDist = (km) => (km < 10 ? `${fmt1(km)} km` : `${Math.round(km)} km`);

export function ageText(ts, now = Date.now()) {
  const min = Math.max(0, Math.round((now - ts) / 60000));
  if (min < 1) return t('age.now');
  if (min < 60) return t('age.min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('age.h', { n: h });
  return t('age.d', { n: Math.round(h / 24) });
}

const LOWER = new Set(['de', 'du', 'des', 'la', 'le', 'et']);
export function brandName(b) {
  if (!b || !String(b).trim()) return INDEPENDENT;
  return String(b).trim().toLowerCase().split(/([\s\-'’])/)
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');
}
export const initials = (b) => brandName(b).replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 2).replace(/^./, (c) => c.toUpperCase());

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem('lp.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lp.' + k, JSON.stringify(v)); return true; } catch { return false; } },
};
