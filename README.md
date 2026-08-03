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
`DATA_FEED=pumpportal` under `AXI_RUNTIME_MODE=pumpportal_first`. It connects
to PumpPortal new-token and migration streams and does not generate fake tokens.
If the live feed is offline or no events have arrived, the dashboard shows an
explicit live-feed waiting/offline state instead of silently showing historical
mock rows.

`MockFeedProvider` remains available for tests and explicit local demos only.
It requires `DATA_FEED_MODE=mock`, `DATA_FEED=mock`, `ALLOW_MOCK_DATA=true`, and
`MOCK_FEED_ENABLED=true`. A public PumpPortal feed provider is available behind
`DATA_FEED_MODE=live` / `DATA_FEED=pumpportal` for new-token and migration
events, plus opt-in metered `subscribeTokenTrade` ingestion for selected mints
only. Watched-wallet paper exit signals can also observe PumpPortal
`subscribeAccountTrade`, but only behind explicit exit-strategy and metered
acknowledgement gates.

## PumpPortal-First Launch Scanner

The primary live runtime is now PumpPortal/Pump.fun launch discovery. Free
PumpPortal `subscribeNewToken` and `subscribeMigration` events create launch
candidates immediately. The launch scanner evaluates each candidate with
5s/10s/30s/60s/2m/5m windows, SOL volume, buy/sell counts, unique
buyers/sellers, net buy pressure, price OHLC, volume/price/buyer/trade/flow
derivatives, launch phase, derivative strength, score, drivers, blockers, and
missing-data reasons.

Derivative strength is normalized by the shared `@axi/derivative-strength`
engine. It combines conservative absolute reference scales with a bounded
same-age cohort adjustment once at least five prior peers exist. Cohorts use
percentile rank plus median/MAD diagnostics and never include future snapshots.
Every strength exposes its age bucket, direction, confidence components, cohort
readiness, and both positive/adverse magnitude. Confidence is reported but is
not applied to the signal score until the signal-calibration phase validates
that policy from captured data. The absolute scales are conservative reference
values, not statistically calibrated trading thresholds or evidence of edge.

Signal scoring is owned by the versioned `@axi/signal-calibration` reference
policy. Launch scoring and API fallback scoring use the same weights, sample
gates, penalties, and `watch` / `hot` / `ripping` labels. The policy remains
explicitly `reference_only`: it is not calibrated, cannot activate a threshold,
and cannot enable paper or live entries.

The package also provides a deterministic offline threshold evaluator. Each
observation must name the policy version, an explicit `train` or `validation`
partition, a signal timestamp, a later outcome timestamp, a forward return,
estimated costs, and a target outcome. Invalid timestamps, policy-version
mismatches, non-finite values, and outcomes at or before the signal are rejected.
Threshold selection uses training observations only; holdout metrics are
reported separately. Minimum evidence gates apply to observations, positive
outcomes, and signaled samples. Even a sufficient holdout result remains an
inactive candidate pending operator review and captured real-session evidence.

Real-session calibration evidence is captured by `@axi/session-capture` through
an explicitly started local session. Each session is assigned exactly one
`train` or `validation` partition and is pinned to the reference strategy
version and capture policy. Eligible launch snapshots are sampled into immutable
observations while the session is active. Outcomes are materialized only from
persisted, non-synthetic one-second buckets at the configured forward horizon,
with a bounded lag; missing buckets remain unavailable instead of carrying a
stale price forward. JSON, JSONL, and CSV exports contain only completed
forward observations and include a manifest that accounts for pending,
unavailable, and excluded records (CSV embeds it in the leading
`# axi-calibration-manifest=` comment).

Capture is disabled by default, manual and local-only, paper/data-only, and has
no path to automatic threshold activation or order creation. Exporting is
read-only and never starts a data feed. A typical offline export is:

```bash
pnpm --filter @axi/api calibration:export -- --list
pnpm --filter @axi/api calibration:export -- --session <capture-session-id> --format jsonl
```

Completed capture sessions can be evaluated by the versioned
`@axi/paper-strategy-evaluation` package. It selects one score threshold from
training data, applies that threshold once to a strictly later validation
holdout, deducts the captured cost assumption, and reports expectancy, a 95%
normal-approximation confidence interval, profit factor, drawdown, consecutive
losses, PnL, and MFE/MAE. Dataset manifests must be internally consistent and
have no pending or excluded outcomes, at least 95% completion, no more than 5%
unavailable outcomes, and a training outcome boundary before the first
validation signal.

Every report is immutable and remains `reference_only`. A
`paper_observation_candidate` means the evidence gates passed; it does not
activate the threshold, enable automatic paper entries, or enable live trading.
The fixed-horizon strategy-evaluation report uses independent fixed-size
positions and does not model overlapping portfolio exposure. Exit-policy
replay is handled separately by the versioned paper exit evaluator described
below. The API persists strategy reports; the read-only CLI only prints an ad
hoc report:

```bash
pnpm --filter @axi/api paper:strategy:evaluate -- --train-session <train-id> --validation-session <validation-id>
```

An eligible strategy report can then be evaluated end to end by the versioned
`@axi/paper-lifecycle-validation` package. It replays every finalized canonical
one-second path in global event time, applies the upstream training-selected
threshold once, and shares capital, daily spend, and open-position limits
across overlapping signals. The simulation reuses the paper portfolio and
paper exit-policy engines while modeling entry/exit latency, fees, base
slippage, volume participation, market impact, and deterministic missed fills.
It also compares the exit policy with a fixed-horizon close on the same filled
entries.

Lifecycle reports are immutable and fail closed on missing/synthetic paths,
observation-count mismatches, temporal overlap, unresolved positions, weak
holdout evidence, excessive drawdown/loss streaks, or poor fill quality. A
`paper_automation_candidate` still only means every fixed promotion gate
passed; it does not activate a threshold, create automatic paper orders, or
enable live execution. The read-only CLI prints an ad hoc report without
writing SQLite or starting feeds:

```bash
pnpm --filter @axi/api paper:lifecycle:validate -- --strategy-evaluation <evaluation-id> --from-db .data/axi.sqlite
```

## Approved Paper Automation And Forward Validation

`@axi/paper-automation` is the paper-only promotion controller for a passing
`paper_automation_candidate`. Approval never activates a report by itself. A
local operator must approve one immutable lifecycle report and then separately
arm its generated deployment with an exact confirmation string. The deployment
pins the upstream evaluation/version, selected score threshold, portfolio
limits, costs, entry/exit latency, fill-delay and miss assumptions, liquidity
participation, market impact, exit-policy configuration, and conservative
forward-validation gates.

Arming fails closed unless the live paper portfolio matches those pinned
assumptions and both legacy `PAPER_ENTRY_ENABLED` and `PAPER_EXIT_ENABLED` loops
are off. Approved entries use the canonical current one-second volume bucket for
participation and market-impact checks. Missing price or one-second liquidity
rejects the paper operation; it never falls back to a live order. Operations are
persisted before their modeled latency, expire after the pinned fill-delay, and
retain immutable scheduling and audit records across restarts.

An armed deployment is automatically paused whenever the API process restarts
and requires an explicit re-arm. It is also paused by the kill switch for stale
signal streaks, excessive rejected entries, forward drawdown, consecutive
losses, or expectancy drift after enough closed trades. Revocation is terminal.
There is no signing, transaction construction, wallet-secret loading, execution
API, or live-order path.

Local control and audit endpoints:

- `GET /runtime/paper-automation`
- `GET /runtime/paper-automation/deployments`
- `GET /runtime/paper-automation/events`
- `GET /runtime/paper-automation/operations`
- `POST /runtime/paper-automation/approve`
- `POST /runtime/paper-automation/arm`
- `POST /runtime/paper-automation/pause`
- `POST /runtime/paper-automation/revoke`
- `POST /runtime/paper-automation/reconcile`

Approval confirmation is `APPROVE PAPER AUTOMATION <validation-id>`, arming is
`ARM PAPER AUTOMATION <deployment-id>`, and revocation is
`REVOKE PAPER AUTOMATION <deployment-id>`. Mutations also pass through the
existing local-origin control guard and operator-action audit. The read-only
status CLI never starts a feed or modifies SQLite:

```bash
pnpm paper:automation:status -- --from-db .data/axi.sqlite
```

## Forward Paper Operations And Evidence

`@axi/paper-operations` owns explicit, versioned forward-validation sessions
around an approved paper-automation deployment. Starting a forward session does
not start PumpPortal metered tracking and does not arm paper automation. Those
remain separate local operator actions with their existing acknowledgement and
confirmation gates. Only one forward session can be active, its configuration
pins a conservative cost ceiling and health thresholds, and an active session
is marked `interrupted` after a process restart instead of being resumed.

While a session is active, the API records immutable runtime and signal-latency
snapshots. Evidence includes feed connection/silence, telemetry gaps, tracked
mints, event counts, estimated SOL cost, paper-automation state and health,
pending operations, forward PnL/drawdown, canonical time-series quality, and
storage counters. Warnings and critical alerts are append-only. A provider or
session budget breach stops metered tracking and pauses armed paper automation;
feed, telemetry, automation-health, storage, and duration failures pause paper
automation fail-closed. No check can enable a feed, arm automation, or execute a
live trade.

Local operations endpoints:

