const { test, expect, openApp } = require('./fixtures');

const goList = (page) => page.locator('[data-nav="list"]').click();
const openFilters = async (page) => { await page.locator('#btn-filters').click(); await expect(page.locator('#sheet')).toBeVisible(); };
const lang = (page) => page.evaluate(() => document.documentElement.lang);

test.describe('language: automatic choice', () => {
  test('a French phone gets French', async ({ page }) => {
    await openApp(page);
    expect(await lang(page)).toBe('fr');
    await expect(page.locator('[data-nav="list"]')).toContainText('Liste');
    await expect(page).toHaveTitle(/Prix de l’essence/);
  });

  test.describe('an English phone', () => {
    test.use({ locale: 'en-CA' });
    test('gets English, with English prices, ages and dates', async ({ page }) => {
      await openApp(page);
      expect(await lang(page)).toBe('en');
      await expect(page).toHaveTitle(/Gas prices in Québec/);
      await expect(page.locator('[data-nav="list"]')).toContainText('List');
      await expect(page.locator('[data-nav="favs"]')).toContainText('Favourites');
      await expect(page.locator('#q')).toHaveAttribute('placeholder', 'City, address or brand');
      await expect(page.locator('[data-fuel="1"]')).toHaveText('Premium');
      await goList(page);
      await expect(page.locator('.credit').first()).toHaveText('Data: Régie de l’énergie du Québec');
      await expect(page.locator('#list')).toContainText('Independent'); // unbranded station
      await expect(page.locator('#list')).toContainText('Low price');
      await expect(page.locator('#list-hint')).toContainText('Turn on location');
      await expect(page.locator('.fresh-btn').first()).toContainText('min ago');
      // decimal point, not comma
      await expect(page.locator('#list li .price').first()).toHaveAttribute('aria-label', /^\d+\.\d cents per litre$/);
    });
  });

  test.describe('another language falls back to French', () => {
    test.use({ locale: 'es-ES' });
    test('Spanish phone gets French', async ({ page }) => {
      await openApp(page);
      expect(await lang(page)).toBe('fr');
    });
  });

  test.describe('first supported language wins', () => {
    test.use({ locale: 'de-DE', extraHTTPHeaders: {} });
    test('saved choice beats the phone language', async ({ page }) => {
      await openApp(page, { storage: { lang: 'en' } });
      expect(await lang(page)).toBe('en');
      await expect(page.locator('[data-nav="map"]')).toContainText('Map');
    });
  });
});

test.describe('language switch', () => {
  test('switch in settings changes everything live and is remembered', async ({ page }) => {
    await openApp(page);
    await openFilters(page);
    await expect(page.locator('#f-lang [data-lang-opt="fr"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-lang-opt="en"]').click();
    expect(await lang(page)).toBe('en');
    // the open sheet re-renders in English and keeps focus on the switch
    await expect(page.locator('#sheet-title')).toHaveText('Filters and settings');
    await expect(page.locator('[data-lang-opt="en"]')).toBeFocused();
    await expect(page.locator('#f-region option').first()).toHaveText('All regions');
    await expect(page.locator('#f-done')).toContainText(/See \d+ stations/);
    await page.locator('#f-done').click();
    await expect(page.locator('[data-nav="list"]')).toContainText('List');
    await expect(page.locator('#btn-filters')).toHaveAttribute('aria-label', 'Filters and settings');
    await expect(page.locator('[data-fuel="0"]')).toHaveText('Regular');
    await goList(page);
    // station data stays as published
    await expect(page.locator('#list')).toContainText('Sans Marque Inc.');
    await expect(page.locator('#list')).toContainText('200 av. du Mont-Royal, Montréal');
    await page.reload();
    await page.waitForFunction(() => window.__lp && window.__lp.state.data);
    expect(await lang(page)).toBe('en');
    await expect(page.locator('[data-nav="favs"]')).toContainText('Favourites');
    // and back to French
    await openFilters(page);
    await page.locator('[data-lang-opt="fr"]').click();
    expect(await lang(page)).toBe('fr');
    await expect(page.locator('#sheet-title')).toHaveText('Filtres et réglages');
  });

  test('map pins and cluster labels are rebuilt in the new language', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => document.querySelectorAll('#map .pin, #map .cluster').length > 0);
    await openFilters(page);
    await page.locator('[data-lang-opt="en"]').click();
    await page.locator('#f-done').click();
    await page.waitForFunction(() => document.querySelectorAll('#map .pin, #map .cluster').length > 0);
    const labels = await page.locator('#map .cluster').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    const titles = await page.locator('#map .leaflet-marker-icon[title]').evaluateAll((els) => els.map((e) => e.title));
    const all = [...labels, ...titles];
    expect(all.length).toBeGreaterThan(0);
    for (const l of all) expect(l).not.toMatch(/à partir de|cents le litre/);
    await expect(page.locator('#best')).toContainText('Cheapest here');
  });
});

