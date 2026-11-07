# Le Plein

A mobile web app for finding the cheapest gas in Québec, built on the public price data published by the Régie de l'énergie du Québec.

- No API keys, no accounts.
- Plain HTML, CSS and JavaScript, hosted on GitHub Pages.
- Price history is saved hourly by a GitHub Actions job (`scripts/snapshot.mjs`) into `data/history/`.

## Run it

No build step. Serve the repo root over HTTP (`python3 -m http.server`) and open `http://localhost:8000/`. Entry point: `index.html`; code in `js/` (`data.js` feed + price levels, `util.js` helpers, `main.js` UI); styles come from `design-system/styles.css` plus layout glue in `app.css`.

See `PROJECT.md` for the full brief: data format, design direction, features and progress.

Données : Régie de l'énergie du Québec.