- `GET /runtime/paper-operations`
- `GET /runtime/paper-operations/sessions`
- `GET /runtime/paper-operations/sessions/:sessionId/snapshots`
- `GET /runtime/paper-operations/sessions/:sessionId/alerts`
- `GET /runtime/paper-operations/sessions/:sessionId/report`
- `POST /runtime/paper-operations/start`
- `POST /runtime/paper-operations/end`
- `POST /runtime/paper-operations/sample`

Starting requires `START PAPER FORWARD SESSION <deployment-id>` and ending
requires `END PAPER FORWARD SESSION <session-id>`. Completed or interrupted
sessions can be exported read-only as JSON, JSONL, or CSV. The CLI never opens
a network connection or writes SQLite:

```bash
pnpm paper:forward:export -- --list --from-db .data/axi.sqlite
pnpm paper:forward:export -- --session <session-id> --format jsonl --from-db .data/axi.sqlite
```

The complete operator workflow, alert response, restart drill, backup guidance,
and evidence checklist are in
[`docs/paper-forward-operations.md`](docs/paper-forward-operations.md).

## Multi-Session Forward Evidence Evaluation

`@axi/paper-forward-evaluation` turns the immutable Phase 13 session bundles
into one non-activating promotion-governance report. An evaluation always uses
every completed session for one pinned paper-automation deployment; the API
does not accept a hand-picked session list. Interrupted sessions are excluded
from performance calculations, disclosed in the audit, and fail the operational
gate so they cannot create survivorship bias. Active sessions block evaluation.

The report hashes the normalized evidence cohort with SHA-256 and checks
minimum independent sessions, UTC days, observed duration, signals, and closed
trades. Operational gates cover critical alerts, telemetry/time-series gaps,
session budgets, flat position boundaries, signal latency, rejected entries,
and missed fills. Edge gates cover drawdown, loss streaks, average return, its
95% confidence lower bound, validation-expectancy retention, and PnL after paid
data costs. The only verdicts are `insufficient_evidence`,
`operational_rejected`, `edge_rejected`, and `manual_live_candidate`.
`manual_live_candidate` is not authorization and cannot arm a signer or enable
execution.

Local endpoints:

- `GET /runtime/paper-forward-evaluation`
- `GET /runtime/paper-forward-evaluations`
- `GET /runtime/paper-forward-evaluations/:evaluationId`
- `POST /runtime/paper-forward-evaluation/evaluate`

The POST requires operator identity and the exact confirmation
`EVALUATE PAPER FORWARD EVIDENCE <deployment-id>`. The offline CLI reads SQLite
without persisting its result, opening a network connection, or starting feeds:

```bash
pnpm paper:forward:evaluate -- --deployment <deployment-id> --operator <identity> --from-db .data/axi.sqlite
```

The evaluation policy and evidence-campaign workflow are documented in
[`docs/paper-forward-evaluation.md`](docs/paper-forward-evaluation.md).

## Automated Paper Evidence Campaign

`pnpm paper:evidence:campaign` runs a fail-closed, paper-only training and
validation capture over paid PumpPortal token-trade data. It preserves the data
wallet reserve, enforces a `0.25 SOL` absolute campaign ceiling, rolls through
backend-bounded `0.001 SOL` sub-sessions, separates training outcomes from the
later validation partition, checkpoints progress locally, and automatically
attempts strategy/lifecycle evaluation when collection finishes. It never loads
a private key, signs, trades, or calls an execution API.

```bash
pnpm paper:evidence:campaign -- --budget-sol 0.25 --operator <identity>
pnpm paper:evidence:campaign -- --resume
```

The effective budget may be lower than requested when the wallet must retain
the provider minimum balance. See
[`docs/evidence-campaign-runner.md`](docs/evidence-campaign-runner.md) for the
complete safety and evidence-boundary behavior.

Launch trade tracking uses PumpPortal `subscribeTokenTrade` only for selected
mints, through the existing one-WebSocket PumpPortal provider and the metered
actual-data gates. It never uses account-trade streams, trading APIs, wallet
loading, signing, transaction sending, or live execution. Tracking is disabled
by default and remains paper-only.

## Modern Momentum Scanner UI

Branch `dev/full-pump-control-header-scanner-ui` adds Scanner UI v5: a real
dashboard control header plus compact Axiom-inspired token row/cards with
correct unavailable/zero handling and Pump.fun curve-derived fields. The
screenshot reference is used only for visual/information hierarchy. AXI does
not call Axiom APIs, scrape Axiom, or reverse engineer Axiom.

The top header is now the operational control center for local paper-mode
runtime work. It shows paper-only mode, PumpPortal live-feed state, API and
dashboard WebSocket state, data-wallet balance/status, future trading-wallet
readiness, metered price-action state, tracked mints, event usage, estimated SOL
cost, session cap, budget remaining, and last update time. Header buttons call
backend runtime endpoints:

- `POST /runtime/live-discovery/start`
- `POST /runtime/live-discovery/stop`
- `POST /runtime/live-discovery/restart`
- `POST /runtime/metered-launch-data/ack-session`
- `POST /runtime/metered-launch-data/clear-session-ack`
- `POST /runtime/metered-launch-data/start`
- `POST /runtime/metered-launch-data/stop`
- `POST /runtime/metered-launch-data/restart`
- `POST /runtime/data-wallet/refresh`
- `POST /runtime/trading-wallet/refresh`

These endpoints are local-control-plane endpoints only. Responses keep
`paperOnly: true` and `tradingDisabled: true`. They never expose API keys,
private keys, seed phrases, auth tokens, or wallet secrets. The dashboard can
show the public data-wallet address in short form and copy the public address,
but it never shows the PumpPortal API key. It does not add buy/sell buttons,
Lightning controls, account-trade controls, signing controls, or transaction
sending.

Metered price action has an explicit UI state machine: `OFF`, `ARM_REQUIRED`,
`READY`, `STOPPED`, `ACTIVE`, `BLOCKED`, `BUDGET_REACHED`, and transient
button states. `Arm Metered` sends a local in-memory session ACK with caps; it
does not write `.env.local`. `Start Metered` remains disabled until the backend
says the armed session can start. When blocked, the header shows the first
blocker and the diagnostics drawer shows exact gate reasons such as ACK missing,
API key missing, wallet missing, wallet low, budget reached, or live feed
offline. Balance unknown is shown as a warning, not as wallet missing.

The Scanner tab is the default product view: one current-session token per
compact horizontal card row. Collapsed rows group pair/token identity, actual
token image when a safe `imageUri` is available, age, short mint,
source/event badges, inline sparkline, market cap, price, DEX/pool or curve
liquidity, volume, transactions/flow, derivative price action, AXI signal, and
paper position/PnL. Clicking a row opens a compact shelf for strategy
components, derivative strength, metric windows, risk and holder data, data
audit, and paper position / exit signal details.

The Scanner tab is backed by:

- `GET /ui/momentum-rows`
- `GET /ui/momentum-diagnostics`

`/ui/momentum-rows` composes one `MomentumScannerRow` per live/session token on
the API side. The dashboard does not join the main row from many endpoints in
React. Rows include identity, image URI, age, launch phase/score, normalized
`signalDisplay`, price, market cap, FDV, liquidity, curve data, rolling
volume/flow, buy/sell ratio, net pressure, derivatives, risk/holder fields,
paper position/PnL, `dataQuality`, migration status, sparkline samples,
missing/unavailable field reasons, and strategy drivers/blockers.

Derivative fields are sample-gated. Discovery-only rows and one-trade rows
return derivative values as `null`, not `0`. First derivatives require at least
two valid distinct event timestamps, second derivatives require at least three,
and market-cap/liquidity derivatives remain `null` unless a real time-series
source exists. Raw launch and indexer derivatives use the shared
`@axi/derivatives` event-time finite-difference engine; duplicate observations
are removed, invalid timestamps are rejected, and a computed flat derivative
remains a real `0`. `/ui/momentum-rows` exposes machine-readable `derivatives`,
`derivativeStrength`, `strategy`, and `data` objects, and
`/ui/momentum-diagnostics` reports derivative coverage plus unavailable reason
counts. Strength normalization uses age buckets `0-10s`, `10-30s`, `30-60s`,
`60-120s`, `120-300s`, and `300s+`. Large negative derivatives remain visible
as adverse strength but do not contribute positive momentum score.

Sparkline source priority is `trade_samples`, then `curve_marks`, then
`unavailable`. Trade samples come from the metered/metrics PumpPortal token
trade path. Curve marks are derived only from successive Pump.fun reserve
payloads; a single curve mark is not enough to draw a line. Discovery-only rows
with no usable price series return `sparkline.direction: "unavailable"`, no
points, and `INSUFFICIENT_PRICE_SAMPLES`.

Market cap, price, and liquidity stay source-aware. `marketCapSol` from
PumpPortal payloads is preserved as SOL when present. `marketCapUsd` remains
`null` unless an explicit USD source/enrichment exists. When trade price is
missing but positive curve reserves are available, AXI derives
`curve.curvePriceSol = curveSol / curveTokens` and uses it as a conservative
curve mark. `curve.curveLiquiditySol` displays as `curve X SOL` and is not
labeled as DEX liquidity. DEX/pool liquidity still requires a pair/pool or
enrichment source. Invalid reserves return `null` with reason codes such as
`CURVE_RESERVES_UNAVAILABLE`, `CURVE_RESERVES_INVALID`, or
`CURVE_DECIMALS_UNKNOWN`; no NaN/Infinity is returned.

