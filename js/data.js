// Fetches the Régie feed, turns it into compact station records, caches the last copy for offline use.
import { store, brandName } from './util.js';

export const FEED_URL = 'https://regieessencequebec.ca/stations.geojson.gz';
export const FUELS = ['Régulier', 'Super', 'Diesel'];

/** Station record: { key, name, addr, brand, region, lat, lng, prices: [reg, sup, dsl] (null = n/a) } */
export function parseFeed(json) {
  const stations = [];
  for (const f of json.features || []) {
    const p = f.properties || {};
    const c = f.geometry && f.geometry.coordinates;
    if (p.Status !== 'En opération' || !c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const prices = FUELS.map((fuel) => {
      const e = (p.Prices || []).find((x) => x.GasType === fuel);
      const v = e && e.IsAvailable ? parseFloat(e.Price) : NaN;
      return Number.isFinite(v) ? v : null;
    });
    stations.push({
      key: `${p.Name}|${p.Address}`,
      name: p.Name || '',
      addr: p.Address || '',
      brand: brandName(p.brand),
      region: p.Region || '',
      lat: c[1],
      lng: c[0],
      prices,
    });
  }
  const gen = Date.parse(json.metadata && json.metadata.generated_at);
  return { stations, generatedAt: Number.isFinite(gen) ? gen : Date.now() };
}

export function loadCached() {
  const d = store.get('data', null);
  return d && Array.isArray(d.stations) ? d : null;
}

/** Network fetch; resolves { stations, generatedAt, fetchedAt }. Rejects when offline/unreachable. */
export async function fetchStations(url = FEED_URL) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = parseFeed(await res.json());
  data.fetchedAt = Date.now();
  if (!data.stations.length) throw new Error('empty feed');
  store.set('data', data);
  return data;
}

// ---- Price levels, relative to the station's region --------------------------------------
// Terciles per region and fuel: cheapest third = cheap, dearest third = pricey.
export function buildStats(stations, fi) {
  const byRegion = new Map();
  const all = [];
  for (const s of stations) {
    const p = s.prices[fi];
    if (p == null) continue;
    all.push(p);
    if (!byRegion.has(s.region)) byRegion.set(s.region, []);
    byRegion.get(s.region).push(p);
  }
  const mk = (arr) => {
    arr.sort((a, b) => a - b);
    const q = (x) => arr[Math.min(arr.length - 1, Math.floor(arr.length * x))];
    return { n: arr.length, avg: arr.reduce((a, b) => a + b, 0) / arr.length, lo: q(1 / 3), hi: q(2 / 3), min: arr[0], max: arr[arr.length - 1] };
  };
  const out = { all: all.length ? mk(all) : null, regions: new Map() };
  for (const [r, arr] of byRegion) out.regions.set(r, arr.length >= 5 ? mk(arr) : out.all);
  return out;
}

export function levelOf(stats, region, p) {
  if (p == null) return null;
  const s = stats.regions.get(region) || stats.all;
  if (!s) return 'avg';
  if (p <= s.lo && p < s.hi) return 'cheap';
  if (p >= s.hi && p > s.lo) return 'pricey';
  return 'avg';
}

export const LEVEL_LABEL = { cheap: 'Bas prix', avg: 'Moyen', pricey: 'Élevé' };
