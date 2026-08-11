# Trade-Data Coverage Operations

Phase 4C corrects the bounded PumpPortal trade-coverage path. It does not alter
tracking-scheduler policy, tune strategy thresholds, authorize a paid stream,
or enable trading.

## Admission and lifecycle

The command persists and verifies the parent coverage session before inserting
`track_requested`. All lifecycle writes pass through one idempotent append path
using `<session>:lifecycle:<event-type>` keys. Local reconciliation requires
the embedded and durable records to match, not merely have the same count.

Canonical admission is synchronous and per selected mint:

```text
OPEN -> STOP_REQUESTED -> EVIDENCE_ONLY -> FINALIZED
```

Slots 1–50 may enter the canonical pipeline. Reserving slot 50 closes
admission and requests unsubscribe exactly once. Later in-flight frames are
stored only as sanitized coverage evidence. They can increase the estimated
billable-message count, but cannot mutate PumpPortal business trades, metered
business events, buckets, rolling windows, derivatives, strengths, scores,
signals, scanner rows, calibration, or paper state.

The expected lifecycle is:

```text
track_requested
subscribe_sent
subscribe_acknowledged
active
first_trade_received
stop_requested
unsubscribe_sent
grace_started
unsubscribe_acknowledged
finalized
```

## Subscription-expiry ownership

Tracking expiry has two explicit owners. Ordinary runtime defaults to
`metered_service` and preserves stale-no-trades, initial/extended review,
scheduler, hard-reject, and normal untracking policy. The bounded coverage
validator selects `coverage_validator` for its one mint. In that mode the
metered service does not schedule its own initial, extended, or stale-no-trades
expiry timer, and its event/cost accounting does not directly untrack ahead of
the coverage boundary.

`TradeDataCoverageService.requestStop` is the authoritative idempotent
coordinator: it closes admission and persists `stop_requested` before calling
the validator-owned untrack path. That path clears tracked-mint timers and
emits provider unsubscribe. Provider acknowledgement remains optional; grace
and finalization remain command-owned. Normal runtime does not use this
coordinator and retains its 30-second zero-trade stale behavior.

The offline proof advances logical time through 29,999, 30,000, 30,001,
60,000, 89,999, and 90,000 ms without sleeping. Its service-owned control
separately proves the unchanged 30-second policy:

```bash
pnpm --filter @axi/api trade-data:coverage:lifecycle-check -- \
  --scenario zero-trade \
  --runtime-ms 90000 \
  --stale-no-trades-ms 30000 \
  --grace-ms 5000 \
  --json true

pnpm --filter @axi/api trade-data:coverage:lifecycle-check -- \
  --scenario service-owned-control \
  --runtime-ms 90000 \
  --stale-no-trades-ms 30000 \
  --grace-ms 5000 \
  --json true
```

This check uses a fake provider, fake clock, and temporary SQLite. It reads no
environment file, uses no credential, makes no external connection, starts no
paid stream, and spends no SOL. The previous live authorization was consumed;
a future live validation requires a new explicit authorization.

## Authoritative counters

Observed provider messages and canonical strategy inputs have different
semantics. The coverage summary exposes both and persists residuals.

```text
recognizedMatchingTradeFrameCount
  = preStopObservedTradeCount + postStopObservedTradeCount

preStopObservedTradeCount
  = canonicalAdmittedTradeCount
  + canonicalRejectedTradeCount
  + preStopDuplicateTradeCount
  + preStopUnusableTradeCount

canonicalAdmittedTradeCount
  = canonicalBusinessTradeCount
  = canonicalTimeSeriesSourceEventCount
```

For the all-usable captured fixture, the expected split is 65 observed, 50
admitted, 15 post-stop evidence-only, and 65 estimated billable messages.
Metered subscription snapshots persist canonical, post-stop, and billable
counts separately. Final reconciliation is monotonic so a stale lower snapshot
cannot replace a higher evidence-derived count.

## Amount and price semantics

`solAmount` is the SOL trade volume when finite and positive.
`tokenAmount`/`tokensAmount` are PumpPortal UI trade deltas. Explicit raw trade
deltas require valid token decimals. `newTokenBalance`, total token balances,
and post-trade balances are not trade quantities without a reliable pre/post
difference.

The model keeps these values separate:

```text
tradeVolumeSol
tradedTokenAmountUi
executionAveragePriceSol
providerReportedPriceSol
curveMarkPriceSol
curveExecutionSpread
```

Execution average is `tradeVolumeSol / tradedTokenAmountUi` only with proven
units, and is the canonical event-time trade-series price. Curve mark is the
normalized virtual-reserve ratio. A curve marginal price differing from an
average execution price is recorded as expected spread rather than an
integrity failure. Provider price comparison is an independent check.

## Decision and latency evidence

Each trade decision carries a stable decision ID, increasing version, mint,
and source-event key. The current signal is computed before projecting and
broadcasting its scanner row; the same decision is persisted afterward.

Coverage records distinguish normalization, queue admission, queue start,
database write, commit, time-series acceptance, derivatives, signal compute,
scanner projection, broadcast, and signal persistence. Reported latency keys
include queue wait, database write, commit-to-time-series,
derivative-to-signal-compute, signal-compute-to-scanner,
scanner-to-broadcast, signal-compute-to-signal-persist, and
receive-to-scanner. Signal-to-scanner is never derived from signal persistence.

## Zero-network replay and benchmark

Copy ignored evidence before inspection and query only the copy. The replay
source is opened read-only; the default target is temporary.

```bash
pnpm --filter @axi/api trade-data:coverage:replay-session -- \
  --from-db /tmp/axi-phase4-live-evidence.sqlite \
  --session '<coverage-session-id>' \
  --json true
```

Use `--output-db <path>` only when the corrected target evidence should remain
after the command. The target must differ from the source. Output contains
aggregate counts and classifications rather than raw payloads, signatures,
traders, credentials, or wallet data.

Run the deterministic-input, real-SQLite timing benchmark with:

```bash
pnpm --filter @axi/api trade-data:coverage:benchmark
```

Acceptance requires 50 admitted, 15 evidence-only, zero post-stop canonical
mutations, zero lifecycle/counter residuals, receive-to-scanner p95 at most
1,000 ms, and maximum at most 2,000 ms.

These commands do not read `.env.local`, connect to PumpPortal, call Solana
RPC, spend SOL, or enable account trades, paper automation, Lightning,
signing, transaction sending, or live trading. The prior paid authorization
was consumed. A new Level B paid validation requires fresh, explicit user
authorization after Phase 4C passes.
