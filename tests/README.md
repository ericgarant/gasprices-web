# End-to-end tests

Playwright tests for Le Plein at phone size (Pixel 7, plus a 360 px check). They run with no internet: the Régie feed is mocked (`e2e/fixtures.js`), Leaflet comes from `node_modules`, and map tiles are blank.

```
cd tests
npm install
npx playwright install chromium   # once
npm test
```

In a container with a pre-installed Chromium, point at it with `PW_CHROMIUM=/path/to/chrome`.

Covered: loading, closed stations dropped, fuel toggle, brand / region / max price / search filters, radius on the list and the map pins, favourites, station sheet (calculator, directions, close, focus trap), radar, heat map, price watch, share card, history chart, refresh, offline (feed failure and a real service-worker offline reload), dark mode, touch target size.
