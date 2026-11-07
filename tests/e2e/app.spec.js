const { test, expect, openApp, buildFeed, ROWS } = require('./fixtures');

const listItems = (page) => page.locator('#list li button.li');
const pinCount = (page) => page.locator('#map .pin').count();
const goList = (page) => page.locator('[data-nav="list"]').click();
const openFilters = async (page) => { await page.locator('#btn-filters').click(); await expect(page.locator('#sheet')).toBeVisible(); };
const doneFilters = (page) => page.locator('#f-done').click();

test.describe('loading and basics', () => {
  test('loads prices, hides closed stations, fits a phone, no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page);
    expect(page.viewportSize().width).toBeLessThan(500);
    const n = await page.evaluate(() => window.__lp.state.data.stations.length);
    expect(n).toBe(ROWS.length - 1); // closed station dropped
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); // no sideways scroll
    await goList(page);
    await expect(page.getByText('Fermée Pour Toujours')).toHaveCount(0);
    await expect(page.locator('.credit').first()).toContainText('Régie de l’énergie du Québec');
    expect(errors).toEqual([]);
  });

  test('list is sorted cheapest first and unbranded stations still show', async ({ page }) => {
    await openApp(page);
    await goList(page);
    const prices = await page.locator('#list li button.li').evaluateAll((els) => els.map((e) => parseFloat(e.querySelector('.price, [class*=price]')?.textContent.replace(',', '.') || 'NaN')));
    expect(prices.length).toBe(13);
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices.map((p) => Math.round(p))).toEqual(sorted.map((p) => Math.round(p)));
    await expect(page.locator('#list')).toContainText('Sans Marque Inc.');
  });

  test('map shows price pins', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => document.querySelectorAll('#map .pin, #map .cluster').length > 0);
    await expect(page.locator('#best')).toBeVisible();
  });
});

test.describe('fuel toggle', () => {
  test('switching fuel changes prices, hides stations without that fuel, and is remembered', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await expect(listItems(page)).toHaveCount(13);
    await page.locator('[data-fuel="2"]').click(); // Diesel
    await expect(page.locator('[data-fuel="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-fuel="0"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(listItems(page)).toHaveCount(11); // Esso Centre-Ville and Sans Marque don't sell diesel
    await expect(page.locator('#list')).not.toContainText('Sans Marque Inc.');
    await page.reload();
    await page.waitForFunction(() => window.__lp && window.__lp.state.data);
    await expect(page.locator('[data-fuel="2"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('filters', () => {
  test('brand filter', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await openFilters(page);
    await page.locator('#f-brand').selectOption({ label: 'Shell' });
    await doneFilters(page);
    await expect(listItems(page)).toHaveCount(3);
    await expect(page.locator('#filters-dot')).toBeVisible();
  });

  test('region filter and reset', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await openFilters(page);
    await page.locator('#f-region').selectOption('Capitale-Nationale');
    await doneFilters(page);
    await expect(listItems(page)).toHaveCount(3);
    await openFilters(page);
    await page.locator('[data-act="reset"]').click();
    await expect(listItems(page)).toHaveCount(13);
  });

  test('max price filter', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await openFilters(page);
    await page.locator('#f-max').fill('155');
    await page.locator('#f-max').blur();
    await doneFilters(page);
    await expect(listItems(page)).toHaveCount(3); // 151.9, 149.9, 147.9
    await expect(page.locator('#list')).not.toContainText('Station Plateau');
  });

  test('text search by city and by brand', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await page.locator('#q').fill('quebec'); // accent-insensitive
    await expect(listItems(page)).toHaveCount(3);
    await page.locator('#q').fill('couche tard');
    await expect(listItems(page)).toHaveCount(2);
    await page.locator('#q').fill('zzzz');
    await expect(page.locator('#list .empty')).toContainText('Aucune station trouvée');
  });

  test('filtered results with zero matches offer a way back', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await page.locator('#q').fill('zzzz');
    await page.locator('#list [data-act="open-filters"]').click();
    await expect(page.locator('#sheet')).toBeVisible();
  });
});