Migration continuity keeps the same mint in the same row when a migration event
arrives. The row records `eventTypes`, `latestEventType`, `migrationStatus`,
`migratedAt`, and pool/source hints when available. Existing metrics, launch
score state, and paper position state stay attached to the mint. Adaptive
tracking reason codes explain HOT/RIPPING, migrated, and paper-position
extension conditions; if trade samples stop after migration, the data audit
surfaces the provider/source reason instead of hiding the row.

Adaptive visibility/tracking config:

```bash
MOMENTUM_ADAPTIVE_TRACKING_ENABLED=true
MOMENTUM_ADAPTIVE_EXTEND_ON_HOT=true
MOMENTUM_ADAPTIVE_EXTEND_ON_RIPPING=true
MOMENTUM_ADAPTIVE_EXTEND_ON_PAPER_POSITION=true
MOMENTUM_ADAPTIVE_MAX_TRACK_MS=900000
MOMENTUM_KEEP_MIGRATED_TOKENS_VISIBLE_MS=1800000
```

Unavailable data stays `null` and renders as `—`; it is not displayed as zero.
Zero is reserved for true observed numeric zero values. `/ui/momentum-diagnostics`
explains blanks with field counts, top missing/unavailable reasons,
curve/trade coverage counters, source status, reason codes, and recommended next
actions such as
`ENABLE_METERED_TOKEN_TRADES_FOR_PRICE_ACTION`,
`ENABLE_ENRICHMENT_FOR_MCAP_LIQUIDITY`, `ENABLE_CHAIN_VERIFY_FOR_HOLDER_DATA`,
`WAIT_FOR_MORE_TRADE_SAMPLES`, `CHECK_DATA_WALLET_BALANCE`,
`CHECK_PUMPPORTAL_API_KEY`, and `CHECK_METERED_ACK`. Market cap USD needs
SOL/USD conversion or enrichment. DEX liquidity needs pair/pool/enrichment.
Holder count needs chain verification or another holder source. Price action
needs trade samples or a curve mark series. Social/tweet signals are not
implemented unless a provider exists and report `SOCIAL_PROVIDER_NOT_CONFIGURED`.

The dashboard has no buy/sell/execute buttons, wallet import, signing controls,
or live-transaction controls. AXI remains paper-only.

Useful local commands:

```bash
pnpm axi:restart
pnpm axi:doctor
pnpm axi:stop
```

## Watched Wallet Paper Exit Strategy

Branch `dev/watched-wallet-paper-exit-strategy` adds a paper-only exit strategy
layer. The idea is simple: if AXI already holds an open paper position and a
configured watched wallet later buys the same mint, AXI can create a paper
take-profit plan when paper PnL is above the configured threshold.

This feature does not sell, sign, send transactions, create orders, load
wallets, call PumpPortal Lightning, call PumpPortal Local Transaction APIs, or
call Jupiter. It only creates persisted `paper_sell` exit signals/plans.

The pure evaluator lives in `@axi/exit-strategy`. It supports watched wallets,
watched-wallet buy/sell/any-trade rules, minimum profit thresholds, sell-plan
percentages, current-price requirements, position-opened-before-wallet-trade
guards, cooldowns, blocked signals, and deterministic simulation fixtures.

Watched-wallet observation can use PumpPortal `subscribeAccountTrade` through
the existing single PumpPortal WebSocket provider. It is disabled by default,
metered, capped, and blocked until every explicit gate is set:

```bash
EXIT_STRATEGY_ENABLED=true
EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED=true
EXIT_STRATEGY_ACCOUNT_TRADES_ACK_METERED=true
EXIT_STRATEGY_DEFAULT_MIN_PROFIT_PCT=25
EXIT_STRATEGY_DEFAULT_SELL_PCT=100
EXIT_STRATEGY_MAX_WATCHED_WALLETS=25
EXIT_STRATEGY_MAX_EVENTS_PER_SESSION=1000
EXIT_STRATEGY_MAX_SESSION_COST_SOL=0.001
EXIT_STRATEGY_REQUIRE_DATA_WALLET_READY=true
```

Example strategy:

1. Watch public wallet X.
2. AXI opens a paper position in mint Y.
3. Wallet X buys mint Y after AXI's paper entry.
4. If paper PnL is at least 25%, create a paper exit signal to sell 100%.

Exit endpoints:

- `GET /exit/status`
- `GET /exit/wallets`
- `POST /exit/wallets`
- `DELETE /exit/wallets/:address`
- `GET /exit/rules`
- `POST /exit/rules`
- `PATCH /exit/rules/:ruleId`
- `DELETE /exit/rules/:ruleId`
- `GET /exit/events`
- `GET /exit/events/wallet/:address`
- `GET /exit/events/mint/:mint`
- `GET /exit/signals`
- `GET /exit/signals/:mint`
- `POST /exit/evaluate`
- `POST /exit/simulate`
- `GET /exit/cost`

## Paper Portfolio And PnL Engine

The paper portfolio layer is a pure simulated portfolio/PnL engine plus local
SQLite persistence and API/dashboard read models. It can turn launch scanner
signals into simulated paper entries and versioned exit-policy candidates into
simulated paper exits, but both policy loops are disabled by default. Manual
paper entry/exit endpoints are simulation-only and require a market price when
no safe local price is available.

This feature does not sign, send, prepare, or broadcast transactions. It does
not load wallets, expose API keys, call PumpPortal Lightning execution, call
PumpPortal trading APIs, call Jupiter swap APIs, use Axiom private APIs, or
scrape Axiom. All portfolio orders/fills are local paper records.

Default safety config:

```bash
PAPER_PORTFOLIO_ENABLED=true
PAPER_ENTRY_ENABLED=false
PAPER_EXIT_ENABLED=false
PAPER_PORTFOLIO_STARTING_CASH_SOL=1
PAPER_PORTFOLIO_MAX_POSITION_SIZE_SOL=0.01
PAPER_PORTFOLIO_MAX_OPEN_POSITIONS=3
PAPER_PORTFOLIO_MAX_DAILY_SPEND_SOL=0.05
PAPER_PORTFOLIO_FEE_BPS=100
PAPER_PORTFOLIO_SLIPPAGE_BPS=300
PAPER_ENTRY_MIN_LAUNCH_SCORE=80
PAPER_ENTRY_POSITION_SIZE_SOL=0.005
PAPER_EXIT_MIN_PROFIT_PCT=25
PAPER_EXIT_TAKE_PROFIT_STAGE_1_SELL_PCT=50
PAPER_EXIT_TAKE_PROFIT_PCT=50
PAPER_EXIT_STOP_LOSS_PCT=-25
PAPER_EXIT_TRAILING_STOP_PCT=
PAPER_EXIT_TRAILING_ACTIVATION_PCT=20
PAPER_EXIT_MAX_HOLD_MS=300000
PAPER_EXIT_ADVANCED_SIGNALS_ENABLED=true
PAPER_EXIT_MIGRATION_TRANSITION_ENABLED=false
```

### Versioned Paper Exit Policy

`paper-exit-policy-v1` evaluates emergency hard risk, liquidity deterioration,
stop loss, watched-wallet sells, trailing stops, derivative reversal, momentum
decay, buyer reversal, volume collapse, watched-wallet buys, two take-profit
stages, maximum hold time, and migration transitions. It is deterministic: the
first eligible rule in ascending documented priority wins. Completed partial
stages are recorded on the position and cannot fire twice.

Every evaluation, including holds and invalid inputs, is stored immutably with
the full configuration, market context, rule decisions, selected action, and
reason codes. The policy is `reference_only`, uncalibrated, and cannot activate
itself. `PAPER_EXIT_ENABLED=false` remains the default; setting it to `true`
authorizes only local simulated fills. Trailing stops additionally require an
explicit percentage, and migration exits remain independently disabled by
default. There is no live-execution path.

Read-only policy audit endpoints:

- `GET /runtime/paper-exit-policy`
- `GET /runtime/paper-exit-policy/evaluations`
- `GET /runtime/paper-exit-policy/evaluations/:evaluationId`
- `GET /runtime/paper-exit-policy/evaluations/:evaluationId/export`

Paper portfolio endpoints:

- `GET /paper-portfolio/status`
- `GET /paper-portfolio/snapshot`
- `GET /paper-portfolio/positions`
- `GET /paper-portfolio/positions/:mint`
- `GET /paper-portfolio/orders`
- `GET /paper-portfolio/fills`
- `GET /paper-portfolio/performance`
- `POST /paper-portfolio/evaluate-entries`
- `POST /paper-portfolio/evaluate-exits`
- `POST /paper-portfolio/manual-entry`
- `POST /paper-portfolio/manual-exit`
- `POST /paper-portfolio/backtest`

Replay/backtest examples:

```bash
pnpm --filter @axi/api paper:backtest -- --fixture strong-ripper
pnpm --filter @axi/api paper:backtest -- --source launch-fixture sell-pressure
pnpm --filter @axi/api paper:backtest -- --from-db .data/axi.sqlite --limit 100
pnpm --filter @axi/api paper:exit:evaluate -- --fixture trailing-stop
pnpm --filter @axi/api paper:exit:evaluate -- --fixture derivative-reversal
```

The portfolio backtest helper is fixture/smoke testing only. Its output is
explicitly `evidenceEligible: false`; use finalized calibration capture
sessions and the paper strategy evaluator for evidence reports. The exit-policy
replay command is deterministic and `reference_only`; it evaluates a local
fixture and cannot place a paper or live order.

