// Mock Régie feed + offline CDN/tiles so the tests run with no internet.
const { test: base, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const nm = path.resolve(__dirname, '..', 'node_modules');
const LIBS = {
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css': ['leaflet/dist/leaflet.css', 'text/css'],
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js': ['leaflet/dist/leaflet.js', 'text/javascript'],
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css': ['leaflet.markercluster/dist/MarkerCluster.css', 'text/css'],
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js': ['leaflet.markercluster/dist/leaflet.markercluster.js', 'text/javascript'],
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// name, brand, address, region, lat, lng, [regular, super, diesel] (null = not sold), status
const ROWS = [
  // Montréal core (all within ~5 km of the mocked user at 45.5017,-73.5673)
  ['Dépanneur Cheapo', 'couche-tard', '100 rue Sainte-Catherine, Montréal', 'Montréal', 45.5040, -73.5700, [151.9, 175.9, 190.9]],
  ['Station Plateau', 'shell', '200 av. du Mont-Royal, Montréal', 'Montréal', 45.5250, -73.5800, [168.9, 190.9, 200.9]],
  ['Esso Centre-Ville', 'esso', '300 boul. René-Lévesque, Montréal', 'Montréal', 45.5000, -73.5650, [172.9, 195.9, null]],
  ['Ultramar Griffintown', 'ultramar', '400 rue Notre-Dame, Montréal', 'Montréal', 45.4950, -73.5600, [166.9, 189.9, 199.9]],
  ['Petro Hochelaga', 'petro-canada', '500 rue Ontario, Montréal', 'Montréal', 45.5400, -73.5400, [160.9, 184.9, 195.9]],
  ['Sans Marque Inc.', null, '600 rue Saint-Denis, Montréal', 'Montréal', 45.5100, -73.5600, [158.9, null, null]],
  // Montréal outskirts: ~14 km (Laval) and ~35 km (Saint-Jérôme)
  ['Irving Laval', 'irving', '700 boul. des Laurentides, Laval', 'Laval', 45.6000, -73.7200, [149.9, 170.9, 185.9]],
  ['Shell Saint-Jérôme', 'shell', '800 boul. Labelle, Saint-Jérôme', 'Laurentides', 45.7800, -74.0000, [147.9, 172.9, 183.9]],
  // Québec City (~230 km away)
  ['Couche-Tard Limoilou', 'couche-tard', '900 3e Avenue, Québec', 'Capitale-Nationale', 46.8300, -71.2300, [162.9, 186.9, 196.9]],
  ['Esso Sainte-Foy', 'esso', '1000 chemin Sainte-Foy, Québec', 'Capitale-Nationale', 46.7800, -71.2900, [170.9, 193.9, 203.9]],
  ['Ultramar Beauport', 'ultramar', '1100 boul. Sainte-Anne, Québec', 'Capitale-Nationale', 46.8700, -71.1800, [157.9, 181.9, 192.9]],
  // Gaspésie (far)
  ['Garage Gaspé', 'ultramar', '1200 boul. York, Gaspé', 'Gaspésie–Îles-de-la-Madeleine', 48.8300, -64.4800, [189.9, 210.9, 219.9]],
  ['Station Percé', 'shell', '1300 route 132, Percé', 'Gaspésie–Îles-de-la-Madeleine', 48.5200, -64.2100, [192.9, 213.9, 222.9]],
  // Must be ignored: closed station
  ['Fermée Pour Toujours', 'shell', '1400 rue Fantôme, Montréal', 'Montréal', 45.5020, -73.5680, [100.0, 110.0, 120.0], 'Fermée'],
];

function buildFeed(now = Date.now(), rows = ROWS) {
  return {
    type: 'FeatureCollection',
    metadata: { generated_at: new Date(now - 3 * 60000).toISOString(), total_stations: rows.length },
    features: rows.map(([Name, brand, Address, Region, lat, lng, p, Status]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        Name, ...(brand ? { brand } : {}), Status: Status || 'En opération', Address, PostalCode: 'H2X 1Y4', Region,
        Prices: ['Régulier', 'Super', 'Diesel'].map((GasType, i) => ({ GasType, IsAvailable: p[i] != null, Price: p[i] != null ? `${p[i]}¢` : '' })),
      },
    })),
  };
}

const test = base.extend({
  // `feed` option: tests can change it (e.g. serve a cheaper price on refresh).
  feedState: async ({}, use) => use({ feed: buildFeed(), fail: false, hits: 0 }),
  page: async ({ page, feedState }, use) => {
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('http://127.0.0.1:4173')) return route.continue();
      if (LIBS[url]) {
        const [rel, type] = LIBS[url];
        return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(path.join(nm, rel)) });
      }
      if (url.startsWith('https://regieessencequebec.ca/')) {
        feedState.hits++;
        if (feedState.fail) return route.abort('internetdisconnected');
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(feedState.feed) });
      }
      if (url.includes('tile.openstreetmap.org')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      return route.abort(); // fonts etc.
    });
    await use(page);
  },
});

/** Open the app and wait until prices are loaded and rendered. */
async function openApp(page, { geo = false, storage = {} } = {}) {
  await page.addInitScript((s) => {
    try { if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem('lp.' + k, JSON.stringify(v)); sessionStorage.setItem('__seeded', '1'); } } catch (e) {}
  }, storage);
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__lp && window.__lp.state.data);
  await expect(page.locator('#loading')).toHaveClass(/done/);
  if (geo) {
    await page.context().grantPermissions(['geolocation']);
    await page.locator('#btn-locate').click();
    await page.waitForFunction(() => window.__lp.state.user);
  }
}

module.exports = { test, expect, openApp, buildFeed, ROWS };
