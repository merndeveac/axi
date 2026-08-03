# AXI Golden-Path UI V2

## Launch and rollback

V2 is the default dashboard. Start the local API and dashboard with:

```bash
pnpm axi:restart
```

Open `http://localhost:5173/`. The following explicit selectors are supported:

- V2: `http://localhost:5173/?ui=v2`
- legacy rollback: `http://localhost:5173/?ui=legacy`
- build/dev default override: `VITE_AXI_UI_VERSION=legacy` or
  `VITE_AXI_UI_VERSION=v2`

The query selector has precedence over the environment default. `App.tsx`
selects each application through a lazy dynamic import. Legacy code and
`legacy.css` therefore remain in separate chunks and are not eagerly evaluated
or styled when V2 is selected.

## Route and component structure

```text
App
├─ GoldenPathApp (default, lazy)
│  └─ QueryClientProvider + TooltipProvider
│     └─ AppShell
│        ├─ GlobalHeader (108 px fixed contract)
│        │  ├─ PrimaryNavigation
│        │  ├─ ConnectionHealth
│        │  ├─ SecondaryNavigation
│        │  └─ RuntimeControlBar
│        ├─ Scanner
│        │  ├─ ScannerToolbar + ScannerSummary
│        │  ├─ ScannerVirtualList → ScannerCard
│        │  └─ TokenResearchSurface
│        ├─ Positions
│        ├─ Research
│        ├─ Strategy & Evidence
│        ├─ Runtime
│        ├─ Settings
│        └─ DeveloperDiagnostics (secondary drawer only)
└─ LegacyApp (?ui=legacy, lazy)
```

Primary navigation is deliberately limited to Scanner, Positions, and
Research. Runtime, Settings, and Strategy & Evidence are operator support
routes in the secondary menu. Developer Diagnostics is not a route in the
primary workflow and does not affect header height.

## Data architecture

V2 does not use the legacy root `Promise.all` request batch. Each resource owns
an independent React Query key, timeout, cancellation signal, stale policy,
refetch interval, error state, and retry boundary. A scanner failure does not
mark Runtime offline; a Research detail failure does not stop Scanner updates;
and one Diagnostics failure does not hide other panels.

The typed client in `v2/data/api-client.ts` provides bounded GET deduplication,
POST isolation, timeout errors, and consumer cancellation. Runtime uses one
canonical `/runtime/status` cache. The summary adapter displays canonical
backend `canArm`, `canStart`, and `canStop` fields without reimplementing gates.

The scanner transport is split into:

- `GET /ui/v2/scanner`: bounded summary page, maximum 100 rows, server cursor,
  active/history counts, filters, search, and sort.
- `GET /ui/v2/scanner/:mint`: rich detail only for a selected mint.
- `WS /ws/v2/scanner`: versioned snapshot, upsert, removal, runtime update,
  position update, and signal-transition envelopes.

Every stream envelope has a schema version, sequence, and generation time.
Rows have stable mint identity and row versions. Older snapshots cannot replace
newer deltas, duplicate messages are idempotent, a sequence gap requests
reconciliation, and selected details survive active-list rotation.

The server considers the newest five minutes active and also protects HOT,
RIPPING, and positioned rows. The client virtualizes whatever bounded page it
receives; it does not render or request all historical rich records.

## Design and layout contracts

- Header: 108 px, acceptance ceiling 112 px.
- Scanner heading + toolbar + summary: 128 px, ceiling 150 px.
- Compact scanner card: 82 px with an 86 px virtual row stride.
- Comfortable card: 96 px with a 102 px stride.
- Content uses source-aware `available`, `unavailable`, `stale`, and `unproven`
  fields. A true zero remains `0`; tiny nonzero SOL uses significant or
  scientific notation.
- Compact cards show sample readiness, freshness, price/source, curve or DEX
  liquidity, 10-second flow, normalized derivative strength, confidence,
  signal, score, driver, blocker, risk, and paper PnL where present.
- Raw technical codes are excluded from collapsed operator cards and remain in
  Research audit or Developer Diagnostics.