The dashboard has a PORTFOLIO tab for simulated cash, deployed SOL, equity,
realized/unrealized PnL, fees, positions, orders, fills, and best/worst closed
paper trades. Live launch cards also include a compact paper position summary
when a token has an open simulated position.

CLI helpers:

```bash
pnpm --filter @axi/api exit:status
pnpm --filter @axi/api exit:simulate -- --fixture watched-wallet-buy-profit
pnpm --filter @axi/api exit:cost -- --wallets 10 --events-per-wallet 100
```

Fixture names:

- `watched-wallet-buy-profit`
- `watched-wallet-buy-no-position`
- `watched-wallet-buy-below-profit`
- `watched-wallet-sell`

Default launch runtime env:

```bash
AXI_RUNTIME_MODE=pumpportal_first
DATA_FEED_MODE=live
DATA_FEED=pumpportal
PUMPPORTAL_LIVE_DISCOVERY_ENABLED=true
PUMPPORTAL_SUBSCRIBE_NEW_TOKEN=true
PUMPPORTAL_SUBSCRIBE_MIGRATION=true
TIMESERIES_RETENTION_MS=300000
MANAGED_STREAM_ENABLED=false
LASERSTREAM_ENABLED=false
YELLOWSTONE_ENABLED=false
ALLOW_MOCK_DATA=false
MOCK_FEED_ENABLED=false
```

Opt-in launch trade tracking:

```bash
PUMPPORTAL_DATA_API_KEY=...
PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=<PUBLIC_FUNDING_ADDRESS>
SOLANA_RPC_HTTP=<RPC_HTTP_URL>
PUMPPORTAL_LAUNCH_TRACKING_ENABLED=true
PUMPPORTAL_LAUNCH_TRACKING_ACK_METERED=true
PUMPPORTAL_LAUNCH_TRACKING_MODE=manual
PUMPPORTAL_LAUNCH_TRACKING_MAX_CONCURRENT=3
PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_SESSION=1000
PUMPPORTAL_LAUNCH_TRACKING_MAX_SESSION_COST_SOL=0.001
```

## Funded PumpPortal Data Wallet For Launch Scanner Time Series

Metered launch data mode is the canonical safe path for real Pump.fun
price-action ticks. It keeps free PumpPortal `subscribeNewToken` and
`subscribeMigration` discovery running, then selects a small capped set of
launch mints for PumpPortal `subscribeTokenTrade` only. Those token-trade
messages feed launch momentum windows, live cards, paper entry signals, and the
paper portfolio mark-price path.

This wallet pays only for PumpPortal metered data messages. AXI does not use it
for live trading, does not store private keys, does not sign transactions, does
not call PumpPortal Lightning execution, does not call the PumpPortal Local
Transaction API, does not call Jupiter, and does not subscribe to
`subscribeAccountTrade` in this mode. The PumpPortal API key is backend-only.
The dashboard can show the public funding address, balance, and configured
booleans, but never displays the API key.

PumpPortal's published metered data price used by AXI's estimator is
`0.01 SOL` per `10,000` messages. Start with small caps.

### Runtime ownership and local controls

The runtime has one subscription-policy owner. `LaunchScannerService` performs
free discovery and launch scoring, `ActualDataService` adapts the single
PumpPortal token-trade transport, and `MeteredLaunchDataService` decides which
mints are tracked and applies all metered caps. The canonical mutation route is
`/metered-launch-data/track`; the older `/actual-data/subscribe`,
`/launch/track`, and `/live/trade-tracking/track` mutations return `410` and
cannot bypass the metered policy.

`GET /runtime/contracts` publishes this ownership map and reports safe-default
configuration drift. `GET /runtime/operator-actions` exposes sanitized local
mutation audit records. State-changing API requests are accepted only from the
local machine and, when a browser sends an Origin header, from
`API_ALLOWED_ORIGINS`. The API binds to `127.0.0.1` by default. A paid-data ACK
belongs to one process session and is cleared by stop, shutdown, budget failure,
or restart.

### Coverage and capacity instrumentation

`@axi/capacity-model` turns current-session observations into a deterministic
coverage report without starting a feed or changing which mints are tracked.
It combines the free discovery launch rate, metered message rate, configured
initial observation window, concurrent slots, protected slots, and session
caps. The dashboard reports observed initial-window coverage, required versus
available newest-token slots, projected messages per second, and projected SOL
cost per hour. An empty launch sample is shown as `NO SAMPLE`, not as full
coverage.

The model uses these relationships:

```text
required initial slots = launches/second * initial observation seconds
coverage ratio = available newest slot-seconds / required slot-seconds
projected SOL cost = projected messages * (0.01 SOL / 10,000 messages)
```

The scenario matrix evaluates launch intervals of 30, 10, and 5 seconds against
quiet, average, and viral per-mint message rates. The capacity model itself is
read-only. `schedulerMutationApplied` becomes `true` only after the separate
rolling scheduler actually changes a current-session tracking subscription.

Capacity endpoints:

- `GET /runtime/capacity`
- `POST /runtime/capacity/snapshot`
- `GET /runtime/capacity/snapshots`

Example `.env.local`:

```bash
PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=<PUBLIC_FUNDING_ADDRESS>
PUMPPORTAL_DATA_API_KEY=<PUMPPORTAL_DATA_API_KEY>
SOLANA_RPC_HTTP=<RPC_HTTP_URL>

METERED_LAUNCH_DATA_CONTROLS_ENABLED=true
METERED_LAUNCH_DATA_ENABLED=true
METERED_LAUNCH_DATA_START_ACTIVE=false
METERED_LAUNCH_DATA_REQUIRE_UI_ACK=true
METERED_LAUNCH_DATA_ACK_COST=false
METERED_LAUNCH_DATA_MODE=newest
ROLLING_TRACKER_ENABLED=true
ROLLING_TRACKER_RESERVED_NEWEST_SLOTS=1
ROLLING_TRACKER_MAX_PROTECTED_MINTS=2
ROLLING_TRACKER_QUEUE_LIMIT=50
ROLLING_TRACKER_QUEUE_MAX_AGE_MS=30000
METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS=3
METERED_LAUNCH_DATA_INITIAL_TRACK_MS=30000
METERED_LAUNCH_DATA_EXTENDED_TRACK_MS=300000
METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT=250
METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION=1000
METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL=0.001
METERED_LAUNCH_DATA_MAX_UI_SESSION_COST_SOL=0.001
ROLLING_TRACKER_MIN_SCORE_PROTECT=65
ROLLING_TRACKER_MIN_SCORE_RIP=80
ROLLING_TRACKER_PROTECTED_MAX_AGE_MS=900000
ROLLING_TRACKER_STALE_NO_TRADES_MS=30000
PUMPPORTAL_TOKEN_TRADES_ENABLED=true
PUMPPORTAL_TOKEN_TRADES_ACK_METERED=false
```

### Rolling newest-token scheduler

`@axi/tracking-scheduler` is the deterministic owner of automatic slot
allocation. Every eligible discovery reaches the scheduler even when capacity
is full. In `newest` mode, the default three-slot policy reserves one slot from
soft protection, honors at most two HOT/RIPPING/score/migration protections,
and preempts the weakest eviction-eligible mint without requiring the new mint
to have a higher score. Hard rejects, maximum-age mints, and stale zero-trade
subscriptions are evicted before active weak mints.

Open paper positions and future live positions are absolute protections from
scheduler preemption; hard per-mint, tracking-age, session event, and session
cost caps still apply. If every slot has an absolute position, the newest
candidate enters a bounded, current-session-only queue instead of displacing a
position. The queue keeps the latest 50 candidates for at most 30 seconds by
default and automatically reconsiders the newest queued candidate when a slot
opens. Repeated migration discovery for an already tracked mint keeps the
existing subscription rather than restarting its observation window.

Scheduler state and recent decisions are read-only at:

- `GET /runtime/scheduler`
- `GET /runtime/scheduler/decisions`

All subscription mutations still pass through `MeteredLaunchDataService`, so
the UI ACK, wallet readiness, concurrent limit, per-mint event cap, session
event cap, and SOL cost cap remain mandatory. This uses only PumpPortal
`subscribeTokenTrade` data and does not trade, sign, or call account-trade
streams.

Safe local setup:

```bash
pnpm setup:pumpportal-data-env
```

Then edit `.env.local` and fill only these user-specific values:

```bash
PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=<PUBLIC_FUNDING_ADDRESS>
PUMPPORTAL_DATA_API_KEY=<PUMPPORTAL_DATA_API_KEY>
SOLANA_RPC_HTTP=<RPC_HTTP_URL>
```

Do not paste a PumpPortal private key, seed phrase, mnemonic, or wallet secret
into AXI. Verify the local file without printing secret values:

```bash
pnpm verify:pumpportal-data-env
pnpm smoke:pumpportal-metered-config
```

Optional read-only balance check:

```bash
pnpm check:pumpportal-data-wallet
```

Start:

```bash
pnpm axi:restart
```

Then use the dashboard `Arm Metered` dialog and `Start Metered` button when you
want capped `subscribeTokenTrade` price action.

Endpoints:

- `GET /metered-launch-data/status`
- `GET /metered-launch-data/tracked`
- `GET /metered-launch-data/events`
- `GET /metered-launch-data/cost`
- `POST /metered-launch-data/track`
- `DELETE /metered-launch-data/track/:mint`
- `POST /metered-launch-data/evaluate`

