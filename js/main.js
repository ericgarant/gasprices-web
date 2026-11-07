// Le Plein — map, list, favourites, filters, station sheet, offline, auto-refresh, plus the fun features:
// deal radar, savings calculator, best-price moment, heat map, price history, price watch, share card.
import { FUELS, loadCached, fetchStations, buildStats, levelOf, LEVEL_LABEL } from './data.js';
import { norm, esc, fmt1, fmtMoney, fmtDist, ageText, priceHTML, splitPrice, distanceKm, initials, debounce, store } from './util.js';
import { confetti, vibrate } from './effects.js';
import { createHeatLayer } from './heat.js';
import { loadHistory, stationId, stationSeries, regionSeries, trendOf, trendText, chartSVG } from './history.js';
import { renderShareCard } from './sharecard.js';
import { brandBadge, brandColors } from './brands.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ico = (n, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const REFRESH_MS = 5 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
const PAGE = 50;

// ---- state ---------------------------------------------------------------------------------
const state = {
  view: 'map',
  fuel: store.get('fuel', 0),
  sort: 'price',
  q: '',
  region: store.get('region', ''),
  brand: store.get('brand', ''),
  maxPrice: store.get('maxPrice', null),
  radius: store.get('radius', 25),
  favs: new Set(store.get('favs', [])),
  theme: store.get('theme', 'auto'),
  user: null,
  data: null, // { stations, generatedAt, fetchedAt }
  offline: false,
  selected: null,
  shown: PAGE,
  roll: false,
  heat: false,
  litres: store.get('litres', 50),
  watch: store.get('watch', {}), // { [stationKey]: { fuel, price } }
  radarKeys: new Set(),
};
if (!Number.isFinite(state.litres) || state.litres <= 0) state.litres = 50;
if (!state.watch || typeof state.watch !== 'object') state.watch = {};
if (![0, 1, 2].includes(state.fuel)) state.fuel = 0;

let stats = [null, null, null]; // per fuel: region terciles
let byKey = new Map();
let heatLayer = null;
const celebrated = new Set(); // best-price confetti already played this session
const announced = new Set(); // price-watch hits already announced this session
let visible = []; // filters applied (not radius), current fuel has a price
let listed = []; // visible + radius, sorted (feeds the list and the map pins)

// ---- theme ---------------------------------------------------------------------------------
const mqDark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const dark = state.theme === 'dark' || (state.theme === 'auto' && mqDark && mqDark.matches);
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const m = $('meta[name="theme-color"]');
  if (m) m.content = dark ? '#101214' : '#F5F1E8';
  if (heatLayer && state.heat) setTimeout(() => heatLayer.redraw(), 0);
}
if (mqDark) mqDark.addEventListener('change', applyTheme);
applyTheme();

// ---- derived data --------------------------------------------------------------------------
const stationLevel = (s, fi = state.fuel) => levelOf(stats[fi], s.region, s.prices[fi]);
const title = (s) => (s.brand !== 'Indépendant' ? s.brand : s.name || s.brand);
const distTo = (s) => (state.user ? distanceKm(state.user.lat, state.user.lng, s.lat, s.lng) : null);

function setData(data, { announce = false } = {}) {
  state.data = data;
  byKey = new Map(data.stations.map((s) => [s.key, s]));
  stats = [0, 1, 2].map((i) => buildStats(data.stations, i));
  recompute();
  checkWatches(announce);
}

function recompute() {
  if (!state.data) return;
  const fi = state.fuel;
  const tokens = norm(state.q).split(/\s+/).filter(Boolean);
  visible = [];
  for (const s of state.data.stations) {
    const p = s.prices[fi];
    if (p == null) continue;
    if (state.region && s.region !== state.region) continue;
    if (state.brand && s.brand !== state.brand) continue;
    if (state.maxPrice != null && p > state.maxPrice) continue;
    if (tokens.length) {
      s._hay ||= norm(`${s.brand} ${s.name} ${s.addr} ${s.region}`);
      if (!tokens.every((t) => s._hay.includes(t))) continue;
    }
    visible.push(s);
  }
  listed = state.user && state.radius ? visible.filter((s) => distTo(s) <= state.radius) : visible.slice();
  const byPrice = (a, b) => a.prices[fi] - b.prices[fi];
  if (state.sort === 'dist' && state.user) listed.sort((a, b) => distTo(a) - distTo(b) || byPrice(a, b));
  else listed.sort((a, b) => byPrice(a, b) || (state.user ? distTo(a) - distTo(b) : 0));
}

// ---- toast ---------------------------------------------------------------------------------
let toastT;
function toast(msg) {
  const el = $('#toast');
  $('.snackbar__msg', el).textContent = msg;
  el.hidden = false;
  el.classList.toggle('top', !$('#sheet').hidden);
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.hidden = true), 3500);
}

// ---- freshness -----------------------------------------------------------------------------
function renderFresh() {
  const d = state.data;
  let html;
  let cls = 'fresh fresh-btn';
  if (!d) html = `${ico('clock')}Chargement…`;
  else {
    const age = Date.now() - d.generatedAt;
    if (state.offline) { cls += ' fresh--offline'; html = `${ico('offline')}Hors ligne · prix ${ageText(d.generatedAt)}`; }
    else if (age > STALE_MS) { cls += ' fresh--stale'; html = `${ico('clock')}Prix ${ageText(d.generatedAt)}`; }
    else html = `${ico('clock')}${ageText(d.generatedAt)}`;
  }
  $$('[data-refresh]').forEach((b) => { b.className = cls; b.innerHTML = html; b.setAttribute('aria-label', `${b.textContent.trim()}. Actualiser`); });
  const f = $('#best .fresh');
  if (f) { f.className = cls.replace(' fresh-btn', ''); f.innerHTML = html; }
}

let refreshing = false;
async function refresh({ manual = false } = {}) {
  if (refreshing) return;
  refreshing = true;
  try {
    const data = await fetchStations();
    state.offline = false;
    const first = !state.data;
    setData(data, { announce: true });
    renderAll();
    if (first) fitInitial();
    if (manual) toast('Prix à jour');
  } catch (e) {
    state.offline = true;
    if (manual || !state.data) toast(state.data ? 'Impossible d’actualiser. Prix de la dernière mise à jour.' : 'Impossible de charger les prix. Vérifiez votre connexion.');
  } finally {
    refreshing = false;
    $('#loading').classList.add('done');
    renderFresh();
  }
}

// ---- map -----------------------------------------------------------------------------------
let map, cluster, meMarker, markers = new Map();
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (p) => { const { whole, tenth } = splitPrice(p); return `${whole}${SUP[+tenth]}`; };

