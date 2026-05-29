# blast-radius

Visualize service-dependency blast radius. A dependency-free static page using
[vis-network](https://visjs.github.io/vis-network/) — no backend, no build step.

## What it does

- You describe services and their dependencies in a YAML file
  (`src/main/resources/static/services.yml`).
- The app builds a graph of **service → service** dependencies, including calls
  **routed via a gateway**.
- Click any service (sidebar or graph). The view highlights:
  - what it **depends on** (direct + transitive), and
  - what is **impacted if it goes down** (direct + transitive) — its blast radius.
- A matrix view, load-balancer-pool clustering, and an in-browser YAML editor
  (upload / edit / save) are also included.

## Run

It's a static site — serve the `static/` directory with any static file server:

```bash
cd src/main/resources/static
python3 -m http.server 8090
# open http://localhost:8090
```

(Opening `index.html` directly via `file://` will not work — the browser blocks
`fetch('services.yml')` under that scheme. Any HTTP server is enough.)

## YAML schema

```yaml
services:
  - id: web-fe-01
    name: "Web Frontend 01"
    group: edge                 # optional, used for coloring/clustering
    kind: service               # service (default) | gateway | database
    loadBalancerPool: web-fe    # optional; services sharing a value cluster behind one LB
    dependsOn:
      - { target: cart-svc, via: api-gateway }   # routed through a gateway
      - { target: session-store }                # direct dependency
      - search-svc                               # shorthand for { target: search-svc }
```

Load a different graph at runtime with the **Upload** button, or paste/edit YAML
in the **Edit YAML** panel — both parse entirely in the browser.

## Develop

Logic lives in small ES-era modules under `static/model/` (`parse`, `impact`,
`shape`, `yaml`), loaded as plain `<script>`s that expose a `window.BR` namespace
and also work as Node modules for tests.

```bash
npm install        # one-time: vitest, js-yaml, typescript (dev only)
npm test           # run the vitest suite
npm run test:watch # re-run on change
npm run typecheck  # tsc --noEmit over static/model (// @ts-check)
```