CLI helpers:

```bash
pnpm --filter @axi/api metered-launch-data:status
pnpm --filter @axi/api metered-launch-data:cost -- --events 10000
pnpm --filter @axi/api metered-launch-data:simulate -- --fixture strong-ripper
```

Launch scanner endpoints:

- `GET /launch/status`
- `GET /launch/cards`
- `GET /launch/candidates`
- `GET /launch/candidates/:mint`
- `GET /launch/scores`
- `GET /launch/tracked`
- `POST /launch/evaluate`
- `POST /launch/track`
- `DELETE /launch/track/:mint`
- `GET /launch/cost`

CLI helpers:

```bash
pnpm --filter @axi/api launch:status
pnpm --filter @axi/api launch:cost -- --tokens-per-hour 500 --avg-events-per-token 20
pnpm --filter @axi/api launch:simulate -- --fixture strong-ripper
```

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
pipeline and exposes the indexer state through `/indexer/*`. Usable trades are
deduplicated by normalized event ID and assigned by event time to canonical
one-second buckets. The engine retains at least five minutes in memory, handles
bounded out-of-order events deterministically, materializes zero-activity gaps
with carried prices, and exposes 1s/5s/10s/30s/60s/2m/5m windows. Actual buckets
are upserted into SQLite for inspection and local replay; synthetic gap buckets
are query-time views and are not persisted. Canonical raw derivatives are
computed across 1s/5s/10s/30s/60s/2m/5m windows with explicit availability,
sample count, timestamp span, units, and reason codes. Flow velocity is the
window total divided by window seconds; flow acceleration compares equal
half-window rates. Price derivatives use actual event-time spans and
non-uniform finite differences. The existing
`/ui/live-token-cards` dashboard endpoint keeps its current response source by
default. Set `API_INDEXER_PREFER_LIVE_STATE_CARDS=true` only when testing the
new live-state card adapter.

Indexer endpoints:

- `GET /indexer/status`
- `GET /indexer/events/recent`
- `GET /indexer/live-state`
- `GET /indexer/live-cards`
- `GET /indexer/timeseries/:mint`
- `GET /indexer/timeseries/:mint/history`
- `GET /indexer/derivatives/:mint`
- `GET /runtime/timeseries`
- `GET /runtime/derivatives`
- `GET /runtime/derivative-strength`
- `GET /runtime/signal-calibration`
- `POST /runtime/signal-calibration/evaluate`
- `GET /runtime/session-capture`
- `POST /runtime/session-capture/start`
- `POST /runtime/session-capture/stop`
- `GET /runtime/session-capture/sessions`
- `GET /runtime/session-capture/sessions/:sessionId`
- `GET /runtime/session-capture/sessions/:sessionId/observations`
- `POST /runtime/session-capture/sessions/:sessionId/materialize`
- `GET /runtime/session-capture/sessions/:sessionId/export?format=json|jsonl|csv`
- `GET /runtime/paper-strategy-evaluation`
- `POST /runtime/paper-strategy-evaluation/evaluate`
- `GET /runtime/paper-strategy-evaluation/evaluations`
- `GET /runtime/paper-strategy-evaluation/evaluations/:evaluationId`
- `GET /runtime/paper-strategy-evaluation/evaluations/:evaluationId/export`
- `GET /runtime/paper-lifecycle-validation`
- `POST /runtime/paper-lifecycle-validation/evaluate`
- `GET /runtime/paper-lifecycle-validation/validations`
- `GET /runtime/paper-lifecycle-validation/validations/:validationId`
- `GET /runtime/paper-lifecycle-validation/validations/:validationId/export`
- `GET /runtime/paper-exit-policy`
- `GET /runtime/paper-exit-policy/evaluations`
- `GET /runtime/paper-exit-policy/evaluations/:evaluationId`
- `GET /runtime/paper-exit-policy/evaluations/:evaluationId/export`
- `GET /indexer/stream/status`
- `GET /indexer/stream/real-readiness`
- `GET /indexer/stream/config`
- `POST /indexer/stream/build-subscription`
- `GET /indexer/stream/recent`
- `POST /indexer/stream/mock/publish-fixture`

Indexer app commands:

```bash
pnpm --filter @axi/indexer dev
pnpm --filter @axi/indexer smoke
pnpm --filter @axi/indexer smoke:pumpfun
pnpm --filter @axi/indexer smoke:managed-stream
pnpm --filter @axi/indexer stream:status
pnpm --filter @axi/indexer stream:config
pnpm --filter @axi/indexer stream:build-subscription -- --provider yellowstone
pnpm --filter @axi/indexer stream:build-subscription -- --provider laserstream
pnpm --filter @axi/indexer stream:connect:check
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
pnpm --filter @axi/indexer stream:config
pnpm --filter @axi/indexer stream:build-subscription -- --provider yellowstone
pnpm --filter @axi/indexer stream:build-subscription -- --provider laserstream --profile minimal_healthcheck
pnpm --filter @axi/indexer stream:connect:check
```

Managed stream API endpoints:

- `GET /indexer/stream/status`
- `GET /indexer/stream/real-readiness`
- `GET /indexer/stream/config`
- `POST /indexer/stream/build-subscription`
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
MANAGED_STREAM_API_KEY=
MANAGED_STREAM_ALLOW_REAL_CONNECTION=false
MANAGED_STREAM_REAL_PROVIDER=laserstream
MANAGED_STREAM_REAL_CONNECTION_ACK=false
YELLOWSTONE_GRPC_URL=
YELLOWSTONE_GRPC_TOKEN=
LASERSTREAM_GRPC_URL=
LASERSTREAM_API_KEY=
LASERSTREAM_ENABLED=false
PUMPFUN_PROGRAM_ID=
PUMPSWAP_PROGRAM_ID=
```

Roadmap:

1. Add opt-in real provider connection using one provider selected by the user.
2. Connect to Yellowstone/LaserStream in opt-in dev mode.
3. Filter for Pump.fun/PumpSwap program transactions.
4. Route live envelopes through Pump.fun decoder.
5. Write raw events/ticks to ClickHouse.
6. Write live token state to Redis.
7. Switch dashboard cards to indexer-backed live state.

## Managed Stream Client Skeleton

Branch `dev/managed-stream-client-skeleton` adds
`@axi/managed-stream-clients`, a disabled-by-default client layer for managed
Solana stream providers. It includes Yellowstone and LaserStream client
skeletons, sanitized config validation, subscription request preview builders,
subscription profiles, and an injected mock transport for tests.

This package does not install provider SDKs by default and does not open network
connections unless the real LaserStream gates are explicitly enabled.
`yellowstone` and the skeleton `laserstream` path report `not_implemented`
without an injected transport or SDK boundary. Mock transport tests can exercise
connect/send/message handling without using a real provider. Endpoints, auth
tokens, API keys, and URL query secrets are masked in status and config output.

Subscription previews are available without connecting:

```bash
pnpm --filter @axi/indexer stream:config
pnpm --filter @axi/indexer stream:build-subscription -- --provider yellowstone --profile pumpfun_program_transactions --include-program FakeProgram111111111111111111111111111111111
pnpm --filter @axi/indexer stream:build-subscription -- --provider laserstream --profile minimal_healthcheck
curl http://localhost:8787/indexer/stream/config
curl -X POST http://localhost:8787/indexer/stream/build-subscription \
  -H 'content-type: application/json' \
  -d '{"provider":"yellowstone","profile":"minimal_healthcheck"}'