function pinIcon(s) {
  const p = s.prices[state.fuel];
  const { whole, tenth } = splitPrice(p);
  const sel = state.selected === s.key;
  const cls = `pin pin--${stationLevel(s)}${state.favs.has(s.key) ? ' pin--fav' : ''}${sel ? ' pin--selected' : ''}${state.radarKeys.has(s.key) ? ' pin--best' : ''}`;
  return L.divIcon({
    className: 'lp-icon', iconSize: [0, 0], iconAnchor: [0, 0],
    html: `<div class="${cls}"><span class="pin__plate">${whole}<small>${tenth}</small><i class="pin__brand" data-brand="${esc(s.brand)}" style="--bb:${brandColors(s.brand)[0]}"></i></span><span class="pin__stalk"></span></div>`,
  });
}

function initMap() {
  if (typeof L === 'undefined') { toast('La carte n’a pas pu se charger. La liste reste disponible.'); return; }
  map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 4, maxZoom: 18, tap: true }).setView([46.6, -72.0], 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 48, disableClusteringAtZoom: 14, chunkedLoading: true, spiderfyOnMaxZoom: true,
    iconCreateFunction: (c) => {
      const kids = c.getAllChildMarkers();
      let min = Infinity;
      for (const m of kids) min = Math.min(min, m.options.price);
      const n = kids.length;
      return L.divIcon({
        className: 'lp-icon', iconSize: [0, 0], iconAnchor: [0, 0],
        html: `<div class="cluster" aria-label="${n} stations, à partir de ${fmt1(min)} cents"><div><b>${sup(min)}</b><small>${n < 10 ? n + ' stations' : n}</small></div></div>`,
      });
    },
  });
  map.addLayer(cluster);
  heatLayer = createHeatLayer(heatPoints);
  map.on('moveend', debounce(renderBest, 150));
  map.on('click', (e) => {
    if (state.heat) { const s = nearestOnScreen(e.containerPoint, 44); if (s) return openStation(s.key, { fromMap: true }); }
    if (state.selected) { state.selected = null; syncPins(); }
    if (state.radarKeys.size) clearRadar();
  });
}

function fitInitial() {
  if (!map) return;
  if (state.user) map.setView([state.user.lat, state.user.lng], 12);
  else map.fitBounds([[45.0, -75.0], [48.2, -69.5]], { animate: false });
}

function syncPins() {
  if (!map || !state.data) return;
  const fi = state.fuel;
  const want = new Set();
  const add = [];
  for (const s of listed) {
    want.add(s.key);
    let m = markers.get(s.key);
    const p = s.prices[fi];
    if (!m) {
      m = L.marker([s.lat, s.lng], { icon: pinIcon(s), price: p, title: `${title(s)}, ${fmt1(p)} cents`, riseOnHover: true });
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); openStation(s.key, { fromMap: true }); });
      m._key = s.key;
      markers.set(s.key, m);
    }
    m.options.price = p;
    m.options.zIndexOffset = Math.round(-p * 10);
    m.setIcon(pinIcon(s));
    add.push(m);
  }
  const drop = [];
  for (const [k, m] of markers) if (!want.has(k)) drop.push(m);
  cluster.clearLayers();
  cluster.addLayers(add);
  for (const m of drop) markers.delete(m._key);
  if (state.heat && heatLayer) heatLayer.redraw();
}

function renderBest() {
  const el = $('#best');
  if (!map || !state.data || state.view !== 'map') { el.hidden = true; return; }
  const b = map.getBounds();
  let best = null;
  for (const s of listed) {
    if (!b.contains([s.lat, s.lng])) continue;
    const p = s.prices[state.fuel];
    if (!best || p < best.prices[state.fuel]) best = s;
  }
  if (!best) {
    el.hidden = false; el.dataset.key = '';
    el.innerHTML = `<div class="card__row"><span class="t-overline">Aucune station dans cette zone</span></div><div class="card__meta">Déplacez la carte ou ajustez les filtres.</div>`;
    return;
  }
  const p = best.prices[state.fuel];
  const d = distTo(best);
  el.hidden = false; el.dataset.key = best.key;
  el.innerHTML = `
    <div class="card__row"><span class="t-overline">Le moins cher ici</span><span class="fresh"></span></div>
    <div class="card__row">
      <span class="avatar avatar--brand" style="--bb:${brandColors(best.brand)[0]};--bb-on:${brandColors(best.brand)[1]}" aria-hidden="true">${esc(initials(best.brand))}</span>
      <div style="flex:1;min-width:0"><div class="card__title">${esc(title(best))}</div>
      <div class="card__meta">${brandBadge(best.brand, 'brand-badge--sm')} ${d != null ? fmtDist(d) + ' · ' : ''}${esc(best.addr)}</div></div>
      ${priceHTML(p, 'lg', stationLevel(best), { roll: state.roll })}
    </div>`;
  el.setAttribute('aria-label', `Le moins cher dans cette zone : ${title(best)}, ${fmt1(p)} cents. Ouvrir la fiche`);
  renderFresh();
}

function showUser() {
  if (!map || !state.user) return;
  const icon = L.divIcon({ className: 'lp-icon', iconSize: [0, 0], iconAnchor: [0, 0], html: '<div class="me" aria-label="Votre position"></div>' });
  if (meMarker) meMarker.setLatLng([state.user.lat, state.user.lng]);
  else meMarker = L.marker([state.user.lat, state.user.lng], { icon, interactive: false, keyboard: false, zIndexOffset: 100000 }).addTo(map);
}

