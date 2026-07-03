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
data feeds -> metrics -> risk -> candidates -> scoring -> API/WebSocket -> dashboard/overlay
```

Default implementation uses `MockFeedProvider`. It emits safe fake token events
for local development. A public PumpPortal feed provider is available behind
`DATA_FEED=pumpportal` for new-token and migration events only.

All current signal and risk data is fake, mock-generated, incomplete, or
placeholder-only, and remains paper-only.

## Local Persistence

Paper-mode development data is stored in a local SQLite database:

```text
.data/axi.sqlite
```

The API initializes the database automatically, creates the current schema, and
stores mock feed events, risk snapshots, candidate decisions, read-only chain
verifications, read-only watched-address chain events, overlay signals, paper
orders, and paper positions. This database is local-only and is ignored by git.

Current persistence tables include `feed_events`, `signals`, `risk_snapshots`,
`candidate_decisions`, `chain_verifications`, `chain_transaction_events`,
`chain_trade_events`, `paper_orders`, and `paper_positions`.

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

## Risk And Candidate Lifecycle

`@axi/risk` computes local risk snapshots from feed metrics, mock scenario
placeholders, and incomplete real-feed fields. It produces a risk level,
structured flags, hard-reject status, and reason codes. Hard-reject examples
include active mint authority, active freeze authority, high holder
concentration, dev concentration, low liquidity, high sell slippage, wash
trading suspected, and honeypot suspected.

`@axi/candidates` tracks candidate state from first sight through warming,
watching, qualified, rejected, paper ordered, or ignored. It combines rolling
metrics, risk snapshots, scoring output, and optional paper execution status.
Every decision includes combined reason codes.

`PAPER_AUTO_ORDER=false` by default. With the default setting, a
`PAPER_BUY_READY` decision is only a paper-mode signal state and does not submit
a paper order. Setting `PAPER_AUTO_ORDER=true` can submit paper orders through
the existing in-memory paper executor only. It never enables live trading.

## Read-Only Solana Chain Verifier

`@axi/solana-chain` provides optional read-only Solana RPC helpers for mint
inspection, token supply, largest token accounts, holder concentration, recent
signatures, parsed transactions, and token verification. It does not load
wallets, private keys, seed phrases, or API keys, and it does not sign or send
transactions.

The API verifier is disabled by default:

```bash
CHAIN_VERIFIER_ENABLED=false
SOLANA_RPC_HTTP=
SOLANA_RPC_COMMITMENT=confirmed
CHAIN_VERIFIER_REQUEST_TIMEOUT_MS=10000
CHAIN_VERIFIER_CACHE_TTL_MS=60000
CHAIN_VERIFIER_MAX_CONCURRENT=2
CHAIN_VERIFIER_ON_NEW_TOKEN=true
CHAIN_VERIFIER_ON_MIGRATION=true
CHAIN_VERIFIER_ON_MOCK=false
```

Enable it only with an explicit read-only RPC URL:

```bash
CHAIN_VERIFIER_ENABLED=true SOLANA_RPC_HTTP=https://... pnpm --filter @axi/api dev
```

Verification results are cached, persisted to SQLite, and merged into paper-mode
risk decisions when available. Replay never calls live RPC.

## Read-Only Solana Transaction Ingestor

`@axi/chain-events` provides optional read-only Solana transaction observation
for explicitly watched addresses. It uses Solana RPC/WebSocket only when
enabled, creates one `logsSubscribe` watch per address, and never loads wallets,
signs, sends transactions, creates orders, or trades.

The ingestor is disabled by default:

```bash
CHAIN_EVENTS_ENABLED=false
SOLANA_RPC_WS=
CHAIN_EVENTS_WATCHED_ADDRESSES=
CHAIN_EVENTS_MAX_WATCHED_ADDRESSES=25
CHAIN_EVENTS_BACKFILL_ON_START=false
CHAIN_EVENTS_BACKFILL_LIMIT_PER_ADDRESS=25
CHAIN_EVENTS_FETCH_TRANSACTION_ON_LOG=true
CHAIN_EVENTS_MAX_CONCURRENT_FETCHES=4
CHAIN_EVENTS_REQUEST_TIMEOUT_MS=10000
CHAIN_EVENTS_ON_NEW_CANDIDATE=false
CHAIN_EVENTS_ON_CHAIN_VERIFIED=false
```

Enable it only with explicit read-only HTTP and WebSocket RPC URLs:

```bash
CHAIN_EVENTS_ENABLED=true SOLANA_RPC_HTTP=https://... SOLANA_RPC_WS=wss://... pnpm --filter @axi/api dev
```

Generic transaction normalization is conservative. It records unclassified
transactions, token/SOL balance changes, and possible low/medium-confidence
trade observations. It does not invent USD prices. Chain trades with missing
price or volume are persisted as observation-only and are not used for
volume/price metrics.

Limitations: watched mints may not catch every swap; pool, bonding-curve, token
account, or program addresses may be better watch targets. This is not a
full-market indexer, does not do DEX-specific decoding yet, does not provide
real USD pricing yet, does not use Geyser/gRPC/shreds, does not use metered
PumpPortal trade streams, and does not use Axiom private APIs or scraping.

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

Paper auto-ordering is disabled by default:

```bash
PAPER_AUTO_ORDER=false pnpm --filter @axi/api dev
```

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
- `GET /candidates`
- `GET /candidates/:mint`
- `GET /risk`
- `GET /risk/:mint`
- `GET /metrics`
- `GET /metrics/:mint`
- `GET /positions`
- `GET /storage/stats`
- `GET /chain/status`
- `GET /chain/verifications`
- `GET /chain/verifications/:mint`
- `GET /chain/verify/:mint`
- `POST /chain/verify`
- `GET /chain/events/status`
- `GET /chain/events/watches`
- `POST /chain/events/watch`
- `DELETE /chain/events/watch/:address`
- `GET /chain/events/transactions`
- `GET /chain/events/trades`
- `GET /chain/events/transactions/:signature`
- `GET /paper/orders`
- `GET /paper/positions`
- `ws://localhost:8787/ws/signals`

