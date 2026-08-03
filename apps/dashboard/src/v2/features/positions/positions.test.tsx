// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { exitSignalToken, paperPositionToken } from "../../fixtures/golden-path";
import type { PaperPortfolioSnapshotV2 } from "../../data/hooks/usePortfolioSummary";
import type { PaperPortfolioStatusV2, PaperPositionV2 } from "../../data/hooks/usePositions";
import { PositionsPageView } from "./PositionsPage";

afterEach(cleanup);

const status: PaperPortfolioStatusV2 = {
  enabled: true,
  entryPolicyEnabled: false,
  exitPolicyEnabled: false,
  openPositionCount: 1,
  closedPositionCount: 0,
  totalPnlSol: 0.00002,
  realizedPnlSol: 0.000005,
  unrealizedPnlSol: 0.000015,
  winRate: 100,
  paperOnly: true,
  liveExecutionDisabled: true
};

const snapshot: PaperPortfolioSnapshotV2 = {
  cashSol: 0.99,
  deployedSol: 0.01,
  equitySol: 1.00002,
  realizedPnlSol: 0.000005,
  unrealizedPnlSol: 0.000015,
  totalPnlSol: 0.00002,
  totalPnlPct: 0.002,
  openPositionCount: 1,
  closedPositionCount: 0,
  winRate: 100,
  maxDrawdownSol: 0,
  totalFeesSol: 0.000001,
  totalTrades: 2,
  updatedAt: "2025-06-14T12:00:00.000Z"
};

const position: PaperPositionV2 = {
  id: "paper-position-1",
  mint: paperPositionToken.mint,
  symbol: "AXIP",
  title: "Axi paper position",
  status: "partially_closed",
  entryPriceSol: 4e-8,
  averageEntryPriceSol: 4e-8,
  currentPriceSol: 5e-8,
  sizeSol: 0.005,
  remainingSizeSol: 0.0025,
  realizedPnlSol: 0.000005,
  unrealizedPnlSol: 0.000015,
  realizedPnlPct: 10,
  unrealizedPnlPct: 15,
  openedAt: "2025-06-14T11:58:00.000Z",
  updatedAt: "2025-06-14T12:00:00.000Z"
};

describe("positions workflow", () => {
  it("leads with the paper portfolio and open-position hierarchy", () => {
    render(<PositionsPageView positions={[position]} status={status} snapshot={snapshot} scannerRows={[paperPositionToken]} />);
    expect(screen.getByLabelText("Paper portfolio summary")).toBeTruthy();
    expect(screen.getByText("partially closed")).toBeTruthy();
    expect(screen.getByText("Current momentum")).toBeTruthy();
    expect(screen.getByText("No active exit alert")).toBeTruthy();
  });

  it("carries an entry-to-mark-to-exit scenario with paper PnL", () => {
    render(
      <PositionsPageView
        positions={[position]}
        status={status}
        snapshot={snapshot}
        scannerRows={[{ ...exitSignalToken, mint: position.mint }]}
        orders={[{ id: "order-1", side: "buy", mint: position.mint, source: "launch_signal", createdAt: position.openedAt }]}
        fills={[{ id: "fill-1", side: "buy", mint: position.mint, priceSol: position.entryPriceSol, sizeSol: position.sizeSol, fillStatus: "filled", createdAt: position.openedAt }]}
      />
    );
    expect(screen.getByText(/Exit alert · paper-exit-fixture-1/)).toBeTruthy();
    expect(screen.getAllByText(/0\.000015 SOL/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 orders · 1 fills/)).toBeTruthy();
  });

  it("uses an explanatory empty state instead of leading with tables", () => {
    render(<PositionsPageView positions={[]} status={status} snapshot={snapshot} scannerRows={[]} />);
    expect(screen.getByText("No paper positions yet")).toBeTruthy();
    expect(screen.getByText(/entry policy is disabled/i)).toBeTruthy();
  });

  it("exposes no live execution controls", () => {
    render(<PositionsPageView positions={[position]} status={status} snapshot={snapshot} scannerRows={[]} />);
    expect(screen.queryByRole("button", { name: /buy|sell|swap|sign|send/i })).toBeNull();
  });
});