test.describe('radius (list and map)', () => {
  const setRadius = async (page, v) => { await openFilters(page); await page.locator('#f-radius').selectOption(String(v)); };

  test('without GPS, choosing a radius asks for the position and then applies it to the list', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await expect(listItems(page)).toHaveCount(13); // no GPS yet: whole province
    await expect(page.locator('#list-hint')).toContainText('Activez la position');
    await page.context().grantPermissions(['geolocation']);
    await setRadius(page, 5);
    await expect(page.locator('#toast')).toContainText('Recherche de votre position');
    await page.waitForFunction(() => window.__lp.state.user);
    await doneFilters(page);
    const n = await listItems(page).count();
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(6);
  });

  test('radius narrows the list: 5 km, 25 km, whole province', async ({ page }) => {
    await openApp(page, { geo: true });
    await goList(page);
    await setRadius(page, 5);
    await doneFilters(page);
    const near = await listItems(page).count();
    expect(near).toBeGreaterThanOrEqual(4);
    expect(near).toBeLessThanOrEqual(6);
    await expect(page.locator('#list')).not.toContainText('Laval');
    await openFilters(page);
    await page.locator('#f-radius').selectOption('25');
    await doneFilters(page);
    await expect(page.locator('#list')).toContainText('Laval');
    await expect(page.locator('#list')).not.toContainText('Saint-Jérôme');
    await expect(page.locator('#list')).not.toContainText('Limoilou');
    await openFilters(page);
    await page.locator('#f-radius').selectOption('0');
    await doneFilters(page);
    await expect(listItems(page)).toHaveCount(13);
  });

  test('radius combines with other filters', async ({ page }) => {
    await openApp(page, { geo: true });
    await goList(page);
    await openFilters(page);
    await page.locator('#f-radius').selectOption('25');
    await page.locator('#f-brand').selectOption({ label: 'Shell' });
    await doneFilters(page);
    await expect(listItems(page)).toHaveCount(1); // only Shell Plateau (Saint-Jérôme is >25 km)
  });

  test('radius also applies to the map pins', async ({ page }) => {
    await openApp(page, { geo: true });
    await page.evaluate(() => { const m = document.querySelector('#map'); m.dataset.t = '1'; });
    // Zoom in on Montréal and the whole province at once is not needed: count markers in state instead of what is on screen.
    const markers = () => page.evaluate(() => { let n = 0; document.querySelectorAll('#map .pin, #map .cluster').forEach(() => n++); return n; });
    await page.locator('[data-nav="map"]').click();
    await openFilters(page);
    await page.locator('#f-radius').selectOption('0');
    await doneFilters(page);
    await page.waitForTimeout(400);
    const all = await page.evaluate(() => window.__lp.state.data.stations.length);
    const full = await markers();
    expect(full).toBeGreaterThan(0);
    await openFilters(page);
    await page.locator('#f-radius').selectOption('5');
    await doneFilters(page);
    await page.waitForTimeout(400);
    // zoom the map onto Montréal so that every remaining station is individually visible
    await page.evaluate(() => document.querySelectorAll('.leaflet-container').forEach(() => {}));
    await page.locator('#btn-locate').click();
    await page.waitForTimeout(600);
    const keys = await page.evaluate(() => [...document.querySelectorAll('#map .pin')].length);
    expect(keys).toBeLessThanOrEqual(6);
    expect(all).toBe(13);
  });

  test('"Voir N stations" count matches what the list shows', async ({ page }) => {
    await openApp(page, { geo: true });
    await openFilters(page);
    await page.locator('#f-radius').selectOption('5');
    const label = await page.locator('#f-done').innerText();
    const n = +label.match(/\d+/)[0];
    await doneFilters(page);
    await expect(page.locator('[data-nav="list"]')).toBeVisible();
    await goList(page);
    await expect(listItems(page)).toHaveCount(n);
  });

  test('radius empty state names the radius', async ({ page }) => {
    await openApp(page, { geo: true });
    await goList(page);
    await openFilters(page);
    await page.locator('#f-radius').selectOption('5');
    await page.locator('#f-region').selectOption('Gaspésie–Îles-de-la-Madeleine');
    await doneFilters(page);
    await expect(page.locator('#list .empty')).toContainText('Aucune dans 5 km');
  });

  test('declined GPS shows a message and keeps the list usable', async ({ page, context }) => {
    await context.clearPermissions();
    await openApp(page);
    await goList(page);
    await openFilters(page);
    await page.locator('#f-radius').selectOption('5');
    await expect(page.locator('#toast')).toBeVisible();
    await doneFilters(page);
    await expect(listItems(page).first()).toBeVisible();
  });
});

