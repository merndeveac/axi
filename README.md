# AXI

Local Solana token scanner, paper trading signal engine, read-only actual data
ingestion, and future Axiom overlay. This repository remains paper-mode only.

No wallet loading, private key handling, transaction signing, or live trading
exists here yet.

## Safety Boundary

- Default mode is `paper`.
- `live` mode is refused by execution code.
- No private keys, seed phrases, wallet files, API keys, or auth tokens should be
  stored in this repo.
- No Axiom private APIs are used or reverse engineered.
- Direct Solana RPC verification, watched-address transaction ingestion, local
  market-data normalization, and optional PumpPortal token-trade ingestion
  exist, but all are read-only/paper-only and disabled or gated by default.

## Architecture

```text
data feeds -> watch orchestration -> metrics -> risk -> candidates -> scoring -> API/WebSocket -> dashboard/overlay
```

Default runtime starts in live token mode with `DATA_FEED_MODE=live` and
`DATA_FEED=pumpportal`. It connects to PumpPortal new-token and migration
streams and does not generate fake tokens. If the live feed is offline or no
events have arrived, the dashboard shows an explicit live-feed waiting/offline
state instead of silently showing historical mock rows.

`MockFeedProvider` remains available for tests and explicit local demos only.
It requires `DATA_FEED_MODE=mock`, `DATA_FEED=mock`, `ALLOW_MOCK_DATA=true`, and
`MOCK_FEED_ENABLED=true`. A public PumpPortal feed provider is available behind
`DATA_FEED_MODE=live` / `DATA_FEED=pumpportal` for new-token and migration
events, plus opt-in metered `subscribeTokenTrade` ingestion for selected mints
only.

Signal, identity, and risk data can be missing, unresolved, incomplete,
normalized from PumpPortal payloads, normalized from read-only Solana
observations, enriched from optional off-chain metadata, or mock-generated only
when mock mode is explicitly enabled. It remains paper-only.

## AXI Indexer Foundation

This branch adds the first backend/indexer foundation for Axiom-scale market
coverage while preserving the current API and dashboard. It introduces
normalized indexer event contracts, an in-memory event bus, a current-session
live-state store, a pure trade timeseries package, an indexer app skeleton, and
API endpoints that can read from the new layer.

This step does not connect to Geyser, Yellowstone, LaserStream, shreds, or any
live validator stream. It does not decode Pump.fun, Raydium, Meteora, Orca, or
other DEX transactions directly yet. It does not trade, sign, send
transactions, load wallets, call PumpPortal Lightning execution, call
PumpPortal Local Transaction APIs, use Axiom private APIs, or scrape Axiom. The
PumpPortal data-wallet and Lightning readiness work remains readiness-only.

```text
stream source
  -> indexer
  -> normalized events
  -> event bus
  -> live state
  -> timeseries
  -> API
  -> dashboard
```

The current API adapter ingests normalized events from the existing local feed
pipeline and exposes the indexer state through `/indexer/*`. The existing
`/ui/live-token-cards` dashboard endpoint keeps its current response source by
default. Set `API_INDEXER_PREFER_LIVE_STATE_CARDS=true` only when testing the
new live-state card adapter.

Indexer endpoints:

- `GET /indexer/status`
- `GET /indexer/events/recent`
- `GET /indexer/live-state`
- `GET /indexer/live-cards`
- `GET /indexer/timeseries/:mint`
- `GET /indexer/stream/status`
- `GET /indexer/stream/recent`
- `POST /indexer/stream/mock/publish-fixture`

Indexer app commands:

```bash
pnpm --filter @axi/indexer dev
pnpm --filter @axi/indexer smoke
pnpm --filter @axi/indexer smoke:pumpfun
pnpm --filter @axi/indexer smoke:managed-stream
pnpm --filter @axi/indexer stream:status
pnpm --filter @axi/indexer decode:pumpfun -- --fixture buy-trade.json --summary true --show-evidence true
pnpm --filter @axi/indexer fetch:pumpfun-fixture -- --signature <SIG> --kind buy_trade --update-manifest true
```

## Managed Stream Adapter Foundation

Branch `dev/managed-stream-adapter-foundation` prepares AXI to connect to
managed Solana stream providers later. It adds provider-agnostic stream
contracts, a deterministic mock managed stream provider, and an adapter that can
route local stream envelopes through the Pump.fun decoder into normalized
indexer events, the event bus, live state, timeseries, API, and dashboard.

Current providers:

- mock managed stream for local tests and smoke commands
- Yellowstone/Geyser placeholder status
- Helius LaserStream placeholder status

The current code does not connect to Yellowstone, LaserStream, Geyser, shreds,
or any live stream endpoint. No provider credentials are required for tests. The
mock stream uses local Pump.fun fixtures only. This layer does not live trade,
sign, send transactions, load wallets, call PumpPortal Lightning execution, call
PumpPortal Local Transaction APIs, use Axiom private APIs, or scrape Axiom.

Managed stream commands:

```bash
pnpm --filter @axi/indexer smoke:managed-stream
pnpm --filter @axi/indexer stream:status
```

Managed stream API endpoints:

- `GET /indexer/stream/status`
- `GET /indexer/stream/recent`
- `POST /indexer/stream/mock/publish-fixture`

Example local mock publish:

```bash
curl -X POST http://localhost:8787/indexer/stream/mock/publish-fixture \
  -H 'content-type: application/json' \
  -d '{"fixture":"buy-trade.json"}'
```

Managed stream env placeholders:

```text
MANAGED_STREAM_ENABLED=false
MANAGED_STREAM_PROVIDER=mock
MANAGED_STREAM_ENDPOINT=
MANAGED_STREAM_AUTH_TOKEN=
YELLOWSTONE_GRPC_URL=
YELLOWSTONE_GRPC_TOKEN=
LASERSTREAM_GRPC_URL=
LASERSTREAM_API_KEY=
```

Roadmap:

1. Add opt-in real managed provider SDK/client.
2. Connect to Yellowstone/LaserStream in opt-in dev mode.
3. Filter for Pump.fun/PumpSwap program transactions.
4. Route live envelopes through Pump.fun decoder.
5. Write raw events/ticks to ClickHouse.
6. Write live token state to Redis.
7. Switch dashboard cards to indexer-backed live state.

## Pump.fun Decoder Fixtures