test.describe('English: sheets and features', () => {
  test.use({ locale: 'en-CA' });

  test('station sheet, calculator and details', async ({ page }) => {
    await openApp(page, { geo: true });
    await goList(page);
    await page.locator('#list li button.li').first().click();
    const sheet = page.locator('#sheet');
    await expect(sheet).toContainText('Posted prices');
    await expect(sheet).toContainText('Regular');
    await expect(sheet).toContainText('Savings calculator');
    await expect(sheet).toContainText(/Fill-up of 50 L of regular at \d+\.\d¢\/L: \$\d+\.\d\d/);
    await expect(sheet).toContainText('Directions');
    await expect(sheet.locator('[data-act="share"]')).toHaveAttribute('aria-label', 'Share');
    await expect(sheet.locator('[data-act="fav"]')).toHaveAttribute('aria-label', 'Add to favourites');
    await expect(sheet).toContainText('Add this station to your favourites to set a target price.');
    await sheet.locator('details').evaluate((d) => { d.open = true; });
    await expect(sheet).toContainText('Brand: ');
    await expect(sheet).toContainText('Address: ');
    await expect(sheet.locator('#hist-slot')).toContainText('Price history');
  });

  test('favourites, price alert and toasts', async ({ page }) => {
    await openApp(page);
    await goList(page);
    await page.locator('#list li button.li').first().click();
    await page.locator('#sheet [data-act="fav"]').click();
    await expect(page.locator('#toast')).toContainText('Added to favourites');
    await expect(page.locator('#sheet [data-act="watch-save"]')).toHaveText('Set alert');
    await page.locator('#w-price').fill('');
    await page.locator('[data-act="watch-save"]').click();
    await expect(page.locator('#toast')).toContainText('Enter a target price, for example 165.9');
    await page.locator('#w-price').fill('120.5');
    await page.locator('[data-act="watch-save"]').click();
    await expect(page.locator('#toast')).toContainText('Alert set below 120.5¢');
    await expect(page.locator('#sheet')).toContainText('Price alert');
    await page.locator('[data-act="close"]').first().click();
    await page.locator('[data-nav="favs"]').click();
    await expect(page.locator('#favs')).toContainText('Target 120.5¢ · Regular');
    await expect(page.locator('#view-favs h1')).toHaveText('Favourites');
  });

  test('empty states and filter hints', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-nav="favs"]').click();
    await expect(page.locator('#favs')).toContainText('No favourites yet');
    await goList(page);
    await page.locator('#q').fill('zzzz');
    await expect(page.locator('#list .empty')).toContainText('No stations found');
    await openFilters(page);
    await expect(page.locator('#f-radius-help')).toContainText('The radius applies as soon as your location is known');
    await expect(page.locator('#f-radius option').last()).toHaveText('All of Québec');
    await expect(page.locator('#f-theme [data-theme-opt="light"]')).toHaveText('Day');
  });

  test('deal radar and heat map', async ({ page }) => {
    await openApp(page, { geo: true });
    await page.locator('#btn-radar').click();
    await expect(page.locator('#sheet-title')).toHaveText('Deal radar');
    await expect(page.locator('#sheet')).toContainText(/cheapest within \d+ km · Regular/);
    await expect(page.locator('#sheet [data-act="radar-map"]')).toContainText('See on map');
    await page.locator('#sheet [data-act="close"]').click();
    await page.locator('#btn-heat').click();
    await expect(page.locator('#toast')).toContainText('Tap the map near a station');
    await expect(page.locator('#heat-legend')).toContainText('Prices relative to the region');
  });

  test('share card sheet and text', async ({ page }) => {
    await openApp(page, { geo: true });
    await goList(page);
    await page.locator('#list li button.li').first().click();
    await page.locator('#sheet [data-act="share"]').click();
    await expect(page.locator('#sheet-title')).toHaveText('Share');
    await expect(page.locator('#share-prev img')).toBeVisible();
    const alt = await page.locator('#share-prev img').getAttribute('alt');
    expect(alt).toMatch(/^(Cheapest regular in|Regular in) .+: \d+\.\d¢\/L at .+ \(Le Plein\)$/);
    await expect(page.locator('#sheet [data-act="share-go"]')).toContainText('Share the image');
    await expect(page.locator('#sheet [data-act="share-copy"]')).toContainText('Copy text');
  });

  test('offline message and refresh toast', async ({ page, feedState }) => {
    await openApp(page);
    feedState.fail = true;
    await page.locator('[data-nav="list"]').click();
    await page.locator('.fresh-btn').first().click();
    await expect(page.locator('#toast')).toContainText('Couldn’t refresh');
    await expect(page.locator('.fresh-btn').first()).toContainText('Offline · prices');
    feedState.fail = false;
    await page.locator('.fresh-btn').first().click();
    await expect(page.locator('#toast')).toContainText('Prices up to date');
  });

  test('no untranslated French left in the main screens', async ({ page }) => {
    await openApp(page, { geo: true });
    const frenchWords = /\b(Carte|Liste|Favoris|Filtres|Prix maximum|Rayon|Régulier|Itinéraire|Actualiser|Chargement|Données :|il y a|Partager|Indépendant)\b/;
    for (const nav of ['map', 'favs', 'list']) {
      await page.locator(`[data-nav="${nav}"]`).click();
      const text = await page.locator('#app').innerText();
      expect(text, `view ${nav}`).not.toMatch(frenchWords);
    }
    await openFilters(page);
    expect(await page.locator('#sheet').innerText()).not.toMatch(frenchWords);
  });
});