// ---- location ------------------------------------------------------------------------------
function locate({ fly = true, quiet = false, onDone } = {}) {
  if (!navigator.geolocation) { if (!quiet) toast('La géolocalisation n’est pas disponible sur cet appareil.'); return; }
  const btn = $('#btn-locate');
  btn.setAttribute('aria-busy', 'true');
  navigator.geolocation.getCurrentPosition((pos) => {
    btn.removeAttribute('aria-busy');
    state.user = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    showUser();
    recompute();
    if (fly && map) map.setView([state.user.lat, state.user.lng], Math.max(map.getZoom(), 12));
    renderAll();
    if (onDone) onDone();
  }, (err) => {
    btn.removeAttribute('aria-busy');
    if (!quiet) toast(err.code === 1 ? 'Position refusée. Autorisez-la dans les réglages du navigateur.' : 'Position introuvable pour le moment.');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}

// ---- list ----------------------------------------------------------------------------------
function itemHTML(s, { favMark = false } = {}) {
  const p = s.prices[state.fuel];
  const lvl = stationLevel(s);
  const d = distTo(s);
  const isFav = state.favs.has(s.key);
  const city = s.addr;
  return `<li><button class="li li--button" data-key="${esc(s.key)}">
    <span class="avatar avatar--brand" style="--bb:${brandColors(s.brand)[0]};--bb-on:${brandColors(s.brand)[1]}" aria-hidden="true">${esc(initials(s.brand))}</span>
    <span class="li__text"><span class="li__primary" style="display:block">${esc(title(s))}</span>
      <span class="li__secondary clamp" style="display:block">${brandBadge(s.brand, 'brand-badge--sm')} ${d != null ? fmtDist(d) + ' · ' : ''}${esc(city)}</span></span>
    <span class="li__trail">${priceHTML(p, 'md', lvl, { roll: state.roll })}${lvl ? `<span class="level level--${lvl}">${LEVEL_LABEL[lvl]}</span>` : ''}</span>
    ${isFav && !favMark ? `<span class="li__lead fav" title="Favori">${ico('heart')}<span class="sr-only">Favori</span></span>` : ''}
  </button></li>`;
}

function renderList() {
  const ul = $('#list');
  const hint = $('#list-hint');
  hint.innerHTML = '';
  if (!state.user) {
    hint.innerHTML = `<div class="card card--filled hint-card"><div class="card__row">${ico('locate')}<div style="flex:1;min-width:0"><div class="card__title">Près de vous</div><div class="card__meta">Activez la position pour trier par distance. Sinon, voici les moins chers du Québec.</div></div><button class="btn btn--contained btn--sm" data-act="locate">Activer</button></div></div>`;
  }
  $('#sort [data-sort="dist"]').disabled = !state.user;
  $$('#sort [data-sort]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === (state.user ? state.sort : 'price'))));
  if (!state.data) { ul.innerHTML = ''; return; }
  if (!listed.length) {
    ul.innerHTML = `<li class="empty">${ico('search')}<div class="t-subtitle1">Aucune station trouvée</div><div class="t-body2">${state.user && state.radius ? `Aucune dans ${state.radius} km avec ces filtres. ` : ''}Essayez d’élargir la recherche ou de réinitialiser les filtres.</div><button class="btn btn--outlined" data-act="open-filters">Filtres</button></li>`;
    return;
  }
  const n = Math.min(state.shown, listed.length);
  let html = '';
  for (let i = 0; i < n; i++) html += itemHTML(listed[i]);
  if (n < listed.length) html += `<li class="more"><button class="btn btn--outlined" data-act="more">Afficher plus (${listed.length - n})</button></li>`;
  ul.innerHTML = html;
}

function renderFavs() {
  const ul = $('#favs');
  const items = [...state.favs].map((k) => byKey.get(k)).filter(Boolean);
  if (!state.favs.size) {
    ul.innerHTML = `<li class="empty">${ico('heart')}<div class="t-subtitle1">Aucun favori pour l’instant</div><div class="t-body2">Touchez le cœur dans la fiche d’une station pour la retrouver ici, avec son prix à jour.</div></li>`;
    return;
  }
  if (!state.data) { ul.innerHTML = ''; return; }
  const fi = state.fuel;
  items.sort((a, b) => (a.prices[fi] ?? 1e9) - (b.prices[fi] ?? 1e9));
  ul.innerHTML = items.map((s) => favItem(s)).join('') + (items.length < state.favs.size ? `<li class="empty"><div class="t-body2">${state.favs.size - items.length} favori(s) absent(s) des données actuelles (station fermée ?).</div></li>` : '');
}

function favItem(s) {
  const p = s.prices[state.fuel];
  const lvl = stationLevel(s);
  const d = distTo(s);
  return `<li><button class="li li--button" data-key="${esc(s.key)}">
    <span class="avatar avatar--brand" style="--bb:${brandColors(s.brand)[0]};--bb-on:${brandColors(s.brand)[1]}" aria-hidden="true">${esc(initials(s.brand))}</span>
    <span class="li__text"><span class="li__primary" style="display:block">${esc(title(s))}</span>
    <span class="li__secondary clamp" style="display:block">${brandBadge(s.brand, 'brand-badge--sm')} ${d != null ? fmtDist(d) + ' · ' : ''}${esc(s.addr)}</span>${watchLine(s)}</span>
    <span class="li__trail">${priceHTML(p, 'md', lvl, { roll: state.roll })}${lvl ? `<span class="level level--${lvl}">${LEVEL_LABEL[lvl]}</span>` : `<span class="t-caption">${FUELS[state.fuel]} n/d</span>`}</span>
  </button></li>`;
}

// ---- sheets --------------------------------------------------------------------------------
let lastFocus = null;
function openSheet(html, { label } = {}) {
  const sh = $('#sheet');
  lastFocus = document.activeElement;
  sh.innerHTML = `<span class="sheet__grab"></span>${html}`;
  if (label) sh.setAttribute('aria-label', label);
  $('#backdrop').hidden = false;
  sh.hidden = false;
  // restart animation
  sh.style.animation = 'none'; void sh.offsetWidth; sh.style.animation = '';
  const first = $('[data-focus]', sh) || $('button, [href], input, select', sh);
  if (first) first.focus({ preventScroll: true });
}
function closeSheet() {
  const sh = $('#sheet');
  if (sh.hidden) return;
  sh.hidden = true;
  $('#backdrop').hidden = true;
  sh.innerHTML = '';
  if (state.selected) { const k = state.selected; state.selected = null; refreshPin(k); }
  state.sheet = null;
  if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
}
function refreshPin(key) {
  const m = markers.get(key), s = byKey.get(key);
  if (m && s && cluster) m.setIcon(pinIcon(s));
}

const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
const directionsURL = (s) => (isApple
  ? `https://maps.apple.com/?daddr=${s.lat},${s.lng}&dirflg=d`
  : `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`);

function openStation(key, { fromMap = false } = {}) {
  const s = byKey.get(key);
  if (!s) return;
  const prev = state.selected;
  state.selected = key;
  state.sheet = { type: 'station', key };
  if (prev && prev !== key) refreshPin(prev);
  refreshPin(key);
  const fi = state.fuel;
  const p = s.prices[fi];
  const lvl = stationLevel(s);
  const d = distTo(s);
  const fav = state.favs.has(key);
  const rows = FUELS.map((f, i) => {
    const pp = s.prices[i];
    const l = levelOf(stats[i], s.region, pp);
    const cur = i === fi;
    const sub = cur && pp != null && stats[i] ? (() => { const a = (stats[i].regions.get(s.region) || stats[i].all).avg - pp; return `<small>${Math.abs(a) < 0.05 ? 'Dans la moyenne' : `${fmt1(Math.abs(a))}¢ ${a > 0 ? 'sous' : 'au-dessus de'} la moyenne de la région`}</small>`; })() : '';
    return `<div class="sign__row${cur ? ' is-current' : ''}"><div class="sign__fuel">${f}${sub}</div>${priceHTML(pp, cur ? 'lg' : 'md', cur ? l : null)}</div>`;
  }).join('');
  const bestNear = isBestNearby(s);
  openSheet(`
    <div class="sheet__scroll stack" style="--gap:var(--sp-16)">
      <div class="sheet__bar">
        <div class="card__row" style="min-width:0;flex:1">
          <span class="avatar avatar--lg avatar--brand" style="--bb:${brandColors(s.brand)[0]};--bb-on:${brandColors(s.brand)[1]}" aria-hidden="true">${esc(initials(s.brand))}</span>
          <div style="min-width:0"><h2 class="t-h3" id="sheet-title" tabindex="-1" data-focus>${esc(title(s))}</h2>
          <div class="card__meta">${brandBadge(s.brand)} ${esc(s.addr)}${d != null ? ' · ' + fmtDist(d) : ''}</div></div>
        </div>
        <div class="stack stack--row">
          <button class="iconbtn" data-act="share" aria-label="Partager">${ico('share')}</button>
          <button class="iconbtn" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${ico('heart')}</button>
          <button class="iconbtn" data-act="close" aria-label="Fermer">${ico('close')}</button>
        </div>
      </div>
      <div class="card__row" style="justify-content:space-between">
        <span class="stack stack--row" style="--gap:var(--sp-8);flex-wrap:wrap">${lvl ? `<span class="level level--${lvl}">${LEVEL_LABEL[lvl]}</span>` : ''}${bestNear ? `<span class="level level--cheap best-tag">${ico('star')}Meilleur prix près de vous</span>` : ''}</span>
        <button class="fresh fresh-btn" data-refresh type="button"></button>
      </div>
      <div class="sign"><div class="sign__head"><span>Prix affichés</span><span>¢ / litre</span></div>${rows}</div>
      <div id="calc-slot"></div>
      <div id="watch-slot"></div>
      <div id="hist-slot"></div>
      <div class="accordion"><details><summary>${ico('info')}Détails de la station${ico('chevron-down')}</summary>
        <div class="acc-body">Bannière : ${esc(s.brand)}<br>Exploitant : ${esc(s.name)}<br>Région : ${esc(s.region || '—')}<br>Adresse : ${esc(s.addr)}</div></details></div>
    </div>
    <div class="sheet__cta">
      <a class="btn btn--contained btn--lg btn--block" href="${directionsURL(s)}" target="_blank" rel="noopener">${ico('directions')}Itinéraire</a>
      <div class="t-caption">Ouvre ${isApple ? 'Apple Plans' : 'Google Maps'} · Données : Régie de l’énergie du Québec</div>
    </div>`, { label: title(s) });
  renderFresh();
  renderCalc(s);
  renderWatchSlot(s);
  renderHistory(s);
  if (bestNear) {
    const id = `${s.key}|${fi}|${p}`;
    if (!celebrated.has(id)) { celebrated.add(id); confetti($('#app')); vibrate([30, 40, 30]); }
  }
  if (fromMap && map && state.view === 'map') {
    const pt = map.latLngToContainerPoint([s.lat, s.lng]);
    const sz = map.getSize();
    map.panBy([pt.x - sz.x / 2, pt.y - sz.y * 0.2], { animate: true, duration: 0.25 });
  }
}

function toggleFav(key) {
  if (state.favs.has(key)) state.favs.delete(key); else state.favs.add(key);
  store.set('favs', [...state.favs]);
  refreshPin(key);
  const btn = $('#sheet [data-act="fav"]');
  if (btn) {
    const on = state.favs.has(key);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Retirer des favoris' : 'Ajouter aux favoris');
  }
  if (!state.favs.has(key) && state.watch[key]) { delete state.watch[key]; store.set('watch', state.watch); }
  toast(state.favs.has(key) ? 'Ajouté aux favoris' : 'Retiré des favoris');
  const s = byKey.get(key);
  if (s && state.selected === key) renderWatchSlot(s);
  checkWatches(false);
  renderFavs();
}

// ---- fun: best price nearby ----------------------------------------------------------------
const NEAR_KM = 10;
function isBestNearby(s) {
  if (!state.user || !visible.length) return false;
  const fi = state.fuel, p = s.prices[fi];
  if (p == null || distTo(s) > NEAR_KM) return false;
  for (const o of visible) {
    const q = o.prices[fi];
    if (q < p && distTo(o) <= NEAR_KM) return false;
  }
  return true;
}

// ---- fun: savings calculator ---------------------------------------------------------------
function nearestTo(lat, lng, fi, exceptKey) {
  let best = null, bd = Infinity;
  for (const o of state.data.stations) {
    if (o.key === exceptKey || o.prices[fi] == null) continue;
    const d = distanceKm(lat, lng, o.lat, o.lng);
    if (d < bd) { bd = d; best = o; }
  }
  return best ? { s: best, d: bd } : null;
}

function renderCalc(s) {
  const slot = $('#calc-slot');
  const fi = state.fuel, p = s.prices[fi];
  if (!slot || p == null) return;
  slot.innerHTML = `<div class="card card--outlined calc">
    <div class="card__row" style="justify-content:space-between;align-items:center">
      <div class="t-overline">Calculateur d’économies</div>
      <label class="calc__lit"><span class="sr-only">Litres</span><input id="calc-l" type="number" inputmode="decimal" min="1" max="500" step="1" value="${state.litres}" aria-label="Litres à mettre"><span aria-hidden="true">L</span></label>
    </div>
    <div id="calc-out" class="stack" style="--gap:var(--sp-12);margin-top:var(--sp-12)" aria-live="polite"></div></div>`;
  updateCalc(s.key);
}

function calcRow(label, sub, delta, L) {
  const amt = delta * L / 100;
  const cls = Math.abs(amt) < 0.005 ? 'same' : amt > 0 ? 'cheap' : 'pricey';
  const word = cls === 'same' ? 'Même prix' : amt > 0 ? 'Économie' : 'Surcoût';
  return `<div class="calc__row"><div class="calc__what"><span class="t-subtitle2">${label}</span><small class="t-caption">${sub}</small></div>
    <div class="calc__amt calc__amt--${cls}"><small>${word}</small><b class="tnum">${cls === 'same' ? '0,00 $' : fmtMoney(Math.abs(amt))}</b></div></div>`;
}

function updateCalc(key) {
  const out = $('#calc-out'), s = byKey.get(key);
  if (!out || !s) return;
  const fi = state.fuel, p = s.prices[fi], L = state.litres;
  const rows = [];
  const ref = state.user ? nearestTo(state.user.lat, state.user.lng, fi) : nearestTo(s.lat, s.lng, fi, s.key);
  if (ref && ref.s.key !== s.key) {
    const rp = ref.s.prices[fi];
    rows.push(calcRow(`Ici plutôt qu’à ${esc(title(ref.s))}`, `${state.user ? 'La plus proche de vous' : 'La plus proche d’ici'} · ${fmtDist(ref.d)} · ${fmt1(rp)}¢`, rp - p, L));
  } else if (ref) rows.push(`<div class="t-body2">C’est la station la plus proche de vous.</div>`);
  const st = stats[fi].regions.get(s.region) || stats[fi].all;
  if (st) rows.push(calcRow(`Ici plutôt qu’au prix moyen`, `${s.region ? 'Moyenne de la région' : 'Moyenne du Québec'} · ${fmt1(st.avg)}¢`, st.avg - p, L));
  out.innerHTML = `<div class="t-body2">Plein de ${L} L de ${FUELS[fi].toLowerCase()} à ${fmt1(p)}¢/L : ${fmtMoney(p * L / 100)}</div>${rows.join('')}`;
}

// ---- fun: price watch (target price on a favourite) ----------------------------------------
function watchHits() {
  const out = [];
  for (const [k, w] of Object.entries(state.watch)) {
    const s = byKey.get(k), p = s && s.prices[w.fuel];
    if (s && p != null && p <= w.price) out.push({ s, w, p });
  }
  return out;
}

function checkWatches(announce) {
  if (!state.data) return;
  const hits = watchHits();
  const dot = $('#favs-dot');
  if (dot) dot.hidden = !hits.length;
  if (!announce) return;
  const fresh = hits.filter((h) => !announced.has(`${h.s.key}|${h.w.fuel}|${h.p}`));
  fresh.forEach((h) => announced.add(`${h.s.key}|${h.w.fuel}|${h.p}`));
  if (!fresh.length) return;
  const h = fresh[0];
  toast(fresh.length === 1 ? `Prix cible atteint : ${title(h.s)}, ${fmt1(h.p)}¢ (${FUELS[h.w.fuel]})` : `${fresh.length} favoris sont sous votre prix cible`);
  vibrate(30);
}

function watchLine(s) {
  const w = state.watch[s.key];
  if (!w) return '';
  const p = s.prices[w.fuel];
  const hit = p != null && p <= w.price;
  return `<span class="li__secondary watch-line${hit ? ' is-hit' : ''}" style="display:block">${ico('bell')}Cible ${fmt1(w.price)}¢ · ${FUELS[w.fuel]}${hit ? ` · atteinte (${fmt1(p)}¢)` : p != null ? ` · actuel ${fmt1(p)}¢` : ''}</span>`;
}

function renderWatchSlot(s) {
  const slot = $('#watch-slot');
  if (!slot) return;
  if (!state.favs.has(s.key)) { slot.innerHTML = `<div class="t-caption watch-hint">${ico('bell')}Ajoutez cette station aux favoris pour fixer un prix cible.</div>`; return; }
  const w = state.watch[s.key];
  const p = s.prices[state.fuel];
  if (w) {
    const cur = s.prices[w.fuel];
    const hit = cur != null && cur <= w.price;
    slot.innerHTML = `<div class="card card--outlined"><div class="card__row" style="justify-content:space-between;align-items:center">
      <div><div class="t-overline">Alerte de prix</div><div class="card__meta">${hit ? `<b class="watch-ok">Cible atteinte</b> : ${fmt1(cur)}¢` : `Je vous le dirai sous ${fmt1(w.price)}¢`} · ${FUELS[w.fuel]}</div></div>
      <button class="btn btn--text btn--sm" data-act="watch-clear">Retirer</button></div></div>`;
    return;
  }
  const sug = p != null ? (Math.floor(p) - 2).toFixed(1) : '';
  slot.innerHTML = `<div class="card card--outlined"><div class="t-overline">Alerte de prix</div>
    <div class="card__meta" style="margin:var(--sp-4) 0 var(--sp-12)">Vérifiée à chaque ouverture de l’app et à chaque mise à jour (${FUELS[state.fuel]}).</div>
    <div class="card__row"><div class="field field--outlined" style="flex:1"><label class="field__label" for="w-price">Prix cible (¢/L)</label><div class="field__box"><input id="w-price" type="number" inputmode="decimal" min="1" step="0.1" placeholder="${sug}"></div></div>
    <button class="btn btn--contained" data-act="watch-save">Activer</button></div></div>`;
}

function saveWatch(key) {
  const inp = $('#w-price');
  const v = parseFloat(String(inp && inp.value).replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) { toast('Entrez un prix cible, par exemple 165,9'); if (inp) inp.focus(); return; }
  state.watch[key] = { fuel: state.fuel, price: Math.round(v * 10) / 10 };
  store.set('watch', state.watch);
  const s = byKey.get(key);
  renderWatchSlot(s);
  checkWatches(true);
  if (!watchHits().some((h) => h.s.key === key)) toast(`Alerte activée sous ${fmt1(state.watch[key].price)}¢`);
  renderFavs();
}

function clearWatch(key) {
  delete state.watch[key];
  store.set('watch', state.watch);
  renderWatchSlot(byKey.get(key));
  checkWatches(false);
  renderFavs();
  toast('Alerte retirée');
}

// ---- fun: price history and trends ---------------------------------------------------------
async function renderHistory(s) {
  const slot = $('#hist-slot');
  if (!slot) return;
  const fi = state.fuel;
  slot.innerHTML = `<div class="card card--outlined hist"><div class="t-overline">Historique des prix</div><div class="t-body2" style="margin-top:var(--sp-8)">Chargement…</div></div>`;
  let html;
  try {
    const [hist, id] = await Promise.all([loadHistory(), stationId(s.key)]);
    const { pts, first } = stationSeries(hist, id, fi, s.prices[fi]);
    const tr = trendOf(pts);
    const rtr = trendOf(regionSeries(hist, s.region, fi));
    const since = first ? new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(first) : null;
    if (pts.length >= 2) {
      html = `<div class="hist__trend hist__trend--${tr.dir}">${ico(tr.dir === 'down' ? 'trend-down' : tr.dir === 'up' ? 'trend-up' : 'minus')}<span class="t-subtitle2">${trendText(tr)}</span></div>
        ${chartSVG(pts)}`;
    } else {
      html = `<div class="t-body2">${pts.length ? `Le prix n’a pas bougé depuis le début des relevés${since ? ` (${since})` : ''}.` : 'Pas encore de relevés pour cette station.'} Les prix sont enregistrés chaque heure : le graphique se remplit avec le temps.</div>`;
    }
    if (rtr && s.region) html += `<div class="t-caption" style="margin-top:var(--sp-8)">Moyenne ${esc(s.region)} : ${trendText(rtr).toLowerCase()}.</div>`;
  } catch (e) {
    html = `<div class="t-body2">Historique indisponible pour le moment${state.offline ? ' (hors ligne)' : ''}.</div>`;
  }
  const cur = $('#hist-slot');
  if (cur && state.sheet && state.sheet.key === s.key) cur.innerHTML = `<div class="card card--outlined hist"><div class="t-overline">Historique des prix</div>${html}</div>`;
}

// ---- fun: heat map -------------------------------------------------------------------------
function heatPoints() {
  const fi = state.fuel, out = [];
  for (const s of visible) {
    const p = s.prices[fi];
    const st = stats[fi] && (stats[fi].regions.get(s.region) || stats[fi].all);
    let t = 0.5;
    if (st && st.hi > st.lo) t = Math.max(0, Math.min(1, (p - st.lo) / (st.hi - st.lo)));
    else if (st) t = p <= st.lo ? 0 : 1;
    out.push({ lat: s.lat, lng: s.lng, t });
  }
  return out;
}

function nearestOnScreen(pt, maxPx) {
  let best = null, bd = maxPx;
  for (const s of visible) {
    const q = map.latLngToContainerPoint([s.lat, s.lng]);
    const d = Math.hypot(q.x - pt.x, q.y - pt.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function setHeat(on) {
  if (!map || !heatLayer) return;
  state.heat = on;
  if (on) { map.removeLayer(cluster); map.addLayer(heatLayer); } else { map.removeLayer(heatLayer); map.addLayer(cluster); }
  $('#btn-heat').setAttribute('aria-pressed', String(on));
  $('#heat-legend').hidden = !on;
  if (on) toast('Touchez la carte près d’une station pour voir sa fiche');
}

// ---- fun: deal radar -----------------------------------------------------------------------
function clearRadar() {
  if (!state.radarKeys.size) return;
  const old = [...state.radarKeys];
  state.radarKeys.clear();
  old.forEach(refreshPin);
}

function bearing(a, b) {
  const r = Math.PI / 180;
  return (Math.atan2((b.lng - a.lng) * Math.cos(a.lat * r), b.lat - a.lat) / r + 360) % 360;
}

function openRadar() {
  if (!state.data) { toast('Les prix se chargent encore…'); return; }
  if (!state.user) { toast('Recherche de votre position…'); locate({ onDone: openRadar }); return; }
  const fi = state.fuel;
  let R = NEAR_KM, pool = [];
  for (const r of [NEAR_KM, 25]) { R = r; pool = visible.filter((s) => distTo(s) <= r); if (pool.length >= 3) break; }
  if (!pool.length) { toast('Aucune station à moins de 25 km avec ces filtres.'); return; }
  pool.sort((a, b) => a.prices[fi] - b.prices[fi] || distTo(a) - distTo(b));
  const top = pool.slice(0, 5);
  clearRadar();
  top.forEach((s) => state.radarKeys.add(s.key));
  top.forEach((s) => refreshPin(s.key));
  const SWEEP = 1.4;
  const dots = top.map((s, i) => {
    const b = bearing(state.user, s), f = Math.min(1, distTo(s) / R) * 0.42;
    const x = 50 + Math.sin(b * Math.PI / 180) * f * 100, y = 50 - Math.cos(b * Math.PI / 180) * f * 100;
    return `<i class="radar__dot" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;animation-delay:${(b / 360 * SWEEP).toFixed(2)}s" aria-hidden="true">${i + 1}</i>`;
  }).join('');
  const rows = top.map((s, i) => `<li><button class="li li--button" data-key="${esc(s.key)}">
      <span class="avatar radar__rank" aria-hidden="true">${i + 1}</span>
      <span class="li__text"><span class="li__primary" style="display:block">${esc(title(s))}</span><span class="li__secondary clamp" style="display:block">${fmtDist(distTo(s))} · ${esc(s.addr)}</span></span>
      <span class="li__trail">${priceHTML(s.prices[fi], 'md', stationLevel(s))}</span></button></li>`).join('');
  state.sheet = { type: 'radar' };
  const best = top[0].prices[fi], avg = pool.reduce((a, s) => a + s.prices[fi], 0) / pool.length;
  openSheet(`
    <div class="sheet__scroll stack" style="--gap:var(--sp-16)">
      <div class="sheet__bar"><h2 class="t-h3" id="sheet-title" tabindex="-1" data-focus>Radar des aubaines</h2><button class="iconbtn" data-act="close" aria-label="Fermer">${ico('close')}</button></div>
      <div class="radar-wrap"><div class="radar radar--lg" role="img" aria-label="Radar : les ${top.length} stations les moins chères dans un rayon de ${R} km"><span class="radar__me"></span>${dots}<span class="radar__range">${R} km</span></div></div>
      <p class="t-body2" style="text-align:center">${top.length} moins chers dans ${R} km · ${FUELS[fi]}${avg - best >= 0.05 ? ` · jusqu’à ${fmt1(avg - best)}¢ sous la moyenne des alentours` : ''}</p>
      <ul class="list radar__list">${rows}</ul>
    </div>
    <div class="sheet__cta"><button class="btn btn--contained btn--lg btn--block" data-act="radar-map">${ico('map')}Voir sur la carte</button></div>`, { label: 'Radar des aubaines' });
}

function radarOnMap() {
  closeSheet();
  setView('map');
  if (map && state.radarKeys.size) {
    const pts = [...state.radarKeys].map((k) => byKey.get(k)).filter(Boolean).map((s) => [s.lat, s.lng]);
    if (state.user) pts.push([state.user.lat, state.user.lng]);
    setTimeout(() => map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14 }), 50);
  }
}

// ---- fun: share card -----------------------------------------------------------------------
const cityOf = (s) => { const i = s.addr.lastIndexOf(','); return (i >= 0 ? s.addr.slice(i + 1) : '').trim(); };
let shareBlob = null, shareUrl = null;

async function shareStation(key) {
  const s = byKey.get(key);
  const fi = state.fuel, p = s.prices[fi];
  if (p == null) { toast('Pas de prix à partager pour ce carburant'); return; }
  const place = cityOf(s) || s.region || 'Québec';
  const peers = state.data.stations.filter((o) => o.prices[fi] != null && cityOf(o) === place);
  const cheapest = peers.length >= 2 && peers.every((o) => o.prices[fi] >= p);
  const text = `${cheapest ? `${FUELS[fi]} le moins cher à ${place} en ce moment` : `${FUELS[fi]} à ${place}`} : ${fmt1(p)}¢/L chez ${title(s)} (Le Plein)`;
  state.sheet = { type: 'share', key, text };
  openSheet(`
    <div class="sheet__scroll stack" style="--gap:var(--sp-16)">
      <div class="sheet__bar"><h2 class="t-h3" id="sheet-title" tabindex="-1" data-focus>Partager</h2><button class="iconbtn" data-act="back-station" aria-label="Retour à la station">${ico('back')}</button></div>
      <div id="share-prev" class="share-prev"><div class="t-body2">Création de l’image…</div></div>
    </div>
    <div class="sheet__cta stack" style="--gap:var(--sp-8)">
      <button class="btn btn--contained btn--lg btn--block" data-act="share-go" disabled>${ico('share')}Partager l’image</button>
      <div class="stack stack--row" style="--gap:var(--sp-8)"><button class="btn btn--outlined" style="flex:1" data-act="share-save" disabled>Enregistrer</button><button class="btn btn--outlined" style="flex:1" data-act="share-copy">${ico('copy')}Copier le texte</button></div>
    </div>`, { label: 'Partager' });
  try {
    const blob = await renderShareCard({
      headline: cheapest ? `${FUELS[fi]} le moins cher à` : `${FUELS[fi]} à`, place, price: p, fuel: FUELS[fi], name: title(s), addr: s.addr, level: stationLevel(s),
      when: `Relevé du ${new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long', timeStyle: 'short' }).format(state.data.generatedAt)}`,
    });
    if (!state.sheet || state.sheet.type !== 'share' || state.sheet.key !== key) return;
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    shareBlob = blob; shareUrl = URL.createObjectURL(blob);
    $('#share-prev').innerHTML = `<img src="${shareUrl}" alt="${esc(text)}" class="share-img">`;
    $$('#sheet [data-act="share-go"], #sheet [data-act="share-save"]').forEach((b) => (b.disabled = false));
  } catch (e) {
    const pv = $('#share-prev');
    if (pv) pv.innerHTML = `<div class="t-body2">L’image n’a pas pu être créée. Vous pouvez quand même copier le texte.</div>`;
  }
}

async function shareGo() {
  if (!shareBlob || !state.sheet) return;
  const text = state.sheet.text, url = location.href.split('#')[0];
  const file = new File([shareBlob], 'le-plein.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, title: 'Le Plein' }); return; }
    if (navigator.share) { await navigator.share({ title: 'Le Plein', text, url }); return; }
    shareSave();
  } catch (e) { if (e && e.name !== 'AbortError') toast('Partage impossible'); }
}

function shareSave() {
  if (!shareUrl) return;
  const a = document.createElement('a');
  a.href = shareUrl; a.download = 'le-plein.png';
  document.body.appendChild(a); a.click(); a.remove();
  toast('Image enregistrée');
}

async function shareCopy() {
  const text = state.sheet && state.sheet.text;
  if (!text) return;
  try { await navigator.clipboard.writeText(`${text} ${location.href.split('#')[0]}`); toast('Texte copié'); } catch { toast('Copie impossible'); }
}

function openFilters() {
  state.sheet = { type: 'filters' };
  const st = state.data ? state.data.stations : [];
  const regions = [...new Set(st.map((s) => s.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const counts = new Map();
  for (const s of st) counts.set(s.brand, (counts.get(s.brand) || 0) + 1);
  const brands = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map((x) => x[0]);
  const opt = (v, label, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
  openSheet(`
    <div class="sheet__scroll stack" style="--gap:var(--sp-16)">
      <div class="sheet__bar"><h2 class="t-h3" id="sheet-title" tabindex="-1" data-focus>Filtres et réglages</h2><button class="iconbtn" data-act="close" aria-label="Fermer">${ico('close')}</button></div>
      <div class="form">
        <div class="field field--outlined select"><label class="field__label" for="f-region">Région</label><div class="field__box"><select id="f-region">${opt('', 'Toutes les régions', state.region)}${regions.map((r) => opt(r, r, state.region)).join('')}</select></div></div>
        <div class="field field--outlined select"><label class="field__label" for="f-brand">Bannière</label><div class="field__box"><select id="f-brand">${opt('', 'Toutes les bannières', state.brand)}${brands.map((b) => opt(b, b, state.brand)).join('')}</select></div></div>
        <div class="field field--outlined"><label class="field__label" for="f-max">Prix maximum (¢/L)</label><div class="field__box"><input id="f-max" type="number" inputmode="decimal" min="0" step="0.1" placeholder="Aucun" value="${state.maxPrice ?? ''}"></div><div class="field__helper">S’applique au carburant choisi : ${FUELS[state.fuel]}.</div></div>
        <div class="field field--outlined select"><label class="field__label" for="f-radius">Rayon de la liste</label><div class="field__box"><select id="f-radius">${[[5, '5 km'], [10, '10 km'], [25, '25 km'], [50, '50 km'], [0, 'Tout le Québec']].map(([v, l]) => opt(v, l, state.radius)).join('')}</select></div><div class="field__helper" id="f-radius-help"></div></div>
        <div class="field"><span class="field__label" id="f-theme-l">Thème</span>
          <div class="toggle toggle--block" role="group" aria-labelledby="f-theme-l" id="f-theme">${[['auto', 'Auto'], ['light', 'Jour'], ['dark', 'Nuit']].map(([v, l]) => `<button class="toggle__opt" data-theme-opt="${v}" aria-pressed="${state.theme === v}">${l}</button>`).join('')}</div></div>
      </div>
    </div>
    <div class="sheet__cta">
      <div class="stack stack--row" style="--gap:var(--sp-8)">
        <button class="btn btn--outlined btn--lg" data-act="reset">Réinitialiser</button>
        <button class="btn btn--contained btn--lg" style="flex:1" data-act="close" id="f-done">Voir ${listed.length} stations</button>
      </div>
      <div class="t-caption">Données : Régie de l’énergie du Québec · Carte © OpenStreetMap</div>
    </div>`, { label: 'Filtres et réglages' });
  updateFiltersUI();
}

function updateFiltersUI() {
  const active = !!(state.region || state.brand || state.maxPrice != null);
  $('#filters-dot').hidden = !active;
  $('#btn-filters').setAttribute('aria-label', active ? 'Filtres et réglages (actifs)' : 'Filtres et réglages');
  const done = $('#f-done');
  if (done) done.textContent = `Voir ${listed.length} station${listed.length > 1 ? 's' : ''}`;
  const help = $('#f-radius-help');
  if (help) help.textContent = !state.radius ? 'Aucune limite de distance.' : state.user ? `Stations à moins de ${state.radius} km de votre position.` : 'Le rayon s’applique dès que votre position est connue. Activez-la pour l’utiliser.';
}

// ---- render orchestration ------------------------------------------------------------------
function renderAll() {
  recompute();
  syncPins();
  renderBest();
  renderList();
  renderFavs();
  renderFresh();
  updateFiltersUI();
  state.roll = false;
}

function setView(v) {
  state.view = v;
  document.body.dataset.view = v;
  $$('section[id^="view-"]').forEach((s) => (s.hidden = s.id !== 'view-' + v));
  $$('[data-nav]').forEach((b) => (b.getAttribute('data-nav') === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (v === 'map' && map) setTimeout(() => { map.invalidateSize(); renderBest(); }, 0);
  if (v !== 'map') $('#best').hidden = true;
  if (v === 'list') renderList();
  if (v === 'favs') renderFavs();
}

// ---- events --------------------------------------------------------------------------------
function setFuel(i) {
  state.fuel = i;
  store.set('fuel', i);
  state.roll = true;
  clearRadar();
  $$('#fuel [data-fuel]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.fuel === i)));
  renderAll();
}

function persistFilters() {
  store.set('region', state.region); store.set('brand', state.brand);
  store.set('maxPrice', state.maxPrice); store.set('radius', state.radius);
}

document.addEventListener('click', (e) => {
  const t = e.target;
  const fuel = t.closest('[data-fuel]');
  if (fuel) return setFuel(+fuel.dataset.fuel);
  const nav = t.closest('[data-nav]');
  if (nav) { closeSheet(); return setView(nav.dataset.nav); }
  if (t.closest('[data-refresh]')) return refresh({ manual: true });
  if (t.closest('#btn-filters')) return openFilters();
  if (t.closest('#btn-locate')) return locate();
  if (t.closest('#btn-radar')) return openRadar();
  if (t.closest('#btn-heat')) return setHeat(!state.heat);
  if (t.closest('#backdrop')) return closeSheet();
  const sortB = t.closest('[data-sort]');
  if (sortB && !sortB.disabled) { state.sort = sortB.dataset.sort; state.shown = PAGE; renderAll(); return; }
  const themeB = t.closest('[data-theme-opt]');
  if (themeB) {
    state.theme = themeB.dataset.themeOpt; store.set('theme', state.theme); applyTheme();
    $$('#f-theme [data-theme-opt]').forEach((b) => b.setAttribute('aria-pressed', String(b === themeB)));
    return;
  }
  const act = t.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'close') {
      // The count on the filters button is the list (radius included); the map ignores the radius, so show the list.
      const toList = t.closest('#f-done') && state.user && state.radius && state.view !== 'list';
      closeSheet();
      if (toList) setView('list');
      return;
    }
    if (a === 'fav' && state.selected) return toggleFav(state.selected);
    if (a === 'share' && state.selected) return shareStation(state.selected);
    if (a === 'locate') return locate();
    if (a === 'watch-save' && state.selected) return saveWatch(state.selected);
    if (a === 'watch-clear' && state.selected) return clearWatch(state.selected);
    if (a === 'back-station') { const k = state.sheet && state.sheet.key; return k ? openStation(k) : closeSheet(); }
    if (a === 'share-go') return shareGo();
    if (a === 'share-save') return shareSave();
    if (a === 'share-copy') return shareCopy();
    if (a === 'radar-map') return radarOnMap();
    if (a === 'more') { state.shown += PAGE; return renderList(); }
    if (a === 'open-filters') return openFilters();
    if (a === 'reset') {
      state.region = ''; state.brand = ''; state.maxPrice = null; state.radius = 25; state.q = ''; clearRadar();
      $('#q').value = ''; persistFilters(); renderAll(); closeSheet(); return;
    }
  }
  const item = t.closest('button[data-key]');
  if (item) return openStation(item.dataset.key);
  if (t.closest('#best') && $('#best').dataset.key) return openStation($('#best').dataset.key, { fromMap: true });
});

$('#best').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && $('#best').dataset.key) { e.preventDefault(); openStation($('#best').dataset.key, { fromMap: true }); }
});

document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'f-region') state.region = e.target.value;
  else if (id === 'f-brand') state.brand = e.target.value;
  else if (id === 'f-radius') {
    state.radius = +e.target.value; state.shown = PAGE;
    if (state.radius && !state.user) { toast('Recherche de votre position pour appliquer le rayon…'); locate({ fly: false }); }
  }
  else if (id === 'calc-l') return;
  else if (id === 'f-max') { const v = parseFloat(String(e.target.value).replace(',', '.')); state.maxPrice = Number.isFinite(v) && v > 0 ? v : null; }
  else return;
  persistFilters();
  renderAll();
});

const onSearch = debounce(() => {
  state.q = $('#q').value;
  state.shown = PAGE;
  renderAll();
}, 200);
$('#q').addEventListener('input', onSearch);
$('#q').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  $('#q').blur();
  state.q = $('#q').value;
  renderAll();
  if (state.view === 'map' && map && state.q.trim() && listed.length) {
    const b = L.latLngBounds(listed.slice(0, 400).map((s) => [s.lat, s.lng]));
    map.fitBounds(b, { padding: [48, 48], maxZoom: 14 });
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'calc-l') return;
  const v = parseFloat(String(e.target.value).replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return;
  state.litres = Math.min(500, v);
  store.set('litres', state.litres);
  if (state.selected) updateCalc(state.selected);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  // Keep keyboard focus inside the open sheet (it is a modal dialog).
  if (e.key === 'Tab') {
    const sh = $('#sheet');
    if (sh.hidden) return;
    const f = [...sh.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const a = document.activeElement;
    if (!sh.contains(a)) { e.preventDefault(); f[0].focus(); }
    else if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});

// ---- lifecycle -----------------------------------------------------------------------------
function boot() {
  $$('#fuel [data-fuel]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.fuel === state.fuel)));
  initMap();
  if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', $('#top').offsetHeight + 'px')).observe($('#top'));
  const cached = loadCached();
  if (cached) {
    setData(cached);
    state.offline = false;
    renderAll();
    fitInitial();
    $('#loading').classList.add('done');
  }
  renderFresh();
  refresh();
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); renderFresh(); }, REFRESH_MS);
  setInterval(renderFresh, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.data && Date.now() - state.data.fetchedAt > REFRESH_MS) refresh();
    renderFresh();
  });
  window.addEventListener('online', () => refresh());
  window.addEventListener('offline', () => { state.offline = true; renderFresh(); });
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((r) => { if (r.state === 'granted') locate({ fly: !cached, quiet: true }); }).catch(() => {});
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__lp = { state, setData, renderAll, openStation };
}
boot();
