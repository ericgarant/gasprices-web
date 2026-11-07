// Saves a compact snapshot of Québec gas prices into data/history/.
// Run hourly by .github/workflows/snapshot.yml. No dependencies (Node 20+).
//
// Files written:
//   data/history/stations.json    station index: id -> { n, a, b, r, lat, lng }
//   data/history/YYYY-MM-DD.json  per-day price changes: id -> [[ "HH:MM", reg, sup, dsl ], ...]
//                                 a row is added only when a station's prices change
//   data/history/regions.json     hourly averages per region (last 90 days)
//
// Prices are in cents per litre; null means not available.
// Set SNAPSHOT_SOURCE to a local file path to run against saved data (for testing).

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE = process.env.SNAPSHOT_SOURCE || 'https://regieessencequebec.ca/stations.geojson.gz';
const DIR = process.env.SNAPSHOT_DIR || 'data/history';
const TZ = 'America/Toronto'; // same clock as Québec
const FUELS = ['Régulier', 'Super', 'Diesel'];
const REGION_DAYS = 90;

async function loadSource() {
  if (!SOURCE.startsWith('http')) return JSON.parse(await readFile(SOURCE, 'utf8'));
  const res = await fetch(SOURCE, { headers: { 'user-agent': 'gasprices-web snapshot' } });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json(); // the server sends content-encoding: gzip, so fetch decompresses it
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

const stationId = (p) => createHash('sha1').update(`${p.Name}|${p.Address}`).digest('hex').slice(0, 10);

function priceOf(p, fuel) {
  const entry = (p.Prices || []).find((x) => x.GasType === fuel);
  if (!entry || !entry.IsAvailable) return null;
  const value = parseFloat(entry.Price);
  return Number.isFinite(value) ? value : null;
}

function localParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const round1 = (x) => Math.round(x * 10) / 10;

async function main() {
  const data = await loadSource();
  const generated = new Date(data.metadata?.generated_at || Date.now());
  const { day, time } = localParts(generated);
  await mkdir(DIR, { recursive: true });

  const index = await readJson(join(DIR, 'stations.json'), {});
  const dayPath = join(DIR, `${day}.json`);
  const dayFile = await readJson(dayPath, {});
  const regionTotals = {};
  let changed = 0;

  for (const feature of data.features || []) {
    const p = feature.properties || {};
    if (p.Status !== 'En opération') continue;
    const prices = FUELS.map((f) => priceOf(p, f));
    if (prices.every((x) => x === null)) continue;

    const id = stationId(p);
    const [lng, lat] = feature.geometry.coordinates;
    index[id] = { n: p.Name, a: p.Address, b: p.brand || 'Indépendant', r: p.Region, lat, lng };

    const rows = (dayFile[id] ||= []);
    const last = rows[rows.length - 1];
    if (!last || FUELS.some((_, i) => last[i + 1] !== prices[i])) {
      rows.push([time, ...prices]);
      changed++;
    }

    const region = (regionTotals[p.Region || 'Inconnu'] ||= FUELS.map(() => ({ sum: 0, n: 0 })));
    prices.forEach((v, i) => { if (v !== null) { region[i].sum += v; region[i].n++; } });
  }

  const regions = await readJson(join(DIR, 'regions.json'), { fuels: FUELS, rows: [] });
  const stamp = `${day}T${time}`;
  if (!regions.rows.some((row) => row.t === stamp)) {
    const averages = {};
    for (const [name, totals] of Object.entries(regionTotals)) {
      averages[name] = totals.map((x) => (x.n ? round1(x.sum / x.n) : null));
    }
    regions.rows.push({ t: stamp, avg: averages });
    const cutoff = new Date(generated.getTime() - REGION_DAYS * 864e5);
    regions.rows = regions.rows.filter((row) => new Date(`${row.t}:00`) >= cutoff);
  }

  await writeFile(join(DIR, 'stations.json'), JSON.stringify(index));
  await writeFile(dayPath, JSON.stringify(dayFile));
  await writeFile(join(DIR, 'regions.json'), JSON.stringify(regions));
  console.log(`${stamp}: ${Object.keys(index).length} stations indexed, ${changed} price changes saved.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