Branch `dev/pumpfun-verified-fixtures-idl-decoder` extends
`@axi/pumpfun-decoder`, a pure local TypeScript decoder package. It accepts
parsed Solana transaction-like payloads, extracts local logs, instruction hints,
accounts, SOL/token balance deltas, optional Anchor/IDL hints, and emits
normalized indexer events for token creation, trades, migrations, and
unknown/failed transactions.

The fixtures live in `packages/pumpfun-decoder/fixtures`. The checked-in
fixtures are synthetic today and are registered in
`packages/pumpfun-decoder/fixtures/manifest.json` with provenance metadata,
expected event types, sanitized status, and golden expected-output snapshots.
Verified public Solana `getTransaction` fixtures can be imported locally with
the fetch CLI. Public fixtures may contain public on-chain wallet/account
addresses; they must not contain API keys, private keys, seed phrases, wallet
files, or `.env` data.

The decoder remains conservative. Fixture tests do not hit RPC or PumpPortal.
The fetch/import CLI requires an explicit `SOLANA_RPC_HTTP` or `--rpc` URL and
is read-only: it fetches public transaction data, sanitizes it, optionally
updates the manifest, and never loads wallets, signs, sends transactions, or
trades. IDL-aware hooks exist for Anchor discriminators and `Program data:`
logs, but no verified Pump.fun IDL is checked in yet.

This still does not connect to Geyser, Yellowstone, LaserStream, live Pump.fun
streams, PumpPortal trading APIs, wallets, or trading APIs.

Run the local fixture smoke:

```bash
pnpm --filter @axi/indexer smoke:pumpfun
```

Decode one fixture to normalized indexer JSON:

```bash
pnpm --filter @axi/indexer decode:pumpfun -- --fixture buy-trade.json --summary true --show-evidence true
pnpm --filter @axi/indexer decode:pumpfun -- --manifest-id buy-trade --compare-expected true
```

Import a verified public transaction fixture locally:

```bash
SOLANA_RPC_HTTP=https://... pnpm --filter @axi/indexer fetch:pumpfun-fixture -- --signature <SIG> --kind buy_trade --update-manifest true
```

Inspect local decoder availability from the API:

```bash
curl http://localhost:8787/indexer/decoders
```

Decode a known local fixture through the API debug endpoint:

```bash
curl -X POST http://localhost:8787/indexer/decoders/pumpfun/decode-fixture \
  -H 'content-type: application/json' \
  -d '{"fixture":"buy-trade.json"}'
```

These API decoder endpoints are debug-only. They do not persist events, make
network calls, sign transactions, or trade.

Future indexer infrastructure can be started for local development with:

```bash
docker compose --profile indexer up -d
```

Roadmap:

1. Add verified public transaction fixtures.
2. Add verified Pump.fun IDL if available.
3. Improve IDL-aware instruction/event parsing.
4. Add opt-in real Yellowstone/LaserStream client behind disabled-by-default config.
5. Feed live decoded transactions into event bus/live-state.
6. Write raw ticks to ClickHouse.
7. Write live state to Redis.
8. Add PumpSwap/Raydium/Meteora/Orca decoders.

## Local Persistence

Paper-mode development data is stored in a local SQLite database:

```text
.data/axi.sqlite
```

The API initializes the database automatically, creates the current schema, and
stores feed events, risk snapshots, candidate decisions, read-only chain
verifications, read-only watched-address chain events, market observations,
watch plans/actions, overlay signals, paper orders, and paper positions. This
database is local-only and is ignored by git.

Current persistence tables include `feed_events`, `signals`, `risk_snapshots`,
`candidate_decisions`, `chain_verifications`, `chain_transaction_events`,
`chain_trade_events`, `market_observations`, `watch_plans`, `watch_actions`,
`pumpportal_token_trade_events`, `live_feed_events`,
`actual_data_subscriptions`, `actual_data_sessions`, `token_identities`,
`token_metadata_fetches`, `lightning_trade_plans`,
`pumpportal_wallet_status_snapshots`, `paper_orders`, and `paper_positions`.

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

Current metrics include rolling buy/sell/total/net USD volume, SOL volume when
available, trade counts, unique buyers/sellers/traders, price change, price
velocity, volume velocity, acceleration, buyer velocity, buy/sell ratio, net buy
pressure, and an `insufficientMetrics` flag. USD metrics remain preferred.
SOL-denominated metrics are used as a paper-mode fallback only when USD is
unknown. The mock feed emits deterministic fake trade events to exercise this
engine locally. These mock trades are not real market data and remain
paper-only.
Opt-in PumpPortal token trades can update SOL-denominated rolling metrics when
they include usable SOL and token amounts.

Holder count, top-holder, and top-10-holder values can appear when read-only
chain verification or risk snapshots provide them. Holder velocity and holder
acceleration are not computed unless a real holder time series exists. In the
current live-token card model those derivative fields are `null`, render as
`--`, and include `HOLDER_TIME_SERIES_UNAVAILABLE`.

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
real USD pricing yet, does not use Geyser/gRPC/shreds, does not subscribe to
account-trade streams, and does not use Axiom private APIs or scraping.

## Read-Only Market Data Normalizer

`@axi/market-data` is a pure local normalization layer. It makes no network
calls, loads no wallets, signs nothing, sends no transactions, and does not
trade. It derives conservative market observations from already-fetched Solana
transaction token/SOL/quote balance deltas.

The normalizer can compute quote volume, SOL volume, price in the quote asset,
price in SOL when the quote is SOL or WSOL, and USD price/volume only when the
quote is a stable token or when an explicit `MARKET_DATA_SOL_USD_PRICE` is
configured and conversion is enabled. It does not fetch prices and does not
invent USD values.

Market observations are conservative. Low-confidence or incomplete observations
are persisted as observation-only and are not fed into metrics, risk,
candidates, scoring, or signals. This is not DEX-specific decoding yet.

Default market-data settings:

```bash
MARKET_DATA_ENABLED=true
MARKET_DATA_MIN_CONFIDENCE_FOR_METRICS=medium
MARKET_DATA_SOL_USD_PRICE=
MARKET_DATA_ALLOW_SOL_USD_CONVERSION=false
MARKET_DATA_ALLOW_USD_FROM_STABLE_QUOTES=true
```

`MARKET_DATA_ENABLED=true` is safe by default because it only normalizes chain
events that already exist. If `CHAIN_EVENTS_ENABLED=false`, it does not start
RPC or WebSocket activity.

## Read-Only Watch Orchestrator

