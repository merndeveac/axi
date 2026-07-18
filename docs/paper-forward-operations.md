# Paper Forward Operations Runbook

This runbook covers sustained forward validation of an already approved AXI
paper-automation deployment. It does not authorize live trading. AXI does not
load a signer, construct or send transactions, or automatically start paid
data.

## Preconditions

1. Run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build` on the exact
   revision that will collect evidence.
2. Confirm the API reports `paperOnly: true`, `tradingDisabled: true`, and
   `liveExecutionDisabled: true` from `/health`, `/runtime/contracts`,
   `/runtime/paper-automation`, and `/runtime/paper-operations`.
3. Verify the lifecycle validation is a `paper_automation_candidate` and the
   immutable paper-automation deployment pins the intended threshold, costs,
   limits, latency, missed-fill model, liquidity participation, and exit policy.
4. Keep legacy `PAPER_ENTRY_ENABLED` and `PAPER_EXIT_ENABLED` loops disabled.
5. Decide the session cost cap before acknowledging any metered data. Never use
   a cap above the deployment/run budget.
6. Back up `.data/axi.sqlite` while the API is stopped, or use SQLite's supported
   online backup tooling. Do not copy a live WAL database as a single file.

## Start A Session

Starting an operations session does not start metered data and does not arm
paper automation.

1. Start free discovery and confirm the public feed is connected.
2. Approve the lifecycle report if it has not already been approved.
3. Start the forward session locally with the exact confirmation
   `START PAPER FORWARD SESSION <deployment-id>` and an identified operator.
4. Review `/runtime/paper-operations`; confirm the session is `active`, cost is
   zero, no critical alerts exist, and automatic metered/arm/live flags are
   false.
5. Separately acknowledge the desired PumpPortal session budget, start metered
   tracking, and arm paper automation with their existing explicit controls.

## Monitor

Keep the dashboard diagnostics panel open or poll the read endpoints. Watch:

- feed connection, reconnect count, last event, and maximum silence;
- telemetry sampling gaps and sampling/storage errors;
- p95 and maximum signal latency;
- one-second data gaps, duplicates, invalid events, and late events;
- tracked mint and event counts;
- estimated cost, remaining budget, and provider budget state;
- deployment status, automation health, pending operations, paper fills, PnL,
  drawdown, rejected entries, and missed fills;
- warnings and critical alerts tied to immutable sample IDs.

A budget breach automatically stops metered tracking and pauses armed paper
automation. Critical feed, telemetry, health, duration, or storage/sampling
conditions pause paper automation. Investigate and start a new session when the
evidence boundary would otherwise be ambiguous.

## Emergency Stop

1. Pause paper automation immediately.
2. Stop metered launch tracking to halt additional data spend.
3. Stop discovery if the provider or runtime is unstable.
4. Preserve `/runtime/paper-operations`, automation events/operations, and logs.
5. End the session if the API is healthy. If the process is stopped or crashes,
   the next startup marks the active session `interrupted` and requires a new
   explicit session and re-arm.

## Restart Drill

Before trusting a long campaign, run a controlled drill in a non-metered local
environment with a disposable deployment. Phase 14 treats every interrupted
session as an operational rejection to prevent survivorship bias, so do not
attach the drill to the deployment intended for promotion evidence:

1. Start a forward session and record its ID.
2. Stop the API without ending the session.
3. Restart the API.
4. Confirm the old session is `interrupted`, paper automation is paused, pending
   operations are cancelled, and neither metered data nor automation resumed.
5. Export the interrupted session and verify the manifest contains the
   `restart_reconciled` evidence boundary.

## End And Export

1. Pause paper automation and allow/cancel pending paper operations according to
   the deployment policy.
2. Stop metered tracking and verify estimated cost is stable.
3. End the session using `END PAPER FORWARD SESSION <session-id>`.
4. Export JSON for the canonical evidence bundle, JSONL for analysis pipelines,
   and CSV for snapshot review:

   ```bash
   pnpm paper:forward:export -- --session <session-id> --format json --from-db .data/axi.sqlite
   pnpm paper:forward:export -- --session <session-id> --format jsonl --from-db .data/axi.sqlite
   pnpm paper:forward:export -- --session <session-id> --format csv --from-db .data/axi.sqlite
   ```

5. Archive the database backup, commit hash, runtime configuration, logs, and
   exports together. Treat a session with telemetry gaps or critical alerts as
   qualified/failed evidence, never silently as clean evidence.

## Promotion Gate

Do not implement or activate live execution from a single run. Require multiple
independent completed sessions with no unexplained data gaps, stable latency and
cost, no safety-control failures, acceptable fill quality/drawdown/loss streaks,
and forward expectancy whose confidence remains above the approved gate. A
later live-execution phase requires a separate architecture and explicit human
authorization.

After enough sessions exist, run the Phase 14 evaluator. The API evaluation
requires `EVALUATE PAPER FORWARD EVIDENCE <deployment-id>` and automatically
includes every completed session for that deployment. For a read-only report:

```bash
pnpm paper:forward:evaluate -- --deployment <deployment-id> --operator <identity> --from-db .data/axi.sqlite
```

Review the immutable evidence digest, all failed gates, interrupted-session
disclosures, cost-adjusted PnL, and confidence lower bound. Even
`manual_live_candidate` is only a prompt for a separate human architecture and
safety review; it does not enable wallets, signing, transaction construction,
or live execution. See
[`paper-forward-evaluation.md`](paper-forward-evaluation.md).
