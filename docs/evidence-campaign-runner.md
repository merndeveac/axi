# Paper Evidence Campaign Runner

The evidence campaign runner automates paid PumpPortal token-trade collection
for calibration without enabling orders, signing, account-trade streams, the
Local Transaction API, or Lightning execution.

## Safety Model

- The absolute campaign request ceiling is `0.25 SOL`.
- The configured data-wallet minimum reserve is always preserved. The effective
  budget is the smaller of the requested budget and the wallet balance above
  that reserve, less one metered event of rounding protection.
- Paid collection is divided into backend-enforced sub-sessions of no more than
  `0.001 SOL`. A runner crash cannot automatically start the next sub-session.
- Every rollover requires the local-only API and the exact internal confirmation
  `ROLLOVER METERED DATA SESSION`.
- Feed loss, an unavailable/low data-wallet balance, a paper-only contract
  failure, or any live-execution capability fails closed and stops collection.
- Progress is atomically checkpointed with owner-only permissions at
  `.data/evidence-campaign-v1.json`.

PumpPortal billing can lag the local event estimate. The runner therefore uses
both bounded message counts and recurring public-balance checks. It reports
estimated campaign spend and does not promise that the provider will debit an
exact decimal amount.

## Evidence Boundaries

The runner starts a real-session training capture, spends the configured
training allocation, stops it, and keeps the metered stream open through the
60-second outcome horizon. It materializes training outcomes before starting a
strictly later validation capture. The last bounded sub-session is reserved for
validation outcome materialization.

At completion it stops and disarms metered data, materializes both partitions,
exports their immutable JSON datasets, runs paper strategy evaluation, and—only
when that report is a `paper_observation_candidate`—runs lifecycle validation.
None of these steps can activate paper automation or live execution.

## Run

Start AXI and confirm the free discovery feed is connected:

```bash
pnpm axi:launch
```

Start a campaign with an explicit requested ceiling:

```bash
pnpm paper:evidence:campaign -- --budget-sol 0.25 --operator <identity>
```

Resume the same runner process state while the same API runtime remains alive:

```bash
pnpm paper:evidence:campaign -- --resume
```

`Ctrl-C` stops metered data and the active capture before checkpointing a
`safety_stopped` result. An API restart interrupts the evidence boundary and is
not silently resumed.

Final campaign state and capture exports are written under
`.data/evidence-campaign/<campaign-id>/` and remain local/gitignored.