`@axi/watch-orchestrator` is a pure TypeScript planner that decides which mint,
pool, or bonding-curve addresses would be useful to verify or watch based on
public feed payloads and candidate context. It is deterministic, makes no
network calls, loads no wallets, signs nothing, sends no transactions, and does
not trade.

The API-side orchestrator is disabled by default. When enabled, it creates
persisted watch plans and action records. It only schedules read-only mint
verification if `CHAIN_VERIFIER_ENABLED=true` and the verifier is configured. It
only adds read-only watched addresses if `CHAIN_EVENTS_ENABLED=true` and chain
events are configured. It never starts RPC/WebSocket services by itself.

Default watch settings:

```bash
WATCH_ORCHESTRATOR_ENABLED=false
WATCH_ORCHESTRATOR_VERIFY_ON_NEW_TOKEN=false
WATCH_ORCHESTRATOR_VERIFY_ON_MIGRATION=false
WATCH_ORCHESTRATOR_WATCH_ON_NEW_TOKEN=false
WATCH_ORCHESTRATOR_WATCH_ON_MIGRATION=false
WATCH_ORCHESTRATOR_MAX_TARGETS_PER_CANDIDATE=3
WATCH_ORCHESTRATOR_ALLOW_MINT_WATCH=true
WATCH_ORCHESTRATOR_ALLOW_BONDING_CURVE_WATCH=true
WATCH_ORCHESTRATOR_ALLOW_POOL_WATCH=true
WATCH_ORCHESTRATOR_ALLOW_PROGRAM_WATCH=false
WATCH_ORCHESTRATOR_ALLOW_WALLET_WATCH=false
WATCH_ORCHESTRATOR_MIN_CONFIDENCE_TO_WATCH=medium
```

The planner inspects normalized feed fields first and then conservatively
inspects preserved raw PumpPortal payloads for likely mint, pool, and
bonding-curve addresses. Wallet and program targets are skipped by default.
Plans explain selected and skipped targets with reason codes.

## Token Identity Normalization

`@axi/token-identity` normalizes token names, symbols, titles, image URLs,
metadata URIs, descriptions, socials, creators, source confidence, and
unresolved reason codes. The API stores one current identity row per mint and a
history of metadata fetch attempts in SQLite.

Identity can come from PumpPortal payloads, read-only Solana metadata accounts,
optional off-chain metadata JSON, or explicit mock data. Runtime mock identities
are disabled unless mock mode is explicitly enabled. Solana metadata reads and
off-chain metadata fetches are disabled by default except for on-demand local
resolution when configured.

Default token identity settings:

```bash
TOKEN_IDENTITY_SOLANA_METADATA_ENABLED=false
TOKEN_IDENTITY_SOLANA_METADATA_ON_NEW_TOKEN=false
TOKEN_IDENTITY_SOLANA_METADATA_ON_DEMAND=true
TOKEN_IDENTITY_OFFCHAIN_FETCH_ENABLED=false
TOKEN_IDENTITY_OFFCHAIN_TIMEOUT_MS=5000
TOKEN_IDENTITY_OFFCHAIN_CACHE_TTL_MS=3600000
TOKEN_IDENTITY_IPFS_GATEWAY=https://ipfs.io/ipfs/
TOKEN_IDENTITY_MAX_METADATA_BYTES=262144
```

Token identity is surfaced through signals, candidates, metrics, actual-data
views, watch plans, and the dashboard. Unresolved identities remain visible as
mint-first rows instead of being replaced with fake names.

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

Live-token runtime helpers:

```bash
pnpm live:tokens
pnpm live:tokens:stop
pnpm live:tokens:logs
```

The restart script only stops PIDs recorded in `.tmp/axi-dev-pids.json`. If a
port is already used by an unknown process, it reports that instead of killing
unrelated processes.

## Live Tokens

Start the normal live token runtime:

```bash
pnpm live:tokens
```

This launches the API and dashboard with `DATA_FEED_MODE=live`,
`DATA_FEED=pumpportal`, PumpPortal `subscribeNewToken` and
`subscribeMigration` enabled, runtime mock data disabled, paper auto-ordering
disabled, and metered token trades disabled.

Manual API launch:

```bash
DATA_FEED_MODE=live \
DATA_FEED=pumpportal \
PUMPPORTAL_SUBSCRIBE_NEW_TOKEN=true \
PUMPPORTAL_SUBSCRIBE_MIGRATION=true \
ALLOW_MOCK_DATA=false \
MOCK_FEED_ENABLED=false \
pnpm --filter @axi/api dev
```

This uses PumpPortal new-token and migration streams. It does not use metered
token trades, does not trade, does not sign, does not require a wallet, does not
use Axiom, and does not show mock tokens in the LIVE TOKENS panel.

Probe the same non-metered live token streams without starting the API:

```bash
pnpm --filter @axi/api live:probe -- --limit 10 --timeout 60000
```

If no live tokens appear, check:

```bash
curl -s http://localhost:8787/feed/status | jq
curl -s http://localhost:8787/live/status | jq
pnpm live:tokens:logs
```

Dashboard live states are explicit:

```text
WAITING FOR PUMPPORTAL LIVE TOKENS
LIVE FEED OFFLINE
LIVE FEED CONNECTED - NO TOKENS YET
NO LIVE FEED CONFIGURED
MOCK MODE EXPLICITLY ENABLED
```

PumpPortal API keys are optional for this implementation's new-token/migration
connection path. If PumpPortal rejects a no-key connection, `/feed/status`
reports the connection error; when the error indicates a key requirement, reason
codes include `PUMPPORTAL_API_KEY_REQUIRED_BY_PROVIDER`. Do not put real keys in
source files, tests, commits, README examples, or `.env.example`.

The free new-token and migration streams can populate current-session live
tokens and launches, with names and symbols when the payload includes them.
They do not provide full trade volume or velocity by themselves.

The dashboard is live-token-first. Its default LIVE tab renders current-session
token intelligence cards from:

```text
GET /ui/live-token-cards
```

Each card includes identity, live feed status, market fields, participant flow,
strategy calculations, risk flags, final signal/action/score, and audit fields.
Fields that are not available from the current data source remain `null` in the
API, render as `--` in the UI, and are listed in `missingFields`,
`unavailableFields`, `dataSourceWarnings`, and calculation reason codes. The
card endpoint does not include historical mock/replay rows.

Dashboard tabs:

