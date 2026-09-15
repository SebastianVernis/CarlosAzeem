# AGENTS.md

## What this is

A **static website** (no framework): a cinematic, scroll-driven dossier/portfolio
for "Carlos Azeem Sánchez Alvarado". It is split into three files:

- `index.html` — SEO meta, Tailwind CDN + inline `tailwind.config`, markup and the
  JSON-LD block.
- `styles.css` — all custom CSS (formerly the inline `<style>`).
- `script.js` — the whole animation engine (one IIFE, formerly inline at the end of
  `<body>`).

There are **no dependencies, no build step, no package manager, no tests, no lint
config, no CI, and no git repo.** Assets live in `assets/` (portrait + Cuarto de Paz
logo). All content and code comments are in **Spanish** — keep it that way when editing.

## Running / verifying changes

There is nothing to build. Either open the file directly or serve it locally:

```bash
python3 -m http.server 8000          # then open http://localhost:8000
```

Verification is manual in a browser: scroll, click the stage nav, resize to <1024px.
Check the browser console for errors. There is no automated test harness.

## Architecture

The core idea: **there is no native page scroll.** `<body>` is `fixed`/`overflow:hidden`.
Instead, a single virtual progress value `p` in `[0, 1]` is advanced by input and
smoothed, then a single `requestAnimationFrame` loop (`renderLoop`) maps `p` to the
`transform` / `opacity` / `filter: blur()` of each stage element.

- Input is **stepped**, not scrubbed: `stepProgress(dir)` moves `targetProgress` to the
  next/previous value in `SECTION_STOPS` (one entry per stage + each carousel card).
  One wheel notch / swipe / arrow press = one beat. A `STEP_COOLDOWN_MS` (220ms) guard
  absorbs the double `window`+`document` wheel registration and fast repeats.
  - wheel: `handleWheel` → `stepProgress` (registered on both `window` and `document`).
  - touch: evaluated on `touchend` (>36px drag). keyboard: arrows/space/PageUp-Down, Home/End.
- `renderLoop` eases `currentProgress` toward `targetProgress` (`PROGRESS_EASE = 0.085`)
  so a step's transition plays out over ~0.5s, snapping when within `0.0003`. Mouse
  parallax is lerped separately at `0.035`.