```

Supported profiles:

- `pumpfun_program_transactions`
- `pumpfun_and_pumpswap_transactions`
- `laserstream_pumpfun_transactions`
- `yellowstone_pumpfun_transactions`
- `watched_addresses`
- `minimal_healthcheck`

Pump.fun and PumpSwap program IDs are not hard-coded here. Supply explicit
program or watched account IDs when previewing those profiles. Missing IDs are
reported with `STREAM_PROFILE_PLACEHOLDER` and
`STREAM_PROFILE_REQUIRES_PROGRAM_IDS`.

The dashboard DATA tab shows the managed stream client kind, enabled/configured
state, auth configured state, masked endpoint, subscription summary,
Yellowstone/LaserStream status, and the explicit real stream label.

## Opt-in LaserStream Connection

Branch `dev/laserstream-real-connection-opt-in` adds a real LaserStream client
boundary that remains blocked by default. It only attempts a network connection
when every real gate is explicitly set:

```text
MANAGED_STREAM_ALLOW_REAL_CONNECTION=true
MANAGED_STREAM_REAL_CONNECTION_ACK=true
MANAGED_STREAM_REAL_PROVIDER=laserstream
LASERSTREAM_ENABLED=true
LASERSTREAM_GRPC_URL=<helius-laserstream-grpc-url>
LASERSTREAM_API_KEY=<helius-api-key>
```

Preflight is safe and does not connect:

```bash
MANAGED_STREAM_ALLOW_REAL_CONNECTION=true \
MANAGED_STREAM_REAL_CONNECTION_ACK=true \
MANAGED_STREAM_REAL_PROVIDER=laserstream \
LASERSTREAM_ENABLED=true \
LASERSTREAM_GRPC_URL=https://example.invalid \
LASERSTREAM_API_KEY=example \
PUMPFUN_PROGRAM_ID=YourPumpfunProgramIdHere \
pnpm --filter @axi/indexer stream:connect:check
```

Real connection template:

```bash
MANAGED_STREAM_ALLOW_REAL_CONNECTION=true \
MANAGED_STREAM_REAL_CONNECTION_ACK=true \
MANAGED_STREAM_REAL_PROVIDER=laserstream \
MANAGED_STREAM_PROVIDER=laserstream \
LASERSTREAM_ENABLED=true \
LASERSTREAM_GRPC_URL="$LASERSTREAM_GRPC_URL" \
LASERSTREAM_API_KEY="$LASERSTREAM_API_KEY" \
LASERSTREAM_MAX_RUNTIME_MS=60000 \
LASERSTREAM_MAX_MESSAGES_PER_SESSION=100 \
PUMPFUN_PROGRAM_ID="$PUMPFUN_PROGRAM_ID" \
pnpm --filter @axi/indexer stream:connect:laserstream
```

Keep credentials in `.env.local` or another gitignored local environment file.
Do not paste secrets into commits, README updates, dashboard screenshots, or
issue text. Provider streams can incur costs, so start with low
`LASERSTREAM_MAX_RUNTIME_MS` and `LASERSTREAM_MAX_MESSAGES_PER_SESSION` values.

The client uses the official LaserStream SDK boundary when available. If the
SDK is not installed or the adapter cannot load it, the command reports
`SDK_NOT_INSTALLED_OR_NOT_IMPLEMENTED` without falling back to another network
path. This project still does not trade, sign, load wallets, call Jupiter,
call PumpPortal trading/Lightning APIs, use Axiom private APIs, or scrape Axiom.

Readiness is also exposed through:

- `GET /indexer/stream/status`
- `GET /indexer/stream/real-readiness`

The dashboard DATA tab shows `REAL MANAGED STREAM: DISABLED`, `READY`,
`CONNECTED`, or `BLOCKED`, plus gates, message count, last message time, and
reason codes. It has no connect button and never displays API keys.

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
`actual_data_subscriptions`, `actual_data_sessions`, `launch_candidates`,
`launch_trade_samples`, `launch_score_snapshots`, `launch_tracking_events`,
`launch_tracking_sessions`, `token_identities`, `token_metadata_fetches`,
`lightning_trade_plans`,
`pumpportal_wallet_status_snapshots`, `watched_wallets`,
`watched_wallet_trade_events`, `exit_rules`, `exit_signals`, `paper_orders`,
`paper_positions`, `paper_portfolio_orders`, `paper_portfolio_fills`,
`paper_portfolio_positions`, and `paper_portfolio_snapshots`.

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
`—`, and include `HOLDER_TIME_SERIES_UNAVAILABLE`.

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
pnpm axi:doctor
pnpm axi:restart
pnpm axi:logs
pnpm axi:stop
pnpm live:tokens
pnpm setup:pumpportal-data-env
pnpm verify:pumpportal-data-env
pnpm smoke:pumpportal-metered-config
pnpm check:pumpportal-data-wallet
pnpm live:tokens:stop
pnpm live:tokens:logs
```

Recommended local workflow:

- `pnpm axi:doctor` diagnoses branch/dirty state, `.env.local` safety, port
  owners, API health, dashboard reachability, data-wallet status, and metered
  launch-data status without printing secrets.
- `pnpm axi:restart` stops recorded local AXI processes, rebuilds, launches the
  API and dashboard, writes `.tmp/axi-api.log`, `.tmp/axi-dashboard.log`, and
  `.tmp/axi-dev-pids.json`, then waits for the API/dashboard. It loads
  PumpPortal data-wallet/API readiness and exposes dashboard metered controls,
  but forces command ACKs, auto token-trade subscriptions, and start-active mode
  off. Use `Arm Metered`, then `Start Metered`, before any selected
  `subscribeTokenTrade` tracking can start.
- `pnpm axi:restart:metered` remains an advanced validation helper. It verifies
  `.env.local`, rebuilds, and launches with the same UI-controlled metered
  state: configured but unarmed until the dashboard session ACK and Start
  button run. It never enables trading.
- `pnpm axi:logs` prints recent API/dashboard logs.
- `pnpm axi:stop` stops only PIDs recorded in `.tmp/axi-dev-pids.json`. If a
  repo-local process owns a port but is not in the PID file, it tells you to run
  `pnpm axi:stop --adopt-repo-processes`. Unknown port owners are never killed
  silently.

The restart script only stops PIDs recorded in `.tmp/axi-dev-pids.json`. If a
port is already used by an unknown process, it reports that instead of killing
unrelated processes.

## Live Tokens

Start the normal live token runtime:

```bash
pnpm live:tokens
```

This launches the API and dashboard with `DATA_FEED_MODE=live`,
`DATA_FEED=pumpportal`, `AXI_RUNTIME_MODE=pumpportal_first`, PumpPortal
`subscribeNewToken` and `subscribeMigration` enabled, runtime mock data
disabled, paper auto-ordering disabled, and metered token trades prepared but
inactive.

Prepare the same runtime after setting the data-wallet/API values in
`.env.local`:

```bash
pnpm setup:pumpportal-data-env
pnpm verify:pumpportal-data-env
pnpm axi:restart
```

The launcher refuses private-key, seed-phrase, or mnemonic env vars. It does not
set the API key for you, forces command ACKs off at process launch, and requires
a browser-session `Arm Metered` action before `Start Metered` can begin selected
token-trade tracking. It also forces live trading, Lightning execution,
account-trade streams, and paper auto-orders off.

### Runtime Control Panel

The header and DATA tab include `PUMPFUN / PUMPPORTAL CONTROL` surfaces for
local development:

- Start, stop, or restart PumpPortal live discovery
  (`subscribeNewToken` + `subscribeMigration`).
- Refresh PumpPortal data-wallet and future trading-wallet readiness using
  read-only RPC.
- Arm metered launch-data for the current browser/API session with cost and
  event caps.
- Start or stop metered launch price action (`subscribeTokenTrade`) only when
  backend gates pass.
- See live discovery state, metered tracking state, event usage, estimated cost,
  cost budget remaining, public data-wallet/trading-wallet addresses, SOL
  balances, API-key configured booleans, API process uptime, paper-only state,
  and trading-disabled state.

The Start metered price-action button is disabled when the backend reports
blockers such as ACK missing, API key missing, wallet missing, wallet low,
budget reached, or live discovery offline. Balance unknown is a warning.
Dashboard controls do not bypass backend gates and cannot enable
`subscribeAccountTrade`, Lightning execution,
Local Transaction API calls, Jupiter swaps, signing, transaction sending, or
live orders. API keys and private keys are never returned to the dashboard.

Runtime-control API endpoints:

- `GET /runtime/status`
- `GET /runtime/diagnostics`
- `POST /runtime/live-discovery/start`
- `POST /runtime/live-discovery/stop`
- `POST /runtime/live-discovery/restart`
- `POST /runtime/metered-launch-data/ack-session`
- `POST /runtime/metered-launch-data/clear-session-ack`
- `POST /runtime/metered-launch-data/start`
- `POST /runtime/metered-launch-data/stop`
- `POST /runtime/metered-launch-data/restart`
- `POST /runtime/data-wallet/refresh`
- `POST /runtime/trading-wallet/refresh`

POST control endpoints are local/dev only and return `403` for non-local
requests when the request address can be identified.

If the dashboard cannot reach the API, it keeps rendering and shows `API
OFFLINE` with:

```bash
pnpm axi:doctor
pnpm axi:restart
```

Troubleshooting quick map:

- App not loading: run `pnpm axi:doctor`, then `pnpm axi:restart`.
- Stale port owner: run `pnpm axi:doctor`; use
  `pnpm axi:stop --adopt-repo-processes` only for repo-local owners.
- `.env.local` missing: run `pnpm setup:pumpportal-data-env`.
- API key missing: fill `PUMPPORTAL_DATA_API_KEY` in `.env.local`.
- Data wallet low: fund only the public data-wallet address with a small amount
  of SOL.
- Metered ACK missing: use the dashboard `Arm Metered` dialog to acknowledge a
  capped in-memory browser session. Normal `pnpm axi:restart` does not require
  or persist command ACKs.
- PumpPortal connected but no tracked mints: check DATA tab blockers and
  `GET /runtime/status`; metered mode may be stopped, blocked, or waiting for
  qualifying launches.

Manual API launch:

```bash
DATA_FEED_MODE=live \
DATA_FEED=pumpportal \
AXI_RUNTIME_MODE=pumpportal_first \
PUMPPORTAL_LIVE_DISCOVERY_ENABLED=true \
PUMPPORTAL_SUBSCRIBE_NEW_TOKEN=true \
PUMPPORTAL_SUBSCRIBE_MIGRATION=true \
ALLOW_MOCK_DATA=false \
MOCK_FEED_ENABLED=false \
pnpm --filter @axi/api dev
```

This uses PumpPortal new-token and migration streams. It does not use metered
token trades, does not trade, does not sign, does not require a wallet, does not
use Axiom, and does not show mock tokens in the LIVE TOKENS panel.
Launch candidates appear immediately from discovery events; price-action fields
remain explicitly marked unavailable until selected metered token trades are
enabled.

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

The dashboard is scanner-first. Its default Scanner tab renders current-session
momentum rows from:

```text
GET /ui/momentum-rows
GET /ui/momentum-diagnostics
```