- LIVE: high-density live-token cards, sort/filter/search controls, inline audit
  expansion.
- SIGNALS: read-only strategy status plus signal explanation and raw signal
  rows.
- METRICS: rolling windows, velocity, acceleration, sample counts, and metric
  debug values.
- RISK: risk levels, hard rejects, authority flags, holder concentration, and
  risk reasons.
- DATA: feed, live feed, wallet readiness, Lightning dry-run readiness, actual
  data, market data, chain, and token identity health.
- STORAGE / DEBUG: persisted counts, live feed rows, and verification/debug
  rows.

The LIVE tab can sort by newest, score, volume velocity, 10-second volume, or
risk. It can filter all/watch/qualified/rejected cards, filter to real data
only, and search by symbol, name, or mint. It never shows buy/sell buttons,
wallet controls, signing controls, or live execution controls.

Displayed calculations include first and second derivatives for volume, price,
and buyers when usable rolling trade samples exist. Holder derivatives are shown
only when a real holder time series is available; otherwise they render as `--`
with `HOLDER_TIME_SERIES_UNAVAILABLE`.

If tokens arrive but names, symbols, or metadata are missing, enable read-only
Solana metadata resolution:

```bash
DATA_FEED_MODE=live \
DATA_FEED=pumpportal \
PUMPPORTAL_DATA_API_KEY="$PUMPPORTAL_DATA_API_KEY" \
PUMPPORTAL_SUBSCRIBE_NEW_TOKEN=true \
PUMPPORTAL_SUBSCRIBE_MIGRATION=true \
SOLANA_RPC_HTTP="https://api.mainnet-beta.solana.com" \
TOKEN_IDENTITY_SOLANA_METADATA_ENABLED=true \
TOKEN_IDENTITY_SOLANA_METADATA_ON_NEW_TOKEN=true \
TOKEN_IDENTITY_SOLANA_METADATA_ON_DEMAND=true \
TOKEN_IDENTITY_OFFCHAIN_FETCH_ENABLED=false \
pnpm --filter @axi/api dev
```

Actual trade metrics require explicit PumpPortal token-trade subscriptions. The
token-trade stream is metered, so use the probe first and keep strict limits:

```bash
export TEST_MINT="PASTE_REAL_MINT_HERE"

PUMPPORTAL_DATA_API_KEY="$PUMPPORTAL_DATA_API_KEY" \
pnpm --filter @axi/api actual-data:probe -- \
  --mint "$TEST_MINT" \
  --limit 25 \
  --timeout 30000 \
  --ack-metered
```

If that prints token-trade events, run the API with bounded metered ingestion:

```bash
DATA_FEED_MODE=live \
DATA_FEED=pumpportal \
PUMPPORTAL_DATA_API_KEY="$PUMPPORTAL_DATA_API_KEY" \
PUMPPORTAL_SUBSCRIBE_NEW_TOKEN=true \
PUMPPORTAL_SUBSCRIBE_MIGRATION=true \
PUMPPORTAL_TOKEN_TRADES_ENABLED=true \
PUMPPORTAL_TOKEN_TRADES_ACK_METERED=true \
PUMPPORTAL_TOKEN_TRADES_MANUAL_MINTS="$TEST_MINT" \
PUMPPORTAL_TOKEN_TRADES_MAX_SUBSCRIBED_TOKENS=1 \
PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_SESSION=200 \
PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_MINT=200 \
PUMPPORTAL_TOKEN_TRADES_UNSUBSCRIBE_AFTER_MS=120000 \
SOLANA_RPC_HTTP="https://api.mainnet-beta.solana.com" \
TOKEN_IDENTITY_SOLANA_METADATA_ENABLED=true \
TOKEN_IDENTITY_SOLANA_METADATA_ON_DEMAND=true \
pnpm --filter @axi/api dev
```

## Run The API

```bash
pnpm --filter @axi/api dev
```

The API defaults to `http://localhost:8787`.

By default, `DATA_FEED_MODE=live` and `DATA_FEED=pumpportal` are used. No
fake/mock runtime tokens are generated. If you want no feed, set
`DATA_FEED_MODE=none`.

Paper auto-ordering is disabled by default:

```bash
PAPER_AUTO_ORDER=false pnpm --filter @axi/api dev
```

Mock runtime data requires an explicit three-part opt-in:

```bash
DATA_FEED_MODE=mock \
DATA_FEED=mock \
ALLOW_MOCK_DATA=true \
MOCK_FEED_ENABLED=true \
MOCK_FEED_SEED=42 \
MOCK_FEED_SCENARIO=momentum \
pnpm --filter @axi/api dev
```

Supported mock scenarios are `normal`, `momentum`, `rug`, and `flat`. The same
seed and scenario produce the same mock event sequence, which is useful for
repeatable paper-mode tests. Mock runtime data is not enabled by seed or
scenario variables alone.

Public PumpPortal live-token mode is the default and can be started explicitly:

```bash
DATA_FEED_MODE=live DATA_FEED=pumpportal pnpm --filter @axi/api dev
```

PumpPortal support uses one WebSocket connection and subscribes by default only
to:

- `subscribeNewToken`
- `subscribeMigration`

`subscribeTokenTrade` is implemented only as explicit, opt-in actual data
ingestion for selected mints. It is metered, disabled by default, requires
`PUMPPORTAL_TOKEN_TRADES_ACK_METERED=true`, and is budget-limited. Account trade
streams and PumpPortal trading APIs are not implemented.

New-token and migration events are normalized with conservative placeholder
metrics until a later metrics source exists, so they are marked with
`INSUFFICIENT_METRICS` and remain paper-only. Usable token-trade events can
update SOL-denominated rolling metrics.

## Actual PumpPortal Token Trade Data

Actual PumpPortal token trade ingestion is disabled by default and remains
read-only, observation-only, and paper-only. It requires:

- `DATA_FEED_MODE=live`
- `DATA_FEED=pumpportal`
- `PUMPPORTAL_DATA_API_KEY=...` or legacy `PUMPPORTAL_API_KEY=...`
- `PUMPPORTAL_TOKEN_TRADES_ENABLED=true`
- `PUMPPORTAL_TOKEN_TRADES_ACK_METERED=true`

Only selected token mints are subscribed. One WebSocket connection is used.
`subscribeAccountTrade`, PumpPortal trading APIs, wallet loading, private-key
handling, signing, transaction sending, and live trading are not implemented.

