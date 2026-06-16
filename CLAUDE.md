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

## Routing / file layout

All files live at their intended flat locations under `pages/`, so Next.js serves
the routes the code references:

```
pages/index.js          → /            (the Home page)
pages/api/geocode.js     → /api/geocode
pages/api/copro.js       → /api/copro
pages/api/dvf.js         → /api/dvf
pages/api/dpe.js         → /api/dpe
pages/api/georisques.js  → /api/georisques
pages/api/permis.js      → /api/permis
```

Historical note: these files were originally created through the GitHub web
"Create file" UI, which progressively duplicated the paths (e.g.
`pages/api/pages/api/copro.js`) so nothing but `geocode.js` resolved to its
expected URL and the app would not run. That nesting has been flattened. If you
ever see a `pages/api/pages/...` path reappear, move the file back to its flat
location (use `git mv`) and delete the empty nested directories — the file
*contents* already reference the flat route paths.