Each row includes identity, live feed status, launch phase/score, market fields,
participant flow, derivative strength, strategy calculations, risk flags, paper
position/PnL, data quality, and expandable audit fields. Fields that are not
available from the current data source remain `null` in the API, render as `—`
in the UI, and are listed in `missingCriticalFields`, `unavailableFields`,
`staleFields`, and reason codes. The row endpoint does not include historical
mock/replay rows.
`GET /ui/live-token-cards` remains available as the legacy/debug card view
model.

Dashboard tabs:

- Scanner: compact one-row-per-token momentum scanner with search, sort,
  filters, real-only, compact mode, and row audit expansion.
- Signals: read-only strategy status plus signal explanation and raw signal
  rows.
- Portfolio: simulated cash, equity, positions, paper orders/fills, PnL, fees,
  and best/worst closed paper trades.
- Metrics: rolling windows, velocity, acceleration, sample counts, and metric
  debug values.
- Risk: risk levels, hard rejects, authority flags, holder concentration, and
  risk reasons.
- Exit: watched-wallet paper exit status, metered account-trade gates, watched
  wallets, exit rules, observed wallet trades, and paper exit signals.
- Data: scanner diagnostics, PumpPortal launch tracking status, budget,
  tracked mints, feed/live
  feed state, wallet readiness, managed stream status as secondary future
  infrastructure, market data, chain, and token identity health.
- Debug: persisted counts, live feed rows, and verification/debug
  rows.

The Scanner tab can sort by newest, launch score, 10-second volume, volume
velocity, price velocity, unique buyers, buy/sell ratio, risk, or PnL. It can
filter all/watch/hot/ripping/rejected/trade-tracked/discovery-only/missing
critical rows, filter to real data only, and search by symbol, name, or mint. It
never shows buy/sell buttons, wallet controls, signing controls, or live
execution controls.

Displayed calculations include first and second derivatives for volume, price,
buyers, trades, and buy pressure when usable rolling trade samples exist. First
derivatives require two samples; acceleration requires three. Holder,
market-cap, and liquidity derivatives are shown only when real time series are
available; otherwise they render as `—` with explicit unavailable reason codes.

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
This token-trade path does not use `subscribeAccountTrade`; watched-wallet
account-trade observation is a separate exit-strategy-only feature with its own
disabled-by-default gates. PumpPortal trading APIs, wallet loading, private-key
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

Launch tracking is the PumpPortal-first scanner path for selected new launches.
It uses the same guarded token-trade stream but has its own acknowledgement,
cost cap, concurrent-mint cap, initial/extended windows, and score thresholds:

```bash
DATA_FEED_MODE=live \
DATA_FEED=pumpportal \
AXI_RUNTIME_MODE=pumpportal_first \
PUMPPORTAL_DATA_API_KEY=... \
PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=<PUBLIC_FUNDING_ADDRESS> \
SOLANA_RPC_HTTP=<RPC_HTTP_URL> \
PUMPPORTAL_LAUNCH_TRACKING_ENABLED=true \
PUMPPORTAL_LAUNCH_TRACKING_ACK_METERED=true \
PUMPPORTAL_LAUNCH_TRACKING_MODE=manual \
PUMPPORTAL_LAUNCH_TRACKING_MAX_CONCURRENT=3 \
PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_SESSION=1000 \
PUMPPORTAL_LAUNCH_TRACKING_MAX_SESSION_COST_SOL=0.001 \
pnpm local:restart
```

Track one selected launch mint after the server is running:

```bash
curl -X POST http://localhost:8787/launch/track \
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

Safe local setup:

```bash
pnpm setup:pumpportal-data-env
```

Then edit `.env.local` and paste only:

```bash
PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=<PUBLIC_FUNDING_ADDRESS>
PUMPPORTAL_DATA_API_KEY=<PUMPPORTAL_DATA_API_KEY>
SOLANA_RPC_HTTP=<RPC_HTTP_URL>
```

Do not paste a PumpPortal private key, seed phrase, mnemonic, or wallet secret.
`.env.local` is gitignored; `.env.pumpportal-data.example` is placeholder-only
and safe to commit.

Recommended flow:

1. Create a PumpPortal wallet/API key on PumpPortal.
2. Save the private key yourself outside AXI.
3. Run `pnpm setup:pumpportal-data-env`.
4. Add only the public key, API key, and RPC URL to `.env.local`.
5. Run `pnpm verify:pumpportal-data-env`.
6. Fund the public key with a small amount of SOL.
7. Optionally run `pnpm check:pumpportal-data-wallet`.
8. Start with `pnpm axi:restart`, then use `Arm Metered` and `Start Metered` in
   the dashboard when you want capped price action.
9. Check `/pumpportal/data-wallet/status`.

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
- `GET /launch/status`
- `GET /launch/cards`
- `GET /launch/candidates`
- `GET /launch/candidates/:mint`
- `GET /launch/scores`
- `GET /launch/tracked`
- `POST /launch/evaluate`
- `POST /launch/track`
- `DELETE /launch/track/:mint`
- `GET /launch/cost`
- `GET /indexer/status`
- `GET /indexer/events/recent`
- `GET /indexer/live-state`
- `GET /indexer/live-cards`
- `GET /indexer/timeseries/:mint`
- `GET /indexer/stream/status`
- `GET /indexer/stream/config`
- `POST /indexer/stream/build-subscription`
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
- `GET /paper-portfolio/status`
- `GET /paper-portfolio/snapshot`
- `GET /paper-portfolio/positions`
- `GET /paper-portfolio/positions/:mint`
- `GET /paper-portfolio/orders`
- `GET /paper-portfolio/fills`
- `GET /paper-portfolio/performance`
- `POST /paper-portfolio/evaluate-entries`
- `POST /paper-portfolio/evaluate-exits`
- `POST /paper-portfolio/manual-entry`
- `POST /paper-portfolio/manual-exit`
- `POST /paper-portfolio/backtest`
- `GET /runtime/paper-strategy-evaluation`
- `POST /runtime/paper-strategy-evaluation/evaluate`
- `GET /runtime/paper-strategy-evaluation/evaluations`
- `GET /runtime/paper-strategy-evaluation/evaluations/:evaluationId`
- `GET /runtime/paper-strategy-evaluation/evaluations/:evaluationId/export`
- `GET /runtime/paper-lifecycle-validation`
- `POST /runtime/paper-lifecycle-validation/evaluate`
- `GET /runtime/paper-lifecycle-validation/validations`
- `GET /runtime/paper-lifecycle-validation/validations/:validationId`
- `GET /runtime/paper-lifecycle-validation/validations/:validationId/export`
- `GET /exit/status`
- `GET /exit/wallets`
- `POST /exit/wallets`
- `DELETE /exit/wallets/:address`
- `GET /exit/rules`
- `POST /exit/rules`
- `PATCH /exit/rules/:ruleId`
- `DELETE /exit/rules/:ruleId`
- `GET /exit/events`
- `GET /exit/events/wallet/:address`
- `GET /exit/events/mint/:mint`
- `GET /exit/signals`
- `GET /exit/signals/:mint`
- `POST /exit/evaluate`
- `POST /exit/simulate`
- `GET /exit/cost`
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
live tokens, PumpPortal launch momentum snapshots, identity summaries, rolling
metrics, candidate decisions, risk snapshots, actual-data summaries, market
observations, and chain verification summaries. Cards include a
data-completeness model, launch phase/score/windows, trade-tracking state,
latest trade time, trade count, watched-wallet paper exit summary, and optional
enrichment fields. Unknown data stays `null`; the dashboard renders it as `—`.

`GET /ui/momentum-rows` is the primary dashboard scanner view model. It returns
compact `MomentumScannerRow` objects for current-session tokens only, excluding
historical mock/replay rows. It preserves true zeros, returns `null` for missing
fields, gates derivatives behind enough trade samples, includes source-aware
field-diagnostic reason codes, and exposes an inline `sparkline` object built
from trade samples or successive curve marks. PumpPortal `marketCapSol` payload
values are preserved without inventing USD conversion, and
`curve.curveLiquiditySol` stays labeled as curve liquidity rather than DEX
liquidity.

`GET /ui/momentum-diagnostics` summarizes scanner data coverage: tokens with
price, volume, market cap, liquidity, trade samples, derivatives, risk, holder
data, paper positions, curve price, trade price, curve liquidity, DEX liquidity,
SOL/USD market cap, real trade volume, and derived curve data. It also returns
unavailable/missing field counts, top missing/unavailable reasons, data-source
readiness, reason codes, and recommended next actions.

`GET /launch/status` reports PumpPortal-first discovery and launch-tracking
gates. `GET /launch/cards`, `/launch/candidates`, and `/launch/scores` expose
current-session launch scanner state. `POST /launch/track` and
`DELETE /launch/track/:mint` manage selected metered token-trade tracking only
after all launch tracking, actual-data, API-key, data-wallet, and budget gates
pass. `GET /launch/cost` estimates metered tracking cost from token/hour and
events/token assumptions.

`GET /exit/status` reports watched-wallet paper exit gates, wallet/rule/event
counts, estimated metered cost, PumpPortal account-trade acknowledgement state,
data-wallet readiness, and `liveExecutionDisabled: true`. `/exit/wallets`,
`/exit/rules`, `/exit/events`, and `/exit/signals` expose the configured
watched wallets, paper exit rules, observed wallet trades, and paper exit
signals. `POST /exit/evaluate` only evaluates open paper positions against
recent watched-wallet events. `POST /exit/simulate` is a pure local simulation
path with no network and no persistence.

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
both acknowledgement gates and all caps pass. This live-card tracking flow does
not subscribe to account trades and has no trading endpoints.

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

The dashboard uses a modern dark scanner UI with PAPER mode kept visible in the
top control header. It is organized into Scanner, Signals, Portfolio, Metrics,
Risk, Exit, Data, and Debug tabs. The header can locally start/stop/restart
PumpPortal live discovery, request gated metered price action only when backend
gates pass, stop metered tracking, refresh the data-wallet balance, and open a
diagnostics drawer. It shows only public wallet/address data and configured
booleans; API keys are never rendered.

The Scanner tab is the default and renders one compact Axiom-style row per live
token backed by `/ui/momentum-rows`: thumbnail, pair metadata, sparkline, market
cap, curve/pool liquidity, volume, transactions/flow, token risk, launch score,
AXI signal/action, and paper position/PnL. Rows expand into a compact details
shelf with strategy components, derivatives, metric windows, risk and holder
data, data audit, and paper position / exit-signal details.
Unknown/unavailable values render as `—` with reason-code audit visibility from
`/ui/momentum-diagnostics`. The Data tab still includes deeper scanner
diagnostics and PumpPortal data-wallet panels. The dashboard has no wallet
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

## Discovery Coverage Instrumentation

The PumpPortal discovery path records sanitized, versioned
`discovery-coverage-v1` evidence from the first locally received WebSocket
frame through parser classification, normalization, deduplication, the API
queue, durable processing, token identity, live-token state, launch candidate
and score persistence, scanner projection, and local WebSocket broadcast. Raw
payload bodies, provider URLs, headers, credentials, and private configuration
are not stored in the coverage tables or returned by the coverage endpoints.

Local ingress reconciles these identities:

```text
raw_received = parse_failed + recognized_create + recognized_migration
             + recognized_non_discovery + unknown_payload