- To retune where sections/cards rest, edit `SECTION_STOPS` in `script.js` (values must
  land in each stage's hold plateau).
- Helper math: `clamp`, `remap`, `smoothstep` (quintic smootherstep), `lerp`,
  `carouselPos` (carousel steps with plateaus).

### Stage progress bands (critical)

The whole UI is these `p` ranges. They are hard-coded and **duplicated in several
places** (see gotcha below):

| p range        | Stage / element        | DOM id                 |
|----------------|------------------------|------------------------|
| 0.00–0.40      | Portrait + hero title  | `stage-portrait`, `stage-title-block` |
| 0.04–0.40      | Semblanza (biography)  | `stage-biography`      |
| 0.28–0.63      | Tres Pilares           | `stage-ejes` (+ `pilar-card-1..3`) |
| 0.56–0.90      | Registro & Impacto     | `stage-impacto` (+ `impacto-card-1..6`) |
| 0.86–1.00      | Cuarto de Paz (firma)  | `stage-cuarto` (left column + card carousel `cuarto-card-1..3`) |

Sections overlap (crossfade); each stage block has its own enter/hold/exit ranges in
`renderLoop`. **Three** stages are single-card carousels (each card holds fully before
advancing, the previous one slides/fades out), all driven by `carouselPos`:
- `stage-ejes` — 3 `.interactive-card` stacked in `#pilares-grid` (`.section-pilares__stage`
  CSS), `p` 0.34–0.56, stops 0.37 / 0.45 / 0.53.
- `stage-impacto` — `#impacto-grid`, 6 stacked `.interactive-card`, `p` 0.60–0.86.
- `stage-cuarto` — two-column layout (logo + description left, one full-height card
  right); its 3 `<article class="cuarto-card">` cycle `p` 0.92–1.00 after the
  logo/description is drawn. On mobile (<1024px) the header and carousel overlap
  (`styles.css` media query) and the header fades out (p 0.90–0.925) so the cards reuse
  the same space instead of stacking/overflowing.

### Per-element animation pattern

Every stage element shares the `morph-item` class and is animated by:
- toggling `style.display` (`none` when `opacity <= 0.001`, else `block`/`flex`),
- `style.opacity`, `style.transform` (`translate3d(...)`), `style.filter` (`blur(...)`),
- `style.pointerEvents` gated to a window so inner content is only interactive when visible.

Card animations are data-driven. Each of the three carousels stacks its cards in one
grid cell and uses `carouselPos` to show one at a time; the incoming/outgoing direction
comes from a `carDirs` array (`[1,0]` derecha, `[0,-1]` arriba, `[-1,0]` izquierda,
`[0,1]` abajo, diagonales en `stage-impacto`; vertical `start`/hold plateaus live in
`carouselPos`). Only `stage-cuarto` keeps its own per-card translate span.

## Gotchas

- **Changing a stage boundary means editing multiple places.** The `p` thresholds
  appear independently in `renderLoop` (each stage block), `SECTION_STOPS`, and the
  `pointerEvents` windows. Keep them in sync or sections will overlap or clip. A stop
  must land on a `carouselPos` hold plateau, not mid-transition.
- **Dead nav code.** The bottom stage nav and the corner `#progress-hint` were
  removed from the markup, but `updateNavHighlight`, the `hintText` block and the
  `navButtons` query remain in JS (they no-op on empty/null). Ignore or delete them.
- **No inner scroll.** There is no `.custom-scroll` anymore: the Semblanza text must
  fit without scrolling (font sizes shrink at `max-height: 720px`/`560px`), so
  `handleWheel` always advances `targetProgress` and never hands off to a container.
- **Class/id coupling between JS and markup.** JS looks up a list of fixed ids.
  Renaming any without updating JS silently disables that behavior.
- **Tailwind config is inline** (`tailwind.config = {...}`) after the CDN script.
  Custom tokens: colors `noir`, `cyanAccent` (`#00f0ff`), `greenAccent` (`#39ff14`),
  `subtleBorder`; fonts `serif`/`display`/`sans`/`mono`. The markup mostly uses
  **arbitrary-value classes** (`text-[#00f0ff]`, `bg-[#39ff14]`, `z-35`, `z-30`),
  not those tokens.
- `z-35` (used on `stage-ejes`, around line 296) is **not** in Tailwind's default
  z-index scale, so unlike `z-20/30/40/50` it likely has no generated rule. Verify
  stacking visually before relying on it.
- **No `prefers-reduced-motion` handling** exists; all motion is unconditional.
- **Local assets** live in `assets/`: `carlos_azeem.png` (portrait, transparent PNG)
  and `logo_cuarto_paz.png` (firm logo, trimmed of transparent margins; used as the
  `h2` of `stage-cuarto`). Google Fonts, Material Symbols and the OG/Twitter images
  are still remote (`lh3.googleusercontent.com`).
- The animation engine is a single IIFE in `script.js`, loaded with a plain
  `<script src>` at the end of `<body>`; there are no modules, bundlers, or shared
  globals.

## Style conventions

- Section banners use `<!-- ===== ... ===== -->` comment blocks; keep this style.
- Theme: black canvas, cyan `#00f0ff` primary accent, green `#39ff14` secondary
  accent, subtle white borders (`border-white/[0.1]`), `backdrop-blur`, glow shadows.
- Editorial typography mixing `font-serif italic` headings with `font-mono` labels
  and uppercase `tracking-[0.25em]` kickers.
- Cards follow a consistent structure: emoji/number kicker row, serif title,
  description, `•` bullet list, and a bottom `border-t` footer row.

## SEO / structured data

- Head has a `<script type="application/ld+json">` `@graph` with `Person`
  (`#carlos-azeem`), `ProfessionalService` (`#cuarto-de-paz`, with
  `hasOfferCatalog` of the 3 services) and a `WebPageElement` (`#seccion-cuarto-de-paz`).
  Keep ids in sync if you rename.
- Every stage carries `role="region"`, an `aria-label` and a `data-keywords`
  attribute; the Cuarto de Paz cards also use schema.org microdata
  (`itemscope itemtype="https://schema.org/Service"` with `itemprop` name,
  description, serviceType, keywords, provider).
- Semantic section classes: `.section-semblanza`, `.section-pilares`,
  `.section-impacto`, `.section-cuarto`, and BEM-style children
  (`.section-cuarto__header/__grid/__logo…`, `.cuarto-card__head/__icon/__title/__text`).
