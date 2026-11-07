// Le Plein — core app. Map, list, favourites, filters, station sheet, offline, auto-refresh.
import { FUELS, loadCached, fetchStations, buildStats, levelOf, LEVEL_LABEL } from './data.js';
import { norm, esc, fmt1, fmtMoney, fmtDist, ageText, priceHTML, splitPrice, distanceKm, initials, debounce, store } from './util.js';

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
};
if (![0, 1, 2].includes(state.fuel)) state.fuel = 0;

let stats = [null, null, null]; // per fuel: region terciles
let byKey = new Map();
let visible = []; // filters applied (not radius), current fuel has a price
let listed = []; // visible + radius + search, sorted

// ---- theme ---------------------------------------------------------------------------------
const mqDark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const dark = state.theme === 'dark' || (state.theme === 'auto' && mqDark && mqDark.matches);
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const m = $('meta[name="theme-color"]');
  if (m) m.content = dark ? '#101214' : '#F5F1E8';
}
if (mqDark) mqDark.addEventListener('change', applyTheme);
applyTheme();

// ---- derived data --------------------------------------------------------------------------
const stationLevel = (s, fi = state.fuel) => levelOf(stats[fi], s.region, s.prices[fi]);
const title = (s) => (s.brand !== 'Indépendant' ? s.brand : s.name || s.brand);
const distTo = (s) => (state.user ? distanceKm(state.user.lat, state.user.lng, s.lat, s.lng) : null);