`GET /signals` returns the current in-memory signal cache. `GET
/signals/recent` returns recent persisted signals from SQLite.

`GET /metrics` returns current in-memory rolling metrics for tracked mints.
`GET /metrics/:mint` returns one metrics snapshot or `404` when that mint is not
tracked.

`GET /candidates` and `GET /risk` return the current in-memory candidate
lifecycle and risk snapshots. The persisted history is available through SQLite
and replay.

`GET /chain/status` reports whether the read-only verifier is disabled,
misconfigured, or ready. `POST /chain/verify` accepts `{ "mint": "..." }` and
runs one read-only verification only when the verifier is enabled and
`SOLANA_RPC_HTTP` is configured.

`GET /chain/events/status` reports whether read-only watched-address ingestion
is disabled, misconfigured, ready, or running. `POST /chain/events/watch` adds a
read-only watched address only when `CHAIN_EVENTS_ENABLED=true` and both
`SOLANA_RPC_HTTP` and `SOLANA_RPC_WS` are configured.

## Replay Local Data

Replay persisted fake paper data from SQLite without starting the API,
dashboard, live trading, or external services:

```bash
pnpm --filter @axi/api replay
pnpm --filter @axi/api replay -- --type signals --limit 25 --speed 0
pnpm --filter @axi/api replay -- --db .data/axi.sqlite --type feed_events
pnpm --filter @axi/api replay -- --type feed_events --metrics true --limit 100 --speed 0
pnpm --filter @axi/api replay -- --type feed_events --metrics true --risk true --candidates true --limit 100 --speed 0
pnpm --filter @axi/api replay -- --type risk_snapshots --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type candidate_decisions --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type chain_verifications --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type chain_transaction_events --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type chain_trade_events --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type chain_trade_events --metrics true --risk true --candidates true --limit 100 --speed 0
pnpm --filter @axi/api replay -- --type feed_events --chain false
```

Replay output is JSON lines on stdout. The default database is
`.data/axi.sqlite`, which is local and ignored by git. With `--metrics true`,
feed events are replayed through the rolling metrics engine and each JSON line
includes the metrics snapshot after that event when available. With
`--risk true` and `--candidates true`, feed events are replayed through the
local risk and candidate lifecycle engines and each JSON line includes those
snapshots when available.

Run one read-only chain verification from the CLI without persistence:

```bash
pnpm --filter @axi/api chain:verify -- --mint <MINT> --json
pnpm --filter @axi/api chain:verify -- --mint <MINT> --rpc https://... --commitment confirmed
```

The CLI validates malformed mints before creating an RPC client and never
performs wallet loading, signing, sending, buying, or selling.

Run read-only chain event probes without starting the API server or persisting:

```bash
SOLANA_RPC_HTTP=https://... pnpm --filter @axi/api chain:events:backfill -- --address <ADDRESS> --limit 10
SOLANA_RPC_HTTP=https://... SOLANA_RPC_WS=wss://... pnpm --filter @axi/api chain:events:watch -- --address <ADDRESS> --timeout 30000 --limit 10
```

Both commands print JSON lines and validate malformed addresses before creating
RPC clients. They never load wallets, sign, send transactions, buy, or sell.

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
- `@axi/risk`: pure local risk/scam-filter snapshots and reason codes.
- `@axi/candidates`: pure local candidate lifecycle decisions.
- `@axi/solana-chain`: optional read-only Solana RPC verification helpers.
- `@axi/chain-events`: optional read-only watched-address transaction ingestion.
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
- `dev/risk-engine-candidate-lifecycle` contains local risk snapshots and
  candidate lifecycle decisions.
- `dev/solana-chain-verifier` contains the optional read-only Solana chain
  verifier.
- `dev/solana-transaction-ingestor` contains optional read-only watched-address
  transaction ingestion.

This project still has no wallet UI, no private-key loading, no live trading,
no Solana transaction signing, no transaction sending, no real risk-data
provider, no DEX-specific decoding, no full-market indexing, no Geyser/gRPC
streaming, no metered PumpPortal trade streams, no Axiom private API usage, and
no Axiom scraping.
