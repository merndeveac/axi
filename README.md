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

Default implementation uses `MockFeedProvider`. It emits safe fake token events
for local development. A public PumpPortal feed provider is available behind
`DATA_FEED=pumpportal` for new-token and migration events only.

All current signal data is fake, mock-generated, and paper-only.

## Local Persistence

Paper-mode development data is stored in a local SQLite database:

```text
.data/axi.sqlite
```

The API initializes the database automatically, creates the current schema, and
stores mock feed events, overlay signals, paper orders, and paper positions.
This database is local-only and is ignored by git.

Clear local paper data with:

```bash
rm -rf .data
```

## Rolling Metrics

`@axi/metrics` maintains local, in-memory rolling windows per mint. It uses
normalized feed event timestamps and computes paper-mode features for these
windows:

```text
1s, 3s, 5s, 10s, 30s, 60s
```

Current metrics include rolling buy/sell/total/net volume, trade counts, unique
buyers/sellers/traders, price change, price velocity, volume velocity,
acceleration, buyer velocity, buy/sell ratio, net buy pressure, and an
`insufficientMetrics` flag. The mock feed emits deterministic fake trade events
to exercise this engine locally. These mock trades are not real market data and
remain paper-only.

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

Run only API tests:

```bash
pnpm --filter @axi/api test
```

## Local Launch Scripts

Rebuild, stop previously launched local Axi processes, and restart the API and
dashboard:

```bash
pnpm local:restart
```

Logs are written to:

```text
.tmp/axi-api.log
.tmp/axi-dashboard.log
```

Stop or inspect the local app with:

```bash
pnpm local:stop
pnpm local:logs
```

The restart script only stops PIDs recorded in `.tmp/axi-dev-pids.json`. If a
port is already used by an unknown process, it reports that instead of killing
unrelated processes.

## Run The API

```bash
pnpm --filter @axi/api dev
```

The API defaults to `http://localhost:8787`.

Mock feed options can be set with environment variables:

```bash
MOCK_FEED_SEED=42 MOCK_FEED_SCENARIO=momentum pnpm --filter @axi/api dev
```

Supported mock scenarios are `normal`, `momentum`, `rug`, and `flat`. The same
seed and scenario produce the same mock event sequence, which is useful for
repeatable paper-mode tests.

Public PumpPortal paper-feed mode can be started explicitly:

```bash
DATA_FEED=pumpportal PUMPPORTAL_API_KEY=... pnpm --filter @axi/api dev
```

PumpPortal support uses one WebSocket connection and subscribes only to:

- `subscribeNewToken`
- `subscribeMigration`

`subscribeTokenTrade` and `subscribeAccountTrade` are intentionally not
implemented because they are metered streams. PumpPortal events are normalized
with conservative placeholder metrics until a later metrics source exists, so
they are marked with `INSUFFICIENT_METRICS` and remain paper-only.

Endpoints:

- `GET /health`
- `GET /signals`
- `GET /signals/recent`
- `GET /metrics`
- `GET /metrics/:mint`
- `GET /positions`
- `GET /storage/stats`
- `GET /paper/orders`
- `GET /paper/positions`
- `ws://localhost:8787/ws/signals`

`GET /signals` returns the current in-memory signal cache. `GET
/signals/recent` returns recent persisted signals from SQLite.

`GET /metrics` returns current in-memory rolling metrics for tracked mints.
`GET /metrics/:mint` returns one metrics snapshot or `404` when that mint is not
tracked.

## Replay Local Data

Replay persisted fake paper data from SQLite without starting the API,
dashboard, live trading, or external services:

```bash
pnpm --filter @axi/api replay
pnpm --filter @axi/api replay -- --type signals --limit 25 --speed 0
pnpm --filter @axi/api replay -- --db .data/axi.sqlite --type feed_events
pnpm --filter @axi/api replay -- --type feed_events --metrics true --limit 100 --speed 0
```

Replay output is JSON lines on stdout. The default database is
`.data/axi.sqlite`, which is local and ignored by git. With `--metrics true`,
feed events are replayed through the rolling metrics engine and each JSON line
includes the metrics snapshot after that event when available.

## Probe Feeds

Probe normalized feed events without starting the API server, dashboard, live
trading, or persistence:

```bash
pnpm --filter @axi/api feed:probe -- --provider mock --limit 5
DATA_FEED=pumpportal PUMPPORTAL_API_KEY=... pnpm --filter @axi/api feed:probe -- --limit 10
DATA_FEED=pumpportal pnpm --filter @axi/api feed:probe -- --new-token true --migration false --timeout 30000
```

Do not put real API keys in source files, tests, commits, or `.env.example`.

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
- `@axi/metrics`: local rolling-window metrics for paper-mode signal features.
- `@axi/storage`: local SQLite persistence for paper-mode development.
- `@axi/api`: Fastify API and local WebSocket broadcaster.
- `@axi/dashboard`: Vite React signal dashboard.
- `@axi/extension`: Chrome MV3 overlay skeleton.

## Branch Workflow

- `dev/scaffold-paper-mode` contains the initial scaffold and paper-mode SQLite
  persistence work.
- `dev/api-test-harness-replay` contains the API test harness, deterministic
  mock feed, and replay work.
- `dev/pumpportal-feed-provider` contains the public PumpPortal new-token and
  migration feed provider.
- `dev/rolling-metrics-engine` contains local launch scripts and the rolling
  metrics engine.

This project still has no wallet UI, no private-key loading, no live trading,
no Solana transaction signing, no metered PumpPortal trade streams, no Axiom
private API usage, and no Axiom scraping.