Safe manual run:

```bash
DATA_FEED_MODE=live \
DATA_FEED=pumpportal \
PUMPPORTAL_DATA_API_KEY=... \
PUMPPORTAL_TOKEN_TRADES_ENABLED=true \
PUMPPORTAL_TOKEN_TRADES_ACK_METERED=true \
PUMPPORTAL_TOKEN_TRADES_MANUAL_MINTS=<MINT> \
PUMPPORTAL_TOKEN_TRADES_MAX_SUBSCRIBED_TOKENS=1 \
PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_SESSION=200 \
PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_MINT=200 \
PUMPPORTAL_TOKEN_TRADES_UNSUBSCRIBE_AFTER_MS=120000 \
pnpm local:restart
```

Live-card trade tracking is a stricter, card-focused wrapper around the same
read-only PumpPortal token-trade stream. It is disabled by default and requires
both the existing PumpPortal metered acknowledgement and its own explicit
acknowledgement:

```bash
DATA_FEED_MODE=live \
DATA_FEED=pumpportal \
PUMPPORTAL_DATA_API_KEY=... \
PUMPPORTAL_TOKEN_TRADES_ENABLED=true \
PUMPPORTAL_TOKEN_TRADES_ACK_METERED=true \
LIVE_TRADE_TRACKING_ENABLED=true \
LIVE_TRADE_TRACKING_ACK_METERED=true \
LIVE_TRADE_TRACKING_MAX_MINTS=1 \
LIVE_TRADE_TRACKING_MAX_EVENTS_PER_SESSION=200 \
LIVE_TRADE_TRACKING_MAX_EVENTS_PER_MINT=200 \
LIVE_TRADE_TRACKING_AUTO_MODE=none \
LIVE_TRADE_TRACKING_UNSUBSCRIBE_AFTER_MS=120000 \
pnpm local:restart
```

Track one selected mint after the server is running:

```bash
curl -X POST http://localhost:8787/live/trade-tracking/track \
  -H 'content-type: application/json' \
  -d '{"mint":"<MINT>","reason":"manual"}'
```

### PumpPortal Data Wallet / Billing

PumpPortal metered data streams such as `subscribeTokenTrade` require a
PumpPortal API key linked to a wallet with SOL for data-message billing. This is
not an AXI trading wallet. AXI does not load private keys, store private keys,
sign transactions, send transactions, call PumpPortal trading APIs, or create
live orders. The API key stays backend-only and should be treated as sensitive;
the dashboard may show only whether it is configured.

Only fund small amounts. PumpPortal token/account trade streams require at
least `0.02 SOL` of data-billing balance, and metered websocket messages are
modeled at `0.01 SOL / 10,000 events`. New-token and migration streams do not
require this metered data-wallet funding.

Manual setup:

1. Create a PumpPortal wallet/API key on PumpPortal.
2. Save the private key yourself outside AXI.
3. Add only the public key and API key to `.env.local`.
4. Fund the public key with a small amount of SOL.
5. Start the app.
6. Check `/pumpportal/data-wallet/status`.

`.env.local` values:

```bash
PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=<PUBLIC_FUNDING_ADDRESS>
PUMPPORTAL_DATA_API_KEY=<PUMPPORTAL_DATA_API_KEY>
SOLANA_RPC_HTTP=<RPC_HTTP_URL>
PUMPPORTAL_DATA_WALLET_MIN_BALANCE_SOL=0.02
PUMPPORTAL_DATA_WALLET_TARGET_BALANCE_SOL=0.05
PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000=0.01
```

The public funding address is safe to display in the dashboard. The API key is
never returned by the API and never shown in the frontend.

Data-wallet endpoints:

```bash
curl http://localhost:8787/pumpportal/data-wallet/status
curl -X POST http://localhost:8787/pumpportal/data-wallet/refresh
curl http://localhost:8787/pumpportal/data-wallet/funding
```

CLI status helper:

```bash
pnpm --filter @axi/api pumpportal:data-wallet:status
```

The optional PumpPortal create-wallet helper is intentionally not implemented
in AXI. Manual setup keeps generated hot-wallet private keys outside the app and
outside the repo.

### PumpPortal Lightning Readiness

PumpPortal Lightning is for future trade execution, not live data ingestion.
Live price action comes from free new-token/migration streams and opt-in
metered token-trade streams. AXI does not call the PumpPortal Lightning trade
endpoint yet, does not call the PumpPortal Local Transaction API, does not sign
transactions, and does not execute live trades.

Lightning readiness is limited to public wallet/balance visibility and dry-run
trade planning. A dry-run plan builds the request shape and safety checks but
always reports `NO TRANSACTION SENT`.

Recommended setup:

1. Use one PumpPortal wallet/API key for metered data streams.
2. Use a separate PumpPortal wallet/API key for future Lightning execution.
3. Treat both API keys as hot-wallet credentials.
4. Store private keys yourself outside AXI.
5. Keep balances tiny, especially if one wallet is shared.

`.env.local` values:

```bash
PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=<DATA_PUBLIC_FUNDING_ADDRESS>
PUMPPORTAL_DATA_API_KEY=<PUMPPORTAL_DATA_API_KEY>
PUMPPORTAL_TRADING_WALLET_PUBLIC_KEY=<TRADING_PUBLIC_FUNDING_ADDRESS>
PUMPPORTAL_TRADING_API_KEY=<PUMPPORTAL_TRADING_API_KEY>
PUMPPORTAL_USE_SAME_WALLET_FOR_DATA_AND_TRADING=false
SOLANA_RPC_HTTP=<RPC_HTTP_URL>
PUMPPORTAL_LIGHTNING_READINESS_ENABLED=true
PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING=false
PUMPPORTAL_LIGHTNING_REQUIRE_MANUAL_ARM=true
PUMPPORTAL_LIGHTNING_MANUAL_ARMED=false
PUMPPORTAL_LIGHTNING_MAX_BUY_SOL=0.005
PUMPPORTAL_LIGHTNING_MAX_DAILY_SOL=0.02
PUMPPORTAL_LIGHTNING_MAX_SLIPPAGE_PCT=10
PUMPPORTAL_LIGHTNING_PRIORITY_FEE_SOL=0.00005
PUMPPORTAL_LIGHTNING_POOL=auto
PUMPPORTAL_WALLET_MIN_BALANCE_SOL=0.02
PUMPPORTAL_WALLET_WARN_BALANCE_SOL=0.03
PUMPPORTAL_WALLET_TARGET_BALANCE_SOL=0.05
```

