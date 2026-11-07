// Price history from the hourly snapshots in data/history/ (written by scripts/snapshot.mjs).
import { fmt1 } from './util.js';

const DIR = 'data/history/';
const MAX_DAYS = 14;
let loading = null;

/** Same id as the snapshot job: first 10 hex chars of sha1("Name|Address"). */
export async function stationId(key) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(key));
  return [...new Uint8Array(buf)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getJSON(path) {
  const r = await fetch(DIR + path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Loads (once) the last days of snapshots. Resolves { days: [{day, rows}], regions }. */
export function loadHistory() {
  if (loading) return loading;
  loading = (async () => {
    let days;
    try { days = await getJSON('days.json'); } catch { days = [ymd(new Date(Date.now() - 864e5)), ymd(new Date())]; }
    days = days.slice(-MAX_DAYS);
    const files = await Promise.all(days.map((d) => getJSON(d + '.json').then((rows) => ({ day: d, rows })).catch(() => null)));
    let regions = null;
    try { regions = await getJSON('regions.json'); } catch { /* optional */ }
    return { days: files.filter(Boolean), regions };
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

const stamp = (day, time) => Date.parse(`${day}T${time}:00`);

/** Points [{t, v}] for one station and fuel, plus the live price as the last point. */
export function stationSeries(hist, id, fuel, livePrice) {
  const pts = [];
  for (const { day, rows } of hist.days) {
    for (const row of rows[id] || []) {
      const v = row[fuel + 1];
      if (v == null) continue;
      pts.push({ t: stamp(day, row[0]), v });
    }
  }
  // Drop repeated values: a step chart only needs the changes.
  const out = [];
  for (const p of pts) if (!out.length || out[out.length - 1].v !== p.v) out.push(p);
  if (livePrice != null && (!out.length || out[out.length - 1].v !== livePrice)) out.push({ t: Date.now(), v: livePrice });
  return { pts: out, first: pts.length ? pts[0].t : null };
}

/** Regional average points [{t, v}] for one fuel. */
export function regionSeries(hist, region, fuel) {
  const rows = (hist.regions && hist.regions.rows) || [];
  const pts = [];
  for (const r of rows) {
    const v = r.avg && r.avg[region] ? r.avg[region][fuel] : null;
    if (v != null) pts.push({ t: Date.parse(`${r.t}:00`), v });
  }
  return pts;
}

const fmtSpan = (ms) => {
  const h = ms / 36e5;
  if (h < 1.5) return 'moins d’une heure';
  if (h < 36) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} j`;
};

/** Trend summary for a series: { dir: 'down'|'up'|'flat', delta, span } or null when too short. */
export function trendOf(pts) {
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const delta = Math.round((b.v - a.v) * 10) / 10;
  return { dir: delta < -0.04 ? 'down' : delta > 0.04 ? 'up' : 'flat', delta, span: fmtSpan(b.t - a.t) };
}

export function trendText(tr) {
  if (!tr) return '';
  if (tr.dir === 'flat') return `Stable depuis ${tr.span}`;
  return `${tr.dir === 'down' ? 'En baisse' : 'En hausse'} de ${fmt1(Math.abs(tr.delta))}¢ depuis ${tr.span}`;
}

/** Inline SVG step chart. `pts` has at least two points. Colour is not the only cue: the labels carry the numbers. */
export function chartSVG(pts, { w = 320, h = 132 } = {}) {
  const padL = 8, padR = 8, padT = 22, padB = 34;
  const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 2) { const m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
  const x = (t) => padL + ((t - t0) / (t1 - t0)) * (w - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  let d = `M${x(pts[0].t).toFixed(1)} ${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += `H${x(pts[i].t).toFixed(1)}V${y(pts[i].v).toFixed(1)}`;
  const last = pts[pts.length - 1];
  const area = `${d}V${h - padB}H${x(pts[0].t).toFixed(1)}Z`;
  const imin = vs.indexOf(Math.min(...vs)), imax = vs.indexOf(Math.max(...vs));
  const label = (i, dy) => `<text class="hc__val" x="${Math.min(w - 30, Math.max(30, x(pts[i].t))).toFixed(1)}" y="${(y(pts[i].v) + dy).toFixed(1)}" text-anchor="middle">${fmt1(pts[i].v)}</text>`;
  return `<svg class="hchart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Évolution du prix, de ${fmt1(vs[0])} à ${fmt1(last.v)} cents">
    <path class="hc__area" d="${area}"/><path class="hc__line" d="${d}"/>
    <circle class="hc__dot" cx="${x(last.t).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="4.5"/>
    ${imax !== imin ? label(imax, -8) : ''}${label(imin, 16)}
    <text class="hc__ax" x="${padL}" y="${h - 4}">${axisLabel(t0)}</text><text class="hc__ax" x="${w - padR}" y="${h - 4}" text-anchor="end">maintenant</text>
  </svg>`;
}

function axisLabel(t) {
  const days = (Date.now() - t) / 864e5;
  if (days < 1) return `il y a ${Math.max(1, Math.round(days * 24))} h`;
  return `il y a ${Math.round(days)} j`;
}