raw_received = parse_succeeded + parse_failed
parse_succeeded = recognized_create + recognized_migration
                + recognized_non_discovery + unknown_payload
recognized_discovery = normalization_succeeded + normalization_rejected
normalization_succeeded = pipeline_completed + duplicate + rejected
                        + failed_or_dropped
queue_accepted = queue_committed + queue_failed
```

`pipeline_completed` requires identity, live token, launch candidate, launch
score, persistence, and scanner projection stages. A duplicate never enters the
API queue. A transaction failure gives every event in the failed batch, plus
every event cleared from the pending queue, an explicit durable
`failed_or_dropped` outcome. Create and migration keys include their distinct
event type, so one mint can retain one identity while producing separate create
and migration discovery events.

Latency evidence uses monotonic time for in-process durations and wall time for
persisted/provider comparisons. Summaries include available and unavailable
counts plus min/p50/p95/p99/max. Provider-to-receive remains unavailable when
the payload has no provider timestamp. The existing pipeline performs
downstream work inside its SQLite transaction, before the durable commit is
observable; therefore commit-to-downstream samples are reported as unavailable
rather than fabricated, while the corresponding transaction-start-to-stage
and receive-to-stage measurements remain available.

Reconnect evidence records attempts, disconnect duration, subscription replay,
and sanitized close classifications. PumpPortal exposes no launch sequence or
replay cursor in this integration, so a reconnect gap remains `UNPROVEN` even
when subscriptions were replayed. `LOCALLY_RECONCILED` only means AXI accounted
for every frame this process received. It does not prove PumpPortal delivered
every launch; upstream coverage remains `UNPROVEN` without an independent
comparator or provider sequence.

Read-only endpoints:

- `GET /runtime/discovery-coverage`
- `GET /runtime/discovery-coverage/events`
- `GET /runtime/discovery-coverage/sessions`
- `GET /runtime/discovery-coverage/sessions/:sessionId`

The Data tab shows the same counters, latency percentiles, residuals, and the
separate local/upstream verdicts. A panel-specific endpoint failure does not
mark the rest of the dashboard offline.

For a bounded free-discovery verification, first ensure AXI ports are free and
the normal preflight passes, then launch with every paid, account-trade, paper
entry/exit, and live-execution path explicitly off:

```bash
METERED_LAUNCH_DATA_ENABLED=false PUMPPORTAL_TOKEN_TRADES_ENABLED=false PUMPPORTAL_TOKEN_TRADES_ACK_METERED=false METERED_LAUNCH_DATA_ACK_COST=false EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED=false EXIT_STRATEGY_ACCOUNT_TRADES_ACK_METERED=false PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING=false PUMPPORTAL_LIGHTNING_MANUAL_ARMED=false PAPER_ENTRY_ENABLED=false PAPER_EXIT_ENABLED=false pnpm axi:launch
sleep 90
curl -sS -X POST http://127.0.0.1:8787/runtime/live-discovery/stop
curl -sS http://127.0.0.1:8787/runtime/discovery-coverage
pnpm axi:stop
```

Only free `subscribeNewToken` and migration discovery subscriptions are allowed
in that run. The instrumentation does not activate token trades, account
trades, paid managed streams, paper automation, signing, SOL spending, or live
execution.

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
- `@axi/derivatives`: deterministic, sample-gated event-time first and second
  derivatives with explicit units and unavailable-state diagnostics.
- `@axi/derivative-strength`: canonical hybrid absolute/robust same-age
  derivative normalization with confidence and adverse-direction diagnostics.
- `@axi/launch-momentum`: pure PumpPortal launch-window metrics, derivatives,
  scoring, reason codes, and simulation fixtures.
- `@axi/stream-core`: provider-agnostic managed Solana stream contracts,
  masking helpers, disabled provider, and not-implemented provider.
- `@axi/stream-mock`: deterministic mock managed stream provider backed by
  local Pump.fun fixtures.
- `@axi/managed-stream-adapter`: managed stream envelope router into Pump.fun
  decoding, normalized indexer events, event bus, live state, and timeseries.
- `@axi/managed-stream-clients`: disabled-by-default managed stream client
  skeletons, subscription previews, profile helpers, and mock transport tests.
- `@axi/token-identity`: local token identity normalization and source
  confidence helpers.
- `@axi/execution`: in-memory paper execution only.
- `@axi/exit-strategy`: pure deterministic watched-wallet signals plus the
  versioned multi-rule paper/replay exit policy and explicit precedence.
- `@axi/paper-portfolio`: pure simulated portfolio/PnL engine with fee,
  slippage, position history, and paper-only order/fill models.
- `@axi/paper-lifecycle-validation`: deterministic global-event-time lifecycle
  replay with shared portfolio constraints, realistic execution assumptions,
  immutable holdout reports, and fixed non-activating promotion gates.
- `@axi/paper-operations`: explicit restart-safe forward paper sessions,
  immutable observability evidence, cost enforcement, and evidence exports.
- `@axi/paper-forward-evaluation`: immutable multi-session evidence aggregation,
  statistical/operational promotion gates, and manual-review-only verdicts.
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

- `dev/discovery-coverage-instrumentation` adds local PumpPortal frame and
  pipeline reconciliation, latency/reconnect evidence, restart-safe SQLite
  sessions, read-only diagnostics endpoints, and the Data-tab coverage panel.

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
- `dev/dashboard-terminal-ui-pass` contains an older dashboard UI refinement.
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
- `dev/momentum-scanner-row-ui-data-audit` contains the modern row-based
  momentum scanner UI plus `/ui/momentum-rows` and `/ui/momentum-diagnostics`.
- `dev/axiom-style-momentum-scanner-ui` contains the Axiom-inspired scanner row
  v2, real-trade sparklines, source-aware missing reasons, SOL market-cap
  payload wiring, migration continuity, and adaptive tracking visibility.
- `dev/scanner-ui-v2-field-correctness` contains Scanner UI v3: compact row
  cards, curve-derived price/liquidity fields, normalized signal display,
  image URI safety, and richer `/ui/momentum-diagnostics` coverage.
- `dev/header-controls-axiom-card-scanner` contains Scanner UI v4: the
  interactive control header, live discovery and gated metered price-action
  controls, data-wallet balance/usage visibility, and cleaner compact
  Axiom-style token row/cards.
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
- `dev/managed-stream-client-skeleton` contains disabled-by-default
  Yellowstone/LaserStream client skeletons, sanitized config/status endpoints,
  subscription preview builders, profile helpers, and dashboard client status.
- `dev/laserstream-real-connection-opt-in` contains the hard-gated
  LaserStream real connection boundary, readiness endpoint, CLI preflight,
  short-run connect command, provider-specific Pump.fun profiles, and dashboard
  real-stream status fields.
- `dev/pumpportal-first-launch-scanner` contains the PumpPortal-first launch
  scanner, pure launch momentum package, launch storage tables, launch API/CLI,
  and dashboard launch-card status fields.
- `dev/watched-wallet-paper-exit-strategy` contains pure watched-wallet paper
  exit evaluation, gated PumpPortal account-trade observation, exit storage,
  API endpoints, dashboard EXIT tab, and local CLI helpers.

Direct Solana RPC verification and watched-address transaction ingestion exist,
and local market-data normalization and watch orchestration exist, but they are
read-only and disabled or conservative by default. This project still has no
wallet UI, no private-key loading, no live trading, no Solana transaction
signing, no transaction sending, no real risk-data provider, no DEX-specific
decoding, no full-market indexing, no active/default Geyser or gRPC runtime, no
default account-trade streams, no PumpPortal trading API usage, no Axiom private
API usage, and no Axiom scraping.