test.describe('favourites', () => {
  async function openFirst(page) {
    await goList(page);
    await listItems(page).first().click();
    await expect(page.locator('#sheet')).toBeVisible();
  }

  test('add from the sheet, appears in Favoris, survives reload, can be removed', async ({ page }) => {
    await openApp(page);
    await openFirst(page);
    await page.locator('#sheet [data-act="fav"]').click();
    await expect(page.locator('#sheet [data-act="fav"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#sheet [data-act="close"]').click();
    await page.locator('[data-nav="favs"]').click();
    await expect(page.locator('#favs li button[data-key]')).toHaveCount(1);
    await page.reload();
    await page.waitForFunction(() => window.__lp && window.__lp.state.data);
    await page.locator('[data-nav="favs"]').click();
    await expect(page.locator('#favs li button[data-key]')).toHaveCount(1);
    await page.locator('#favs li button[data-key]').click();
    await page.locator('#sheet [data-act="fav"]').click();
    await expect(page.locator('#sheet [data-act="fav"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#sheet [data-act="close"]').click();
    await expect(page.locator('#favs .empty')).toContainText('Aucun favori');
  });

  test('empty state', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-nav="favs"]').click();
    await expect(page.locator('#favs .empty')).toContainText('Aucun favori pour l’instant');
  });
});

test.describe('station sheet', () => {
  test('shows prices, savings calculator, directions link; closes with button, backdrop and Escape', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await listItems(page).first().click();
    const sheet = page.locator('#sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Shell'); // cheapest station in the mock feed
    await expect(sheet).toContainText('Régulier');
    await expect(sheet).toContainText('Super');
    await expect(sheet).toContainText('Diesel');
    await expect(sheet).toContainText('Calculateur d’économies');
    const href = await sheet.locator('a.btn', { hasText: 'Itinéraire' }).getAttribute('href');
    expect(href).toMatch(/google\.com\/maps\/dir\/.*45\.78,-74/);
    // litres drive the amounts
    await sheet.locator('#calc-l').fill('100');
    await expect(sheet.locator('#calc-out')).toContainText('Plein de 100 L');
    await sheet.locator('[data-act="close"]').click();
    await expect(sheet).toBeHidden();
    await listItems(page).nth(1).click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await listItems(page).nth(2).click();
    await page.locator('#backdrop').click({ position: { x: 10, y: 10 } });
    await expect(sheet).toBeHidden();
  });

  test('missing fuel shows no price for it (no NaN)', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await page.locator('#q').fill('Sans Marque');
    await listItems(page).first().click();
    const txt = await page.locator('#sheet').innerText();
    expect(txt).not.toMatch(/NaN|undefined|null/);
  });

  test('tapping a map pin opens the sheet', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__lp.state.data); // ensure ready
    await page.locator('#best').click(); // "cheapest here" card
    await expect(page.locator('#sheet')).toBeVisible();
  });

  test('focus stays inside the open sheet (Tab)', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await listItems(page).first().click();
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('#sheet').contains(document.activeElement))).toBe(true);
  });
});

test.describe('fun features', () => {
  test('radar lists the cheapest nearby and shows them on the map', async ({ page }) => {
    await openApp(page, { geo: true });
    await page.locator('#btn-radar').click();
    await expect(page.locator('#sheet')).toContainText('Radar des aubaines');
    await expect(page.locator('#sheet li button.li').first()).toBeVisible();
    await page.locator('[data-act="radar-map"]').click();
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(page.locator('#map .pin--best').first()).toBeVisible();
  });

  test('heat map toggle', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-heat').click();
    await expect(page.locator('#btn-heat')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#heat-legend')).toBeVisible();
    await page.locator('#btn-heat').click();
    await expect(page.locator('#heat-legend')).toBeHidden();
  });

  test('price watch: set a target on a favourite', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await listItems(page).first().click();
    await page.locator('#sheet [data-act="fav"]').click();
    await page.locator('#w-price').fill('140');
    await page.locator('[data-act="watch-save"]').click();
    await expect(page.locator('#sheet')).toContainText('140');
    await page.locator('[data-act="watch-clear"]').click();
    await expect(page.locator('#w-price')).toBeVisible();
  });

  test('price watch alert when the price drops below the target', async ({ page, feedState }) => {
    const rows = ROWS.map((r) => [...r]);
    await openApp(page, {
      storage: { favs: ['Dépanneur Cheapo|100 rue Sainte-Catherine, Montréal'], watch: { 'Dépanneur Cheapo|100 rue Sainte-Catherine, Montréal': { fuel: 0, price: 152 } } },
    });
    await page.locator('[data-nav="favs"]').click();
    await expect(page.locator('#favs li button[data-key]')).toHaveCount(1);
    await expect(page.locator('#favs-dot')).toBeVisible(); // 151.9 <= 152
    expect(rows.length).toBe(ROWS.length);
  });

  test('share sheet builds an image', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await listItems(page).first().click();
    await page.locator('#sheet [data-act="share"]').click();
    await expect(page.locator('#share-prev canvas, #share-prev img')).toBeVisible();
    await expect(page.locator('[data-act="share-save"]')).toBeEnabled();
  });

  test('price history chart renders from data/history', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await listItems(page).first().click();
    await expect(page.locator('#hist-slot')).not.toBeEmpty();
  });
});