If `PUMPPORTAL_USE_SAME_WALLET_FOR_DATA_AND_TRADING=true`, AXI can reuse the
data wallet/key for readiness checks, but the dashboard and APIs show a strong
same-hot-wallet warning. Separate wallets are preferred.

Lightning readiness endpoints:

```bash
curl http://localhost:8787/pumpportal/wallets/status
curl -X POST http://localhost:8787/pumpportal/wallets/refresh
curl http://localhost:8787/pumpportal/wallets/funding
curl http://localhost:8787/execution/lightning/status
curl -X POST http://localhost:8787/execution/lightning/plan-buy \
  -H 'content-type: application/json' \
  -d '{"mint":"<MINT>","amountSol":0.001,"reason":"manual_test"}'
```

`POST /execution/lightning/execute` exists only as a hard refusal. It returns a
conflict response with `LIGHTNING_LIVE_TRADING_DISABLED` and never calls
PumpPortal.

CLI helpers:

```bash
pnpm --filter @axi/api pumpportal:wallets:status
pnpm --filter @axi/api lightning:status
pnpm --filter @axi/api lightning:plan-buy -- --mint <MINT> --amount-sol 0.001
```

The optional PumpPortal create-Lightning-wallet helper is intentionally skipped.
Manual wallet creation keeps hot-wallet private keys outside AXI and outside the
repo.

Optional live-card enrichment and chain verification are also disabled by
default. They only add read-only display data when explicitly enabled:

```bash
LIVE_CARD_ENRICHMENT_ENABLED=true \
DEXSCREENER_ENABLED=true \
JUPITER_PRICE_ENABLED=false \
curl -X POST http://localhost:8787/enrichment/tokens \
  -H 'content-type: application/json' \
  -d '{"mint":"<MINT>"}'

LIVE_CARD_CHAIN_VERIFY_ENABLED=true \
SOLANA_RPC_HTTP=<RPC_HTTP_URL> \
curl -X POST http://localhost:8787/chain/verify \
  -H 'content-type: application/json' \
  -d '{"mint":"<MINT>"}'
```

Probe token trades without starting the API server or persisting data:

```bash
PUMPPORTAL_DATA_API_KEY=... pnpm --filter @axi/api actual-data:probe -- --mint <MINT> --limit 25 --ack-metered
```

Show env-derived actual-data status without connecting:

```bash
pnpm --filter @axi/api actual-data:status
```

Endpoints:

- `GET /health`
- `GET /feed/status`
- `GET /feed/events/live`
- `GET /live/status`
- `GET /live/tokens`
- `GET /live/tokens/:mint`
- `GET /live/events`
- `GET /indexer/status`
- `GET /indexer/events/recent`
- `GET /indexer/live-state`
- `GET /indexer/live-cards`
- `GET /indexer/timeseries/:mint`
- `GET /indexer/stream/status`
- `GET /indexer/stream/recent`
- `POST /indexer/stream/mock/publish-fixture`
- `GET /ui/live-token-cards`
- `GET /strategy/status`
- `GET /signals`
- `GET /signals/recent`
- `GET /candidates`
- `GET /candidates/:mint`
- `GET /risk`
- `GET /risk/:mint`
- `GET /metrics`
- `GET /metrics/:mint`
- `GET /tokens/status`
- `GET /tokens`
- `GET /tokens/unresolved`
- `GET /tokens/:mint`
- `POST /tokens/resolve`
- `GET /positions`
- `GET /storage/stats`
- `GET /actual-data/status`
- `GET /actual-data/subscriptions`
- `POST /actual-data/subscribe`
- `DELETE /actual-data/subscribe/:mint`
- `GET /actual-data/trades`
- `GET /actual-data/trades/:mint`
- `GET /pumpportal/data-wallet/status`
- `POST /pumpportal/data-wallet/refresh`
- `GET /pumpportal/data-wallet/funding`
- `GET /pumpportal/wallets/status`
- `POST /pumpportal/wallets/refresh`
- `GET /pumpportal/wallets/funding`
- `GET /execution/lightning/status`
- `POST /execution/lightning/plan-buy`
- `POST /execution/lightning/plan-sell`
- `POST /execution/lightning/execute`
- `GET /live/trade-tracking/status`
- `POST /live/trade-tracking/track`
- `DELETE /live/trade-tracking/track/:mint`
- `GET /live/trade-tracking/trades`
- `GET /live/trade-tracking/trades/:mint`
- `GET /enrichment/status`
- `GET /enrichment/tokens/:mint`
- `POST /enrichment/tokens`
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
- `GET /market/status`
- `GET /market/observations`
- `GET /market/observations/:mint`
- `GET /market/observations/signature/:signature`
- `GET /watch/status`
- `GET /watch/plans`
- `GET /watch/plans/:mint`
- `GET /watch/actions`
- `GET /watch/actions/:mint`
- `POST /watch/plan`
- `GET /paper/orders`
- `GET /paper/positions`
- `ws://localhost:8787/ws/signals`

`GET /signals` returns the current in-memory signal cache. `GET
/signals/recent` returns recent persisted signals from SQLite.

`GET /feed/status` reports live feed mode, provider connection state,
subscriptions, reconnect counters, last event/message timestamps, parse errors,
and reason codes. `GET /feed/events/live`, `GET /live/events`, and
`GET /live/tokens` are current-session live views only; they do not include
historical mock/replay rows from SQLite.

`GET /ui/live-token-cards` composes one normalized live-token card view model
per current-session live token. It joins only safe in-memory/paper-mode state:
live tokens, identity summaries, rolling metrics, candidate decisions, risk
snapshots, actual-data summaries, market observations, and chain verification
summaries. Cards include a data-completeness model, trade-tracking state, latest
trade time, trade count, and optional enrichment fields. Unknown data stays
`null`; the dashboard renders it as `--`.

`GET /strategy/status` exposes read-only paper strategy thresholds, scoring
weights, formula notes, and safety gates. It is for visibility and tuning only;
there are no editing controls and no trading controls.

`GET /metrics` returns current in-memory rolling metrics for tracked mints.
`GET /metrics/:mint` returns one metrics snapshot or `404` when that mint is not
tracked.

`GET /candidates` and `GET /risk` return the current in-memory candidate
lifecycle and risk snapshots. The persisted history is available through SQLite
and replay.

