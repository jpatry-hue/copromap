# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

CoproMap is a mobile-first, single-page Next.js app that maps French condominium
("copropriété") data. The user searches an address, and the app overlays five
layers of French government open data on a dark Leaflet map within a chosen
radius: condominiums (RNIC), property transactions (DVF), energy ratings (DPE),
building permits, and natural/industrial risks (Géorisques). Clicking a
condominium marker opens a bottom sheet with tabbed details. All UI text is in
French.

## Commands

```bash
npm install      # install dependencies
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build
npm start        # serve the production build
```

There is no linter, no test suite, and no TypeScript — plain JS with the Next.js
Pages Router. "Running a single test" does not apply.

## Architecture

**Frontend** — a single client component (`Home`) holds all state and renders the
entire UI. Leaflet is imported dynamically (`import('leaflet')`) inside a
`useEffect` because it touches `window` and must not run during SSR. The map,
Leaflet instance, per-source `layerGroup`s, and the radius circle are all kept in
`useRef` (not state) so re-renders never recreate them. Markers are built as raw
HTML strings via `L.divIcon`. Tab content is split into presentational
sub-components (`TabIdentite`, `TabDVF`, `TabDPE`, `TabPermis`, `TabRisques`) at
the bottom of the page file. All styling is one big `<style jsx global>` block
using CSS custom properties; there are no separate CSS files.

**Data flow** — selecting an address calls `flyAndLoad(lat, lon)`, which fires all
five source fetches in parallel via `Promise.all` + `loadSource`. Each
`loadSource` updates three pieces of state: `allData` (the records),
`counts` (the badge numbers), and `loading`. The `risques` source is special-cased
(single object, no map markers); the other four render markers through
`renderMarkers`.

**API routes (BFF proxy layer)** — every file under `pages/api/` is a thin proxy
to an external French government API. They exist to add CDN caching, normalize
response shapes, and avoid CORS. They all follow the same contract, which you
should preserve when editing or adding routes:

- Validate required query params (`lat`/`lon`, or `q`) and return `400` if missing.
- Use `fetch` with an `AbortSignal.timeout(...)` (5–15s depending on the upstream).
- Set a `Cache-Control: s-maxage=...` header on success (TTL varies by data
  volatility: 300s for the registry, 3600s for most, 86400s for risks).
- On any failure return HTTP `502` with `{ error: <message> }` **plus an empty
  fallback** (`results: []`, `features: []`, or `risques: {}`) so the frontend
  degrades gracefully instead of throwing. The client treats a failed source as a
  `⚠` badge, never a crash.

Upstream APIs (all public, no keys): BAN/`api-adresse.data.gouv.fr` (geocode),
`registre.coproprietes.gouv.fr` (copro), `api.dvf.etalab.gouv.fr` (dvf),
`data.ademe.fr` (dpe), `georisques.gouv.fr` (risks), `apicarto.ign.fr` (permis).
DPE and permis convert the radius into a lat/lon bounding box using the
`distance / 111320` degrees-per-metre approximation.

## Known structural issue — read before touching routing

The files in this repo were created through the GitHub web "Create file" UI, and
the paths were progressively duplicated. The **on-disk layout does not match the
routes the code assumes**. Only `pages/api/geocode.js` is in the right place;
everything else is nested too deep:

```
pages/api/geocode.js                                              → /api/geocode  ✅
pages/api/pages/api/copro.js                                      → should be pages/api/copro.js
pages/api/pages/api/pages/api/dvf.js                             → should be pages/api/dvf.js
pages/api/.../dpe.js                                              → should be pages/api/dpe.js
pages/api/.../georisques.js                                       → should be pages/api/georisques.js
pages/api/.../permis.js                                           → should be pages/api/permis.js
pages/api/.../pages/index.js                                      → should be pages/index.js
```

The frontend fetches `/api/copro`, `/api/dvf`, `/api/dpe`, `/api/permis`,
`/api/georisques`, and the home page is expected at `/`. With the current nesting,
Next.js will not serve these at the expected URLs and the app will not work.

The correct flat layout is:

```
pages/index.js          (the Home page)
pages/api/geocode.js
pages/api/copro.js
pages/api/dvf.js
pages/api/dpe.js
pages/api/georisques.js
pages/api/permis.js
```

When asked to "fix the app", "make it run", or work on routing, first move each
file to its intended flat location (use `git mv`) and remove the empty nested
`pages/api/pages/...` directories. The file *contents* are correct as written and
already reference the flat route paths.
