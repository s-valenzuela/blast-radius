# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the app (serves on http://localhost:8080)
./mvnw spring-boot:run

# Run all tests
./mvnw test

# Run a single test method
./mvnw test -Dtest=ImpactAnalyzerTest#eamPersonDownImpactsPvfButNotViceVersa

# Build a fat JAR
./mvnw package

# Run with a custom YAML source
./mvnw spring-boot:run -Dspring-boot.run.arguments=--blastradius.source=file:/path/to/my.yml
```

## Architecture

This is a Spring Boot 3 / Java 17 application. There is no database — the entire graph is held in memory and loaded from YAML at startup.

**Data flow:**

1. `GraphLoader` reads `services.yml` (or whatever `blastradius.source` points to) into a `ServiceGraph` POJO on startup (`@PostConstruct`). The in-memory graph can be hot-swapped at runtime via `POST /api/graph`.
2. `ImpactAnalyzer` takes the live graph from `GraphLoader` and performs forward- and reverse-BFS to compute what a service depends on and what depends on it (direct + transitive). This is the "blast radius" of a service.
3. `GraphController` exposes `/api/*` REST endpoints. The graph endpoint (`GET /api/graph`) shapes nodes/edges for the vis-network frontend.
4. `src/main/resources/static/index.html` is a single static page served by Spring; it calls the API and renders the graph with vis-network (loaded from CDN).

**Key relationships in the YAML model:**
- A `ServiceNode` has `id`, `name`, `group`, `kind` (default `service`, may be `gateway`), `loadBalancerPool` (optional; services sharing a string are grouped behind one LB), and `dependsOn` (list of `Dependency` entries).
- A `Dependency` has `target` (required) and optional `via` (gateway service id) for routed calls.
- Graph edges: `service → service` (depends), and for routed deps a `service → gateway` (depends) plus `gateway → target` (routes) pair.

**Node ID prefix** used in the graph API response: `svc:<id>`. Load-balancer pool clusters in the frontend get a synthetic `pool:<name>` id.

**Tests** are `@SpringBootTest` integration tests that load the bundled `services.yml` fixture and assert on impact analysis results.

**Historical note:** the parent directory may still be named `cert-graph/` — an earlier version of this project modeled certificate expiry impact. That layer has been removed; only service-dependency modeling remains. Renaming the directory itself is a separate manual step.