`GET /tokens/status` reports token identity settings, cache counts, unresolved
counts, metadata fetch counts, and `paperOnly: true`. `GET /tokens` returns
stored normalized identities, `GET /tokens/unresolved` returns identities that
still need real metadata, and `POST /tokens/resolve` accepts `{ "mint": "..." }`
for one read-only on-demand identity resolution when the relevant sources are
enabled.

`GET /actual-data/status` reports the actual-data safety gates, provider
compatibility, metered acknowledgement, API-key configured boolean, subscription
counts, event budgets, PumpPortal data-wallet readiness, and `paperOnly: true`.
`POST /actual-data/subscribe` accepts `{ "mint": "...", "reason": "manual" }`
and subscribes read-only to PumpPortal token trades only when all gates pass.
Missing RPC balance checks are shown as unverified warnings; a verified balance
below the configured minimum blocks metered token-trade subscriptions.

`GET /pumpportal/data-wallet/status` reports safe billing-wallet readiness:
public funding address, SOL balance when RPC is configured, estimated metered
events remaining, threshold status, and reason codes. Responses never include
the PumpPortal API key or any private key. `GET
/pumpportal/data-wallet/funding` returns user-facing funding instructions for
the public address only.

`GET /pumpportal/wallets/status` reports separate data-wallet and trading-wallet
readiness using only public addresses, API-key configured booleans, read-only
SOL balances, status labels, and reason codes. `POST /pumpportal/wallets/refresh`
performs read-only balance refreshes and stores a public-only wallet status
snapshot. `GET /pumpportal/wallets/funding` returns public funding instructions
and hot-wallet warnings. Responses never include API keys or private keys.

`GET /execution/lightning/status` reports Lightning readiness, caps, manual-arm
state, live-trading disabled state, and reason codes. `POST
/execution/lightning/plan-buy` and `POST /execution/lightning/plan-sell` build
dry-run plans only and persist them to `lightning_trade_plans`. `POST
/execution/lightning/execute` hard-refuses with
`LIGHTNING_LIVE_TRADING_DISABLED`; no PumpPortal trade endpoint is called.

`GET /live/trade-tracking/status` reports the card-focused trade-tracking gates,
selected mint caps, session budgets, and tracked mints. `POST
/live/trade-tracking/track` accepts `{ "mint": "...", "reason": "manual" }` and
subscribes only through the existing read-only PumpPortal token-trade path when
both acknowledgement gates and all caps pass. There are no account trade
subscriptions and no trading endpoints.

`GET /enrichment/status` reports optional live-card enrichment settings. `POST
/enrichment/tokens` accepts `{ "mint": "..." }` and fetches read-only display
metadata from enabled public providers only when enrichment is explicitly
enabled.

`GET /chain/status` reports whether the read-only verifier is disabled,
misconfigured, or ready. `POST /chain/verify` accepts `{ "mint": "..." }` and
runs one read-only verification only when the verifier is enabled and
`SOLANA_RPC_HTTP` is configured.

`GET /chain/events/status` reports whether read-only watched-address ingestion
is disabled, misconfigured, ready, or running. `POST /chain/events/watch` adds a
read-only watched address only when `CHAIN_EVENTS_ENABLED=true` and both
`SOLANA_RPC_HTTP` and `SOLANA_RPC_WS` are configured.

`GET /market/status` reports the local market normalizer settings and persisted
observation count. `GET /market/observations` returns recent persisted
observations, `GET /market/observations/:mint` filters by mint, and `GET
/market/observations/signature/:signature` returns one observation or `404`.

`GET /watch/status` reports watch orchestrator settings, read-only chain service
configuration, watch counts, and `paperOnly: true`. `POST /watch/plan` accepts a
mint plus an optional local/debug event payload and creates a read-only plan. It
does not trade, sign, or send transactions.

## Replay Local Data

Replay persisted local paper data from SQLite without starting the API,
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
pnpm --filter @axi/api replay -- --type market_observations --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type pumpportal_token_trade_events --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type pumpportal_token_trade_events --metrics true --risk true --candidates true --limit 100 --speed 0
pnpm --filter @axi/api replay -- --type actual_data_subscriptions --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type actual_data_sessions --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type token_identities --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type token_metadata_fetches --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type chain_trade_events --metrics true --risk true --candidates true --limit 100 --speed 0
pnpm --filter @axi/api replay -- --type chain_trade_events --market true --metrics true --risk true --candidates true --limit 100 --speed 0
pnpm --filter @axi/api replay -- --type chain_transaction_events --market true --limit 100 --speed 0
pnpm --filter @axi/api replay -- --type watch_plans --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type watch_actions --limit 25 --speed 0
pnpm --filter @axi/api replay -- --type feed_events --identity true --limit 100 --speed 0
pnpm --filter @axi/api replay -- --type feed_events --watch true --limit 100 --speed 0
pnpm --filter @axi/api replay -- --type feed_events --chain false
```

Replay output is JSON lines on stdout. The default database is
`.data/axi.sqlite`, which is local and ignored by git. With `--metrics true`,
feed events are replayed through the rolling metrics engine and each JSON line
includes the metrics snapshot after that event when available. With
`--risk true` and `--candidates true`, feed events are replayed through the
local risk and candidate lifecycle engines and each JSON line includes those
snapshots when available.

Normalize token identity locally from CLI inputs without starting the API or
persistence:

```bash
pnpm --filter @axi/api tokens:resolve -- --mint <MINT>
pnpm --filter @axi/api tokens:normalize -- --file ./fixtures/pumpportal-token.json
```

`tokens:resolve` validates malformed mints before creating any RPC client.
`tokens:normalize` reads a local PumpPortal-style JSON file only. Neither command
loads wallets, signs, sends transactions, buys, or sells.

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

Decode a saved or mocked transaction JSON file locally without RPC,
persistence, or trading:

```bash
pnpm --filter @axi/api market:decode -- --file ./fixtures/example-transaction.json
pnpm --filter @axi/api market:decode -- --file ./fixtures/example-transaction.json --watched-address <ADDRESS> --watched-kind wallet
```

The decoder reads local JSON only. It can use `--sol-usd-price` for explicit
SOL/USD conversion, but it never fetches prices.

Create a dry-run watch plan from a local JSON file without RPC, persistence, or
trading:

```bash
pnpm --filter @axi/api watch:plan -- --file ./fixtures/pumpportal-event.json
pnpm --filter @axi/api watch:plan -- --file ./fixtures/pumpportal-event.json --mint <MINT> --source manual
```

The watch planner CLI reads local JSON only. It never starts the API, calls RPC,
persists data, loads wallets, signs, sends transactions, buys, or sells.

## Probe Feeds

Probe normalized feed events without starting the API server, dashboard, live
trading, or persistence:

```bash
pnpm --filter @axi/api feed:probe -- --provider mock --limit 5
pnpm --filter @axi/api live:probe -- --limit 10 --timeout 60000
DATA_FEED_MODE=live DATA_FEED=pumpportal pnpm --filter @axi/api feed:probe -- --limit 20 --timeout 60000 --new-token true --migration true
```

Probe actual PumpPortal token trades for explicit mints only. This requires an
API key and explicit metered acknowledgement:

```bash
PUMPPORTAL_DATA_API_KEY=... pnpm --filter @axi/api actual-data:probe -- --mint <MINT> --limit 25 --ack-metered
pnpm --filter @axi/api actual-data:status
```

Do not run a real metered probe unless you intend to spend metered PumpPortal
usage. Do not put real API keys in source files, tests, commits, or
`.env.example`.

## Run The Dashboard

```bash
pnpm --filter @axi/dashboard dev
```

The dashboard connects to `ws://localhost:8787/ws/signals`.

