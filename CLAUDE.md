# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the app — it's a static site; serve the static/ directory
cd src/main/resources/static && python3 -m http.server 8090
# open http://localhost:8090

# Tests (vitest)
npm test                        # run all
npm run test:watch              # watch mode
npx vitest run impact           # a single test file by name

# Type-check the model modules (tsc --noEmit, // @ts-check)
npm run typecheck
```

`npm install` once to get the dev dependencies (vitest, js-yaml, typescript).

## Architecture

This is a **frontend-only** static web app — no server, no database, no build
step. Everything runs in the browser; logic is plain JS loaded via `<script>`.

**Layout** (all under `src/main/resources/static/`):
- `index.html` — markup; loads vendored libs, the `model/` modules, then `app.js`.
- `app.js` — all UI: vis-network rendering, the matrix view, LB-pool clustering,
  selection/highlighting, and the YAML editor. Holds the in-memory graph in a
  single `model` variable and derives every view from it via `BR.*`.
- `model/` — the ported domain logic, each a small UMD module exposing a
  `window.BR.<name>` namespace (and `module.exports` for Node tests):
  - `parse.js`  — normalize raw YAML into the graph model (dependency shorthand,
    field defaults). Mirrors the old `Dependency`/`ServiceNode` model.
  - `impact.js` — forward/reverse BFS: what a service depends on and what depends
    on it (direct + transitive). This is the "blast radius."
  - `shape.js`  — builds the graph (nodes/edges), service list, single-service
    detail, and matrix payloads consumed by `app.js`.
  - `yaml.js`   — export the model back to YAML (a `dump` that takes the YAML lib
    injected, so it works with the browser global and with Node).
- `vendor/` — `vis-network.min.js`, `js-yaml.min.js` (no CDN).
- `services.yml` — the default graph, fetched at startup and reused as the test fixture.

**Data flow:** `app.js` `bootstrap()` fetches `services.yml`, parses it with
`jsyaml` + `BR.parse.normalize` into `model`, then `load()` renders all views via
`BR.shape.*`. Upload / Edit-YAML replace `model` and re-render. Nothing leaves the
browser.

**YAML model:**
- A service has `id`, `name`, `group`, `kind` (`service` default, may be `gateway`
  or `database`), `loadBalancerPool` (optional; shared value clusters services
  behind one LB), and `dependsOn`.
- A dependency is `{ target, via? }` or a bare string (shorthand for `{ target }`);
  `via` names a gateway for routed calls.
- Graph edges: `service → service` (depends); a routed dep becomes a
  `service → gateway` (depends) plus `gateway → target` (routes) pair.

**Node ID prefix** in the graph payload: `svc:<id>`. LB-pool clusters in the
frontend use a synthetic `pool:<name>` id.

**Tests** are vitest specs in `model/*.test.js` that load `services.yml` and assert
on the model functions. `app.js` is type-checked in-editor via `// @ts-check` but
is not in the `npm run typecheck` gate (which covers the clean `model/` modules).

**History:** this was originally a Spring Boot app (and before that, a certificate-
expiry visualizer). The Java backend was removed once all logic was ported to
`model/` and verified at parity against the old `/api/*` endpoints. The directory
is still named `cert-graph/` and the app still lives under the Maven-style
`src/main/resources/static/` path; both are historical and could be flattened.
