# Paper Forward Evidence Evaluation

Phase 14 evaluates whether independent paper-forward runs have produced enough
clean, repeatable evidence to justify a manual discussion about a future live
architecture. It does not implement that architecture and has no access to
private keys, signing, transaction construction, transaction sending, or a live
execution API.

## Evidence Cohort

Each evaluation is bound to one immutable paper-automation deployment. The
local API automatically loads every completed `paper-operations-v1` session for
that deployment. Operators cannot submit a favorable subset. Active sessions
block evaluation because their evidence boundary is not final. Interrupted
sessions are omitted from performance metrics but their IDs and count remain in
the report. Any interrupted session fails the operational gate, preventing a
crashed or selectively stopped losing run from being silently discarded.

The evaluator verifies unique session/report/event IDs, matching deployment
provenance, finalized manifests, safety flags, non-overlapping time boundaries,
event timestamps inside their sessions, and manifest record counts. It strips
SQLite row IDs, canonicalizes the evidence, and records a SHA-256 digest so an
offline rerun can verify the same logical cohort.

## Default Gates

Evidence minimums are conservative and can only be made stricter:

- at least 5 completed sessions across at least 3 UTC days;
- at least 5 total observed hours;
- at least 250 signal-latency observations and 100 closed trades;
- 95% normal-approximation confidence reporting.

Operational gates require an approved or paused deployment and no
evidence-integrity failure, interrupted session, critical alert, telemetry gap,
new canonical time-series gap, session budget breach, or open position at a
session boundary. P95 signal latency must remain within both the
deployment limit and 5 seconds. Rejected-entry rate uses the pinned deployment
limit; missed-fill rate must be no more than 10%.

Edge gates require drawdown and consecutive losses within the pinned deployment
limits, positive mean net return, a positive 95% confidence lower bound, at
least 50% retention of validated expectancy, positive paper PnL after metered
data costs, and data cost no greater than 25% of paper trading PnL.

The evaluator reports four possible statuses:

- `insufficient_evidence`: clean operations but the minimum cohort is not met;
- `operational_rejected`: integrity, latency, fill, budget, or data quality
  failed;
- `edge_rejected`: sufficient clean evidence did not retain acceptable edge;
- `manual_live_candidate`: every gate passed, but manual review is still
  required and activation remains impossible.

## Local API Workflow

1. Pause paper automation, stop metered data, and complete the final forward
   session.
2. Confirm `GET /runtime/paper-forward-evaluation` reports zero active sessions
   and the expected completed/interrupted counts.
3. POST `/runtime/paper-forward-evaluation/evaluate` with operator identity and
   exact confirmation `EVALUATE PAPER FORWARD EVIDENCE <deployment-id>`.
4. Archive the returned evaluation, SQLite backup, commit hash, logs, and the
   individual Phase 13 evidence exports together.
5. Inspect every acceptance gate and verify the evidence digest independently
   with the offline command.

The dashboard's Evaluate Evidence control performs the same local guarded POST
and clearly labels a passing result as manual review only.

## Read-Only Offline Evaluation

```bash
pnpm paper:forward:evaluate -- --deployment <deployment-id> --operator <identity> --from-db .data/axi.sqlite
```

The command opens SQLite read-only, includes all completed sessions, prints a
deterministic JSON report, does not persist it, and opens no provider or network
connection. Its evaluation time is pinned to the last completed session rather
than wall-clock time.

## What Follows

First run the evidence campaign until the minimums are met and failures have
been investigated in new independent sessions. Do not reinterpret a rejected
gate or edit stored evidence. Any later live-execution work requires a separate
explicit authorization, threat model, key-management design, transaction
simulation, capped rollout, independent kill switch, and rollback plan.