The dashboard uses a terminal-style dark UI with PAPER mode kept visible in the
top status bar. It is organized into LIVE, SIGNALS, METRICS, RISK, DATA, and
STORAGE / DEBUG tabs. The LIVE tab is the default and renders token
intelligence cards backed by `/ui/live-token-cards`. Unknown/unavailable values
render as `--` with reason-code audit visibility. The DATA tab includes a
PumpPortal metered data-wallet panel showing the public funding address,
read-only balance, budget estimates, and safety warnings. It has no wallet
signing controls, buy/sell buttons, withdrawal/import actions, or live-trading
controls.

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
development behind the `infra` profile. The `indexer` profile also starts
Postgres, Redis, and ClickHouse as future indexer infrastructure. None of these
services are required to run the current API, dashboard, or local SQLite flow.

```bash
docker compose --profile infra up -d
docker compose --profile indexer up -d
```

## Packages

- `@axi/shared`: shared Zod schemas and TypeScript types.
- `@axi/scoring`: pure scoring functions and unit tests.
- `@axi/data-feeds`: feed interfaces plus mock and PumpPortal feed providers,
  including gated token-trade subscription helpers.
- `@axi/indexer-core`: pure normalized indexer event contracts and utilities.
- `@axi/event-bus`: typed in-memory indexer event bus with bounded replay.
- `@axi/live-state`: current-session in-memory live token state from normalized
  indexer events.
- `@axi/timeseries`: pure indexer-side trade OHLCV and rolling derivatives.
- `@axi/stream-core`: provider-agnostic managed Solana stream contracts,
  masking helpers, disabled provider, and not-implemented provider.
- `@axi/stream-mock`: deterministic mock managed stream provider backed by
  local Pump.fun fixtures.
- `@axi/managed-stream-adapter`: managed stream envelope router into Pump.fun
  decoding, normalized indexer events, event bus, live state, and timeseries.
- `@axi/token-identity`: local token identity normalization and source
  confidence helpers.
- `@axi/execution`: in-memory paper execution only.
- `@axi/metrics`: local rolling-window metrics for paper-mode signal features.
- `@axi/pumpportal-lightning`: pure PumpPortal Lightning request construction,
  safety validation, disabled execution client, and dry-run plan models.
- `@axi/risk`: pure local risk/scam-filter snapshots and reason codes.
- `@axi/candidates`: pure local candidate lifecycle decisions.
- `@axi/solana-chain`: optional read-only Solana RPC verification helpers.
- `@axi/chain-events`: optional read-only watched-address transaction ingestion.
- `@axi/market-data`: pure local market observation normalization from chain
  balance deltas.
- `@axi/watch-orchestrator`: pure read-only planning for feed-derived
  verification/watch targets.
- `@axi/storage`: local SQLite persistence for paper-mode development.
- `@axi/api`: Fastify API and local WebSocket broadcaster.
- `@axi/indexer`: standalone mock-mode indexer skeleton and smoke command.
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
- `dev/chain-market-data-normalizer` contains pure local market observation
  normalization and SOL/quote-aware paper metrics.
- `dev/real-feed-watch-orchestrator` contains read-only feed-to-chain watch
  orchestration planning and API/dashboard visibility.
- `dev/dashboard-terminal-ui-pass` contains the terminal-style dashboard UI
  refinement.
- `dev/actual-data-pumpportal-trades` contains opt-in PumpPortal token-trade
  ingestion for selected mints.
- `dev/real-token-identity-normalization` contains no-mock default runtime data
  gates and token identity normalization.
- `dev/live-token-feed-default` contains live PumpPortal token-feed defaults,
  current-session live token views, feed status, live launch scripts, and the
  dashboard LIVE TOKENS panel.
- `dev/live-token-intelligence-ui` contains the live-token intelligence card
  endpoint, read-only strategy status endpoint, tabbed dashboard, card audit
  view, and formatter tests.
- `dev/pumpportal-data-wallet-readiness` contains PumpPortal data-wallet
  readiness for metered data billing.
- `dev/pumpportal-lightning-readiness` contains PumpPortal wallet readiness,
  Lightning status, and dry-run planning with live execution disabled.
- `dev/indexer-foundation` contains normalized indexer events, the in-memory
  event bus, live-state store, timeseries package, mock indexer app, optional
  indexer API endpoints, and the future Docker indexer profile.
- `dev/managed-stream-adapter-foundation` contains provider-agnostic managed
  stream contracts, the mock stream provider, Yellowstone/LaserStream
  placeholders, stream-to-decoder routing, indexer smoke commands, API stream
  endpoints, and dashboard status fields.

Direct Solana RPC verification and watched-address transaction ingestion exist,
and local market-data normalization and watch orchestration exist, but they are
read-only and disabled or conservative by default. This project still has no
wallet UI, no private-key loading, no live trading, no Solana transaction
signing, no transaction sending, no real risk-data provider, no DEX-specific
decoding, no full-market indexing, no Geyser/gRPC streaming, no account-trade
streams, no PumpPortal trading API usage, no Axiom private API usage, and no
Axiom scraping.
