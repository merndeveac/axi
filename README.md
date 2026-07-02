# AXI

Local Solana token scanner, paper trading signal engine, and future Axiom
overlay. This repository is paper-mode only in this first pass.

No wallet loading, private key handling, transaction signing, or live trading
exists here yet.

## Safety Boundary

- Default mode is `paper`.
- `live` mode is refused by execution code.
- No private keys, seed phrases, wallet files, API keys, or auth tokens should be
  stored in this repo.
- No Axiom private APIs are used or reverse engineered.
- Real Solana data feeds and trade execution are TODOs for later, explicit
  development.

## Architecture

```text
data feeds -> scoring engine -> paper executor -> API/WebSocket -> dashboard/overlay
```

Current implementation uses `MockFeedProvider` only. It emits safe fake token
events for local development.

## Install

```bash
pnpm install
```

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Run The API

```bash
pnpm --filter @axi/api dev
```

The API defaults to `http://localhost:8787`.

Endpoints:

- `GET /health`
- `GET /signals`
- `GET /positions`
- `ws://localhost:8787/ws/signals`

## Run The Dashboard

```bash
pnpm --filter @axi/dashboard dev
```

The dashboard connects to `ws://localhost:8787/ws/signals`.

## Chrome Extension Skeleton

Build the extension content script:

```bash
pnpm --filter @axi/extension build
```

Then load `apps/extension` as an unpacked Chrome MV3 extension. The manifest
points at `dist/content.js`, so build before loading.

The extension currently connects to the local backend, stores signals by mint,
and exposes lightweight debug state. It does not assume Axiom DOM selectors and
does not attach to token cards yet.

## Optional Infrastructure

`docker-compose.yml` includes optional Postgres and Redis services for later
development. They are behind the `infra` profile and are not required to run the
current mock API or dashboard.

```bash
docker compose --profile infra up -d
```

## Packages

- `@axi/shared`: shared Zod schemas and TypeScript types.
- `@axi/scoring`: pure scoring functions and unit tests.
- `@axi/data-feeds`: feed interfaces plus a mock feed provider.
- `@axi/execution`: in-memory paper execution only.
- `@axi/api`: Fastify API and local WebSocket broadcaster.
- `@axi/dashboard`: Vite React signal dashboard.
- `@axi/extension`: Chrome MV3 overlay skeleton.
