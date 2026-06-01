# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the app — it's a static site; serve the repo root
python3 -m http.server 8090
# open http://localhost:8090

# Tests (vitest)
npm test                        # run all
npm run test:watch              # watch mode
npx vitest run impact           # a single test file by name

# Type-check the model + ui modules (tsc --noEmit, checkJs)
npm run typecheck
```

`npm install` once to get the dev dependencies (vitest, js-yaml, typescript).

## Architecture

This is a **frontend-only** static web app — no server, no database, no build
step. Everything runs in the browser; logic is plain JS loaded via `<script>`.

**Layout** (everything lives at the repo root):
- `index.html` — markup; loads vendored libs, the `model/` modules, then the
  `ui/` scripts in order.
- `ui/` — all UI, split into plain `<script>` files that share one global scope
  (no modules/build); loaded in dependency order, `wiring.js` last. They hold the
  in-memory graph in a single `model` variable and derive every view via `BR.*`:
  - `config.js`    — static config: palettes, theme colors, storage keys, node
    sizes, vis-network physics.
  - `style.js`     — DOM lookup helpers (`el`/`qs`/`qsa`), LB icons, active theme
    colors, and color/group helpers.
  - `core.js`      — shared state, `load()`, localStorage persistence, bootstrap,
    YAML import/export.
  - `matrix.js`    — the dependency-matrix view and the graph/matrix toggle.
  - `graph.js`     — node styling, sidebar lists, vis-network rendering, LB-pool
    clustering.
  - `selection.js` — service/group selection + highlighting, reset, theme switch.
  - `wiring.js`    — DOM event wiring, YAML editor, About dialog, bootstrap call.
- `model/` — the ported domain logic, each a small UMD module exposing a
  `window.BR.<name>` namespace (and `module.exports` for Node tests):
  - `pools.js`  — shared LB-pool index (service id <-> pool maps), used by
    `impact.js` and `shape.js`.
  - `parse.js`  — normalize raw YAML into the graph model (dependency shorthand,
    field defaults). Mirrors the old `Dependency`/`ServiceNode` model.
  - `impact.js` — forward/reverse BFS: what a service depends on and what depends
    on it (direct + transitive). This is the "blast radius." LB pools are
    **semantic** here: the closure runs in "unit space" where each
    `loadBalancerPool` collapses to one logical node (members are
    interchangeable), then expands back to concrete ids. So depending on any
    pool member — or on the pool name as a `target` — means depending on the
    pool, and all members of a pool share the same blast radius.
  - `shape.js`  — builds the graph (nodes/edges), service list, single-service
    detail, and matrix payloads consumed by the `ui/` scripts.
  - `yaml.js`   — export the model back to YAML (a `dump` that takes the YAML lib
    injected, so it works with the browser global and with Node).
- `vendor/` — `vis-network.min.js`, `js-yaml.min.js` (no CDN).
- `services.yml` — the default graph, fetched at startup and reused as the test fixture.

**Data flow:** `ui/core.js` `bootstrap()` fetches `services.yml` (or restores it
from localStorage), parses it with `jsyaml` + `BR.parse.normalize` into `model`,
then `load()` renders all views via `BR.shape.*`. Upload / Edit-YAML replace
`model` and re-render. Nothing leaves the browser.

**YAML model:**
- A service has `id`, `name`, `group`, `kind` (`service` default, may be `gateway`
  or `database`), `loadBalancerPool` (optional; shared value clusters services
  behind one LB), and `dependsOn`.
- A dependency is `{ target, via? }` or a bare string (shorthand for `{ target }`);
  `via` names a gateway for routed calls.
- Graph edges: `service → service` (depends); a routed dep becomes a
  `service → gateway` (depends) plus `gateway → target` (routes) pair. A dep
  whose `target` (or `via`) names an LB pool points instead at a synthetic
  `pool:<name>` node, which fans out to its members with `pool`-type edges.

**Node IDs** in the graph payload: services are `svc:<id>`; a pool referenced as
a dependency target becomes a synthetic `pool:<name>` node (kind `pool`). Note
the *frontend* member-clustering (collapsing a pool's members into one glyph) is
a separate visual feature that uses an `lb:<name>` cluster id, built in
`ui/graph.js` — don't confuse it with the `pool:<name>` target node from
`shape.graph`.

**Tests** are vitest specs in `model/*.test.js` that load `services.yml` and assert
on the model functions. Both `model/` and `ui/` (plus `globals.d.ts`) are in the
`npm run typecheck` gate; the `ui/` scripts share one global scope, so tsc also
catches duplicate declarations and dangling references across them.

**History:** this was originally a Spring Boot app (and before that, a certificate-
expiry visualizer). The Java backend was removed once all logic was ported to
`model/` and verified at parity against the old `/api/*` endpoints, and the static
files were flattened from `src/main/resources/static/` to the repo root. The
repository directory is still named `cert-graph/` for historical reasons.