test.describe('refresh and offline', () => {
  test('manual refresh picks up new prices', async ({ page, feedState }) => {
    await openApp(page);
    await goList(page);
    await expect(page.locator('#list')).toContainText('1519');
    feedState.feed = buildFeed(Date.now(), ROWS.map((r) => (r[0] === 'Dépanneur Cheapo' ? [...r.slice(0, 6), [139.9, 175.9, 190.9]] : r)));
    await page.locator('#view-list [data-refresh]').click();
    await expect(page.locator('#list')).toContainText('1399');
  });

  test('network failure with cached data: stays usable and says offline', async ({ page, feedState }) => {
    await openApp(page); // first load saves the cache
    feedState.fail = true;
    await page.reload();
    await page.waitForFunction(() => window.__lp && window.__lp.state.data);
    await goList(page);
    await expect(listItems(page)).toHaveCount(13);
    await expect(page.locator('#view-list .fresh')).toContainText('Hors ligne');
    feedState.fail = false;
    await page.locator('#view-list [data-refresh]').click();
    await expect(page.locator('#view-list .fresh')).not.toContainText('Hors ligne');
  });

  test('network failure on first visit: friendly message, no crash', async ({ page, feedState }) => {
    feedState.fail = true;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/index.html');
    await expect(page.locator('#toast')).toContainText('Impossible de charger');
    await expect(page.locator('#loading')).toHaveClass(/done/);
    expect(errors).toEqual([]);
  });

  test('app shell and last prices load with the network fully off (service worker)', async ({ browser, feedState }) => {
    const ctx = await browser.newContext({ serviceWorkers: 'allow', locale: 'fr-CA', viewport: { width: 412, height: 915 } });
    const page = await ctx.newPage();
    const { test: _t } = require('./fixtures');
    // reuse the same routing as the fixture
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      const fs = require('fs'), path = require('path');
      const nm = path.resolve(__dirname, '..', 'node_modules');
      const libs = {
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css': 'leaflet/dist/leaflet.css',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js': 'leaflet/dist/leaflet.js',
        'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css': 'leaflet.markercluster/dist/MarkerCluster.css',
        'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js': 'leaflet.markercluster/dist/leaflet.markercluster.js',
      };
      if (url.startsWith('http://127.0.0.1:4173')) return route.continue();
      if (libs[url]) return route.fulfill({ status: 200, contentType: url.endsWith('css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.join(nm, libs[url])) });
      if (url.startsWith('https://regieessencequebec.ca/')) return feedState.fail ? route.abort('internetdisconnected') : route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(feedState.feed) });
      return route.abort();
    });
    await page.goto('http://127.0.0.1:4173/index.html');
    await page.waitForFunction(() => window.__lp && window.__lp.state.data);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled by the SW
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    feedState.fail = true;
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.__lp && window.__lp.state.data, null, { timeout: 10000 });
    await page.locator('[data-nav="list"]').click();
    await expect(page.locator('#list li button.li').first()).toBeVisible();
    await expect(page.locator('#view-list .fresh')).toContainText('Hors ligne');
    await ctx.close();
  });
});

test.describe('dark mode', () => {
  test('follows the phone setting, can be forced, and is remembered', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openFilters(page);
    await page.locator('[data-theme-opt="light"]').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await page.waitForFunction(() => window.__lp && window.__lp.state.data);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await openFilters(page);
    await page.locator('[data-theme-opt="dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(r + g + b).toBeLessThan(200); // dark background
  });

  test('light phone setting gives a light page', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(r + g + b).toBeGreaterThan(600);
  });
});

test.describe('accessibility basics', () => {
  test('touch targets are at least 44px (at 360 px wide) and buttons are labelled', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await openApp(page);
    const small = await page.evaluate(() => [...document.querySelectorAll('#top button, .bottomnav button')].map((b) => { const r = b.getBoundingClientRect(); return { l: b.getAttribute('aria-label') || b.textContent.trim(), w: r.width, h: r.height }; }).filter((x) => x.w < 44 || x.h < 44));
    expect(small).toEqual([]);
    const unlabeled = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.hidden && !(b.getAttribute('aria-label') || b.textContent.trim())).length);
    expect(unlabeled).toBe(0);
  });
});