V2 tokens, reset, typography, global primitives, feature styles, and legacy
styles are isolated. Operational state uses text and icons in addition to
color. Tabs, menus, filters, rows, drawers, and dialogs are keyboard reachable;
dialogs trap focus, close with Escape, and restore trigger focus.

## Runtime safety contract

The fixed control bar shows discovery status, public data-wallet balance,
Arm/Start/Stop, spend, cap, remaining budget, tracked mints, and one canonical
warning. Arm requires an explicit cost checkbox and positive values no greater
than backend-provided ceilings. Safe display fallbacks are 0.0001 SOL, three
concurrent mints, and 1,000 events when canonical values are absent.

The ACK is returned by and owned by the current API process. It survives a
browser reload while that process remains alive and resets with a new API
process. It is not written to localStorage. Stop Metered remains visible and
keyboard reachable throughout an active session.

V2 has no private-key input, signing, transaction, swap, buy/sell, Lightning,
or live-execution control. Trading-wallet readiness is absent from the primary
header. Settings exposes only display preferences and read-only public/paper
configuration. Future execution readiness is collapsed and noninteractive.

## Performance budgets and measurement

Run deterministic transport and virtualization measurements with:

```bash
pnpm ui:v2:measure
```

The suite measures 10, 100, 500, and 815 token datasets. It reports summary
bytes, JSON generation time, process heap delta, server-equivalent projection
count, delta bytes, live DOM cards, and new-launch render latency. Budgets are:

- at most 100 projected summary rows per request;
- initial 100-row summary at most 500 KB;
- normal upsert delta at most 50 KB;
- at most 20 live DOM cards in the deterministic 560 px scanner viewport;
- new launch projection/render below 1.5 seconds under normal local load.

The API integration test independently verifies that a 125-row source returns
100 then 25 rows, exposes projection count/time headers, stays under 500 KB,
keeps upserts under 50 KB, and retains the legacy endpoint.

## Browser regression suite

The Playwright suite renders the actual Vite application in managed Chromium.
It intercepts the V2 API origin and scanner WebSocket before navigation, and
serves deterministic local fixtures for scanner, portfolio, research, strategy,
runtime, settings, diagnostics, and bounded runtime mutations. It never starts
the API, opens a paid stream, loads credentials, or sends a request to a live
provider.

Install the browser once per development environment, then run the suite with:

```bash
pnpm exec playwright install chromium
# Ubuntu/WSL images may also need: pnpm exec playwright install-deps chromium
pnpm test:e2e:typecheck
pnpm test:e2e
```

Use `pnpm test:e2e:update` only after visually reviewing an intentional UI
change. Curated `*-snapshots/*.png` files are fixture-only visual baselines and
are committed. Playwright reports, traces, videos, and transient failure output
remain disabled or ignored.

The browser suite verifies the 108 px header, 128 px scanner chrome, 82 px
compact cards, exact complete-card counts at all three target viewports, bounded
DOM rows, no horizontal overflow, tiny nonzero SOL rendering, scanner keyboard
selection, WebSocket selection stability, responsive research, all workflow
surfaces, diagnostics failure isolation, tab navigation, ACK bounds, and focus
restoration after dialogs and drawers close.

## Acceptance checklist

Before launch or material scanner changes, run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm ui:v2:measure
pnpm test:e2e:typecheck
pnpm test:e2e
```

Verify 1280×800, 1440×900, and 1920×1080 browser layouts. They must show 6, 7,
and 9 complete compact cards respectively without horizontal page/card
overflow. Diagnostics must not change the 108 px header. Check API and
WebSocket offline/stale states, micro-price formatting, row keyboard selection,
menu and drawer focus, Arm dialog focus/ACK/bounds, Stop reachability, public
address clipboard feedback, and the absence of secrets and execution controls.

Transient screenshots and runtime artifacts belong under ignored `.tmp/`.
The only screenshot exception is reviewed, deterministic Playwright visual
baselines under `apps/dashboard/e2e/*-snapshots/`. Never commit `.env*`,
`.data/`, SQLite/WAL/SHM, logs, PID files, wallet files, credentials, keys,
auth tokens, seed phrases, or screenshots containing live data.
