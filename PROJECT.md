# Le Plein — Québec gas prices web app

Project brief for the Claude Project. Add this file as Project knowledge so every chat starts with full context. Keep it updated as decisions change.

## Goal

A fun, fast, installable mobile web app (PWA) for finding the cheapest gas in Québec. Replaces the earlier Flutter app (`~/Documents/GasPrices/gas_prices_qc`, kept as a reference only).

## Conventions

- French first (UI text in French; English optional later).
- Mobile first: designed for one-handed use on a phone, then scaled up.
- Keyless: no API keys, no accounts, no paid services.
- Plain HTML, CSS and JavaScript (ES modules). No build step, no framework.
- Libraries only from a CDN, and only when they earn their place (Leaflet for the map).
- Every change is committed to GitHub; the repo is the source of truth.
- Animations are short (under ~400 ms), never block the user, and are disabled when the phone's "reduce motion" setting is on.

## Hosting

- GitHub repo `ericgarant/gasprices-web`, served by GitHub Pages (free, HTTPS).
- HTTPS is required for GPS, install-to-home-screen and offline mode.

## Data source (verified 2026-11-07)

- URL: `https://regieessencequebec.ca/stations.geojson.gz`
- Publisher: Régie de l'énergie du Québec. Public, free, no key, no sign-up.
- CORS: `access-control-allow-origin: *` — a browser can fetch it from any site. Tested from a third-party origin: works.
- Encoding: served with `content-encoding: gzip`, so the browser decompresses it automatically. Read it with `response.json()`; no decompression library needed.
- Freshness: regenerated about every 5 minutes; `cache-control: public, max-age=60`.
- Size: about 125 KB compressed, about 2,470 stations.
- Credit shown in the app: "Données : Régie de l'énergie du Québec".

### Format (GeoJSON FeatureCollection)

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "generated_at": "2026-11-07T14:25:00.3099654Z",
    "total_stations": 2473,
    "excel_url": "/data/stations-20261107142500.xlsx"
  },
  "features": [{
    "geometry": { "type": "Point", "coordinates": [-79.0, 48.2] },
    "properties": {
      "Name": "2642-4101 Québec Inc.",
      "brand": "Shell",
      "Status": "En opération",
      "Address": "230 av. Murdoch, Rouyn-Noranda",
      "PostalCode": "J9X 1E7",
      "Region": "Abitibi-Témiscamingue",
      "Prices": [
        { "GasType": "Régulier", "IsAvailable": true, "Price": "199.4¢" },
        { "GasType": "Super",    "IsAvailable": true, "Price": "223.9¢" },
        { "GasType": "Diesel",   "IsAvailable": true, "Price": "295.9¢" }
      ]
    }
  }]
}
```

Notes:
- Coordinates are `[longitude, latitude]`.
- `Price` is a string like `"199.4¢"`; parse with `parseFloat`.
- Keep only stations where `Status === "En opération"`, and prices where `IsAvailable` is true.
- `brand` is lowercase in the data; it can be missing (treat as "Indépendant").
- There is no stable station ID. Use `Name + Address` as the key (same as the Flutter app).
- The old `Documents/gasprice.html` used different (wrong) field names and double-decompressed the data. Don't reuse it.

## Design direction: "Roadside price sign"

Inspired by the big price signs at Québec gas stations: the price is the hero.

- Prices in a bold condensed display face with tabular numbers, like a pump sign.
- Light mode: warm off-white, ink-black type, enamel-sign colors.
- Dark mode: night road — deep asphalt background with a soft neon glow on prices.
- Price colors (relative to what's around you): green = cheap, amber = average, red = expensive. Never color alone: always paired with the number or a label.
- Chunky, rounded cards and large touch targets (at least 44 px).
- Motion: price digits that roll into place, a fuel-gauge loader, a radar sweep for "deals near me".

## Features

### Core (phase 2)
- Map with color-coded price pins, clustered when zoomed out.
- Nearby list, sorted by price or distance.
- Fuel type: Régulier / Super / Diesel.
- Filters: region, brand, max price.
- Favourites (saved on the device).
- Station details sheet with one-tap directions (Apple Maps / Google Maps).
- Offline: show the last loaded prices with their age.
- Auto-refresh every 5 minutes while open.

### Fun (phase 3)
- Fuel-gauge loader while prices load.
- Deal radar: radar sweep that highlights the cheapest stations nearby.
- Savings calculator: "Fill 50 L here instead of the closest station = $X saved".
- Best-price moment: confetti and a short vibration (Android) on the cheapest nearby station.
- Price heat map toggle.
- Price history and trends per station (needs the snapshot job).
- Price watch: target price on a favourite, checked when the app opens.
- Share card: image like "Cheapest gas in Magog right now: 158.9¢".

## Price history

The Régie only publishes current prices. A scheduled GitHub Actions job saves a compact snapshot every hour into `data/history/`, so history builds up from the day it starts.

## Phases

0. Setup: repo, Pages, Claude Project, this file, snapshot job.
1. Design system and two concept screens, for review.
2. Core app.
3. Fun features.
4. Polish and audits (performance, accessibility, animation), test installed on a phone.
5. Optional: Play Store package.

## Progress log

- 2026-11-07: Analysed the Flutter project (no API key used anywhere; not under version control). Verified the data feed and CORS. Chose GitHub Pages hosting and the "Roadside price sign" design direction.
- 2026-11-07: Phase 0 done. Repo `ericgarant/gasprices-web` created and pushed. Hourly snapshot job running; first snapshot saved 2026-11-07 09:51 (about 2,460 stations). GitHub Pages: to be turned on by Eric (Settings > Pages > main, root) before phase 2.
- 2026-11-07: Phase 1 drafted in `design-system/` (branch `design-system-phase1`): "Panneau de prix" tokens (light + dark), 47 components (MUI catalogue + price, price sign, pin, station sheet, freshness, fuel gauge, radar), concept screens for the map and the station sheet. Eric kept the theme on 2026-11-07 (PR #1).

- 2026-11-07: Phase 2 core app built (PR on branch `claude/project-thread-ecgy2n`): map with clustered price pins, nearby list, fuel toggle, filters (region, brand, max price, radius), favourites, station sheet with directions, offline cache + service worker, 5-minute auto-refresh, installable PWA, light/dark. Price levels are terciles per region.

## Working notes for Claude

- Start each chat by connecting the GitHub repo `ericgarant/gasprices-web` and reading the latest `PROJECT.md` from it; the repo copy is newer than any uploaded copy.
- Pull before working: the snapshot job commits to `main` every hour.
- The Claude GitHub access can push and run workflows (REST `actions/workflows/.../dispatches`), but cannot create repos or change repo settings such as Pages.
- Design plugins enabled on Eric's account: Mobile Design System. Built-in skill: frontend-design.

## Next step

Phase 3: fun features. (Phase 2 core app is built; test it installed on a phone.) Original phase 2 note: build the core app on top of `design-system/styles.css` (link it, don't copy values). Eric turns on GitHub Pages first (Settings > Pages > main, root). The concept screens in `design-system/concept.html` are the reference for the map view and the station sheet.
