# cert-graph

Visualize certificate dependencies across microservices. Spring Boot 3 + a single static page using [vis-network](https://visjs.github.io/vis-network/).

## What it does

- You describe certificates and services in a YAML file (see `src/main/resources/certs.yml`).
- The app builds a graph: **certificates → services** (which services use the cert) and **service → service** (runtime dependencies).
- Click any certificate in the sidebar (or in the graph). The view highlights:
  - **Directly affected** services (they hold the cert).
  - **Transitively affected** services (they depend on something that breaks).

## Run

```bash
./mvnw spring-boot:run
# open http://localhost:8080
```

## YAML schema

```yaml
certificates:
  - id: edge-tls
    name: "Edge TLS *.example.com"
    issuer: "Let's Encrypt"
    expiresOn: 2026-06-12

services:
  - id: gateway
    name: "API Gateway"
    team: platform
    certs: [edge-tls, internal-ca]
    dependsOn: []
```

Point the app at a different file with `--certgraph.source=file:/path/to/my.yml`,
or `POST /api/graph` with `Content-Type: text/yaml` to swap the graph at runtime.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/graph`           | nodes + edges for the UI |
| GET    | `/api/certs`           | certificates with days-to-expiry |
| GET    | `/api/impact/{certId}` | direct + transitive impact for one cert |
| POST   | `/api/graph`           | replace the in-memory graph with new YAML |
