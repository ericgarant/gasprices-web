# Le Plein — design system "Panneau de prix"

The roadside price sign look: the price is the hero. Phase 1 deliverable, for review before any app code.

Open `index.html` (style guide) in a browser; the **Concept preview** link at the top of the sidebar opens `concept.html` (map view + station sheet). Both have a Jour / Nuit (light / dark) switch. No build step, works from `file://`.

| File | What it is |
|---|---|
| `styles.css` | The token layer (`:root` + `:root[data-theme="dark"]`) and every component class. Single source of styles; the app will link this file. |
| `index.html` | Living style guide: foundations, 47 components, Dev Mode inspector, Copy as prompt. |
| `concept.html` | Two concept screens built only from the components, with real Sherbrooke prices (snapshot 2026-11-07 09:50). |
| `icons.html` | Canonical inline SVG icon sprite (copy the `<svg>` block into pages). |
| `theme.js` | Shared light/dark switch for the review pages (defaults to the phone setting). |

## Direction

- **Structure:** Material token model + MUI component catalogue (cross-platform PWA).
- **Type:** Barlow (drawn after North-American highway signs). Barlow Condensed 800 for prices and headlines, Barlow for reading. Prices use tabular numerals, with the tenth of a cent raised and small like a Québec pump sign: `171⁹`.
- **Colour:** chrome is ink on warm enamel (`--primary` is the black signboard). The only saturated colours are the price levels: `--cheap` green, `--avg` amber, `--pricey` red. Never colour alone: a coloured price always has its number and a level label (Bas prix / Moyen / Élevé).
- **Night:** asphalt surfaces, white-enamel primary, soft neon glow on signboard digits (`--sign-glow`).
- **Shape:** chunky radii (cards 20, sheets 28), 48 px minimum tap targets.
- **Motion:** under 400 ms, never blocking, off with `prefers-reduced-motion`.

## Contrast

Every fill / `--on-*` pair and every `*-ink` text colour was checked with the WCAG formula in both themes: body text ≥ 4.5:1, UI borders ≥ 3:1. Lowest pairs: light `--on-cheap` on `--cheap` 5.04, dark `--outline` on `--surface` 3.19 (border only).

## Extending

- **New token:** add the CSS variable to the right group in `:root`, and its night value in `:root[data-theme="dark"]`. Use roles (`--cheap-ink`), never raw hex in components.
- **New component:** add a class block to `styles.css` that uses tokens only, a `<section id="key">` in `index.html` showing every variant and state with `data-insp="key"`, and a `SPECS.key` entry. The Copy as prompt button and Dev Mode pick it up automatically.
- **New icon:** add a `<symbol id="i-name" viewBox="0 0 24 24">` to the sprite in `icons.html` and copy the block to the other pages. Stroke style only (Lucide / Material Symbols look). Never emoji.
- **Switching theme:** only the `:root` values change; components and screens stay the same.