function setData(data) {
  state.data = data;
  byKey = new Map(data.stations.map((s) => [s.key, s]));
  stats = [0, 1, 2].map((i) => buildStats(data.stations, i));
  recompute();
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
    setData(data);
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
  const cls = `pin pin--${stationLevel(s)}${state.favs.has(s.key) ? ' pin--fav' : ''}${sel ? ' pin--selected' : ''}`;
  return L.divIcon({
    className: 'lp-icon', iconSize: [0, 0], iconAnchor: [0, 0],
    html: `<div class="${cls}"><span class="pin__plate">${whole}<small>${tenth}</small></span><span class="pin__stalk"></span></div>`,
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
  map.on('moveend', debounce(renderBest, 150));
  map.on('click', () => { if (state.selected) { state.selected = null; syncPins(); } });
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
  for (const s of visible) {
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
}

function renderBest() {
  const el = $('#best');
  if (!map || !state.data || state.view !== 'map') { el.hidden = true; return; }
  const b = map.getBounds();
  let best = null;
  for (const s of visible) {
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
      <span class="avatar" aria-hidden="true">${esc(initials(best.brand))}</span>
      <div style="flex:1;min-width:0"><div class="card__title">${esc(title(best))}</div>
      <div class="card__meta">${d != null ? fmtDist(d) + ' · ' : ''}${esc(best.addr)}</div></div>
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
function locate({ fly = true, quiet = false } = {}) {
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
    <span class="avatar" aria-hidden="true">${esc(initials(s.brand))}</span>
    <span class="li__text"><span class="li__primary" style="display:block">${esc(title(s))}</span>
      <span class="li__secondary clamp" style="display:block">${d != null ? fmtDist(d) + ' · ' : ''}${esc(city)}</span></span>
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
    <span class="avatar" aria-hidden="true">${esc(initials(s.brand))}</span>
    <span class="li__text"><span class="li__primary" style="display:block">${esc(title(s))}</span>
    <span class="li__secondary clamp" style="display:block">${d != null ? fmtDist(d) + ' · ' : ''}${esc(s.addr)}</span></span>
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
  const st = stats[fi].regions.get(s.region) || stats[fi].all;
  const d = distTo(s);
  const fav = state.favs.has(key);
  const diff = p != null && st ? st.avg - p : null;
  const rows = FUELS.map((f, i) => {
    const pp = s.prices[i];
    const l = levelOf(stats[i], s.region, pp);
    const cur = i === fi;
    const sub = cur && pp != null && stats[i] ? (() => { const a = (stats[i].regions.get(s.region) || stats[i].all).avg - pp; return `<small>${Math.abs(a) < 0.05 ? 'Dans la moyenne' : `${fmt1(Math.abs(a))}¢ ${a > 0 ? 'sous' : 'au-dessus de'} la moyenne de la région`}</small>`; })() : '';
    return `<div class="sign__row${cur ? ' is-current' : ''}"><div class="sign__fuel">${f}${sub}</div>${priceHTML(pp, cur ? 'lg' : 'md', cur ? l : null)}</div>`;
  }).join('');
  const save = diff != null && Math.abs(diff) >= 0.05
    ? `<div class="card card--outlined"><div class="card__row" style="justify-content:space-between;align-items:flex-end">
        <div><div class="t-overline">Plein de 50 L</div><div class="card__meta" style="max-width:190px">${diff > 0 ? 'de moins' : 'de plus'} qu’au prix moyen ${esc(s.region ? 'de la région' : 'du Québec')}</div></div>
        <div class="t-h3 tnum" style="color:var(--${diff > 0 ? 'cheap' : 'pricey'}-ink)">${fmtMoney(Math.abs(diff) * 0.5)}</div></div></div>` : '';
  openSheet(`
    <div class="sheet__scroll stack" style="--gap:var(--sp-16)">
      <div class="sheet__bar">
        <div class="card__row" style="min-width:0;flex:1">
          <span class="avatar avatar--lg" aria-hidden="true">${esc(initials(s.brand))}</span>
          <div style="min-width:0"><h2 class="t-h3" id="sheet-title" tabindex="-1" data-focus>${esc(title(s))}</h2>
          <div class="card__meta">${esc(s.addr)}${d != null ? ' · ' + fmtDist(d) : ''}</div></div>
        </div>
        <div class="stack stack--row">
          <button class="iconbtn" data-act="share" aria-label="Partager">${ico('share')}</button>
          <button class="iconbtn" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${ico('heart')}</button>
          <button class="iconbtn" data-act="close" aria-label="Fermer">${ico('close')}</button>
        </div>
      </div>
      <div class="card__row" style="justify-content:space-between">
        ${lvl ? `<span class="level level--${lvl}">${LEVEL_LABEL[lvl]}</span>` : '<span></span>'}
        <button class="fresh fresh-btn" data-refresh type="button"></button>
      </div>
      <div class="sign"><div class="sign__head"><span>Prix affichés</span><span>¢ / litre</span></div>${rows}</div>
      ${save}
      <div class="accordion"><details><summary>${ico('info')}Détails de la station${ico('chevron-down')}</summary>
        <div class="acc-body">Bannière : ${esc(s.brand)}<br>Exploitant : ${esc(s.name)}<br>Région : ${esc(s.region || '—')}<br>Adresse : ${esc(s.addr)}</div></details></div>
    </div>
    <div class="sheet__cta">
      <a class="btn btn--contained btn--lg btn--block" href="${directionsURL(s)}" target="_blank" rel="noopener">${ico('directions')}Itinéraire</a>
      <div class="t-caption">Ouvre ${isApple ? 'Apple Plans' : 'Google Maps'} · Données : Régie de l’énergie du Québec</div>
    </div>`, { label: title(s) });
  renderFresh();
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
  toast(state.favs.has(key) ? 'Ajouté aux favoris' : 'Retiré des favoris');
  renderFavs();
}

async function shareStation(key) {
  const s = byKey.get(key);
  const p = s.prices[state.fuel];
  const text = `${title(s)}, ${s.addr} : ${FUELS[state.fuel]} ${fmt1(p)}¢/L (Le Plein)`;
  const url = location.href.split('#')[0];
  try {
    if (navigator.share) { await navigator.share({ title: 'Le Plein', text, url }); return; }
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Copié dans le presse-papiers');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Partage impossible'); }
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
        <div class="field field--outlined select"><label class="field__label" for="f-radius">Rayon de la liste</label><div class="field__box"><select id="f-radius">${[[5, '5 km'], [10, '10 km'], [25, '25 km'], [50, '50 km'], [0, 'Tout le Québec']].map(([v, l]) => opt(v, l, state.radius)).join('')}</select></div><div class="field__helper">Utilisé quand la position est activée.</div></div>
        <div class="field"><span class="field__label" id="f-theme-l">Thème</span>
          <div class="toggle toggle--block" role="group" aria-labelledby="f-theme-l" id="f-theme">${[['auto', 'Auto'], ['light', 'Jour'], ['dark', 'Nuit']].map(([v, l]) => `<button class="toggle__opt" data-theme-opt="${v}" aria-pressed="${state.theme === v}">${l}</button>`).join('')}</div></div>
      </div>
    </div>
    <div class="sheet__cta">
      <div class="stack stack--row" style="--gap:var(--sp-8)">
        <button class="btn btn--outlined btn--lg" data-act="reset">Réinitialiser</button>
        <button class="btn btn--contained btn--lg" style="flex:1" data-act="close" id="f-done">Voir ${visible.length} stations</button>
      </div>
      <div class="t-caption">Données : Régie de l’énergie du Québec · Carte © OpenStreetMap</div>
    </div>`, { label: 'Filtres et réglages' });
}

function updateFiltersUI() {
  const active = !!(state.region || state.brand || state.maxPrice != null);
  $('#filters-dot').hidden = !active;
  $('#btn-filters').setAttribute('aria-label', active ? 'Filtres et réglages (actifs)' : 'Filtres et réglages');
  const done = $('#f-done');
  if (done) done.textContent = `Voir ${visible.length} station${visible.length > 1 ? 's' : ''}`;
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
    if (a === 'close') return closeSheet();
    if (a === 'fav' && state.selected) return toggleFav(state.selected);
    if (a === 'share' && state.selected) return shareStation(state.selected);
    if (a === 'locate') return locate();
    if (a === 'more') { state.shown += PAGE; return renderList(); }
    if (a === 'open-filters') return openFilters();
    if (a === 'reset') {
      state.region = ''; state.brand = ''; state.maxPrice = null; state.radius = 25; state.q = '';
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
  else if (id === 'f-radius') { state.radius = +e.target.value; state.shown = PAGE; }
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
  if (state.view === 'map' && map && state.q.trim() && visible.length) {
    const b = L.latLngBounds(visible.slice(0, 400).map((s) => [s.lat, s.lng]));
    map.fitBounds(b, { padding: [48, 48], maxZoom: 14 });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});

// ---- lifecycle -----------------------------------------------------------------------------
function boot() {
  $$('#fuel [data-fuel]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.fuel === state.fuel)));
  initMap();
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
