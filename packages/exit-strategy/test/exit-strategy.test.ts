import { describe, expect, it } from "vitest";
import {
  createDefaultExitRule,
  createExitSimulationFixture,
  createExitStrategyEngine,
  exitReasonCodes,
  type PaperPositionSnapshot,
  type WatchedWalletTradeEvent
} from "../src/index";

const wallet = "WatchWallet111111111111111111111111111111";
const mint = "ExitMint111111111111111111111111111111111";

describe("@axi/exit-strategy", () => {
  it("adds and removes watched wallets", () => {
    const engine = createExitStrategyEngine();
    const saved = engine.addWatchedWallet({
      address: wallet,
      alias: "Smart wallet",
      tags: ["smart_money"],
      source: "test"
    });

    expect(saved.reasonCodes).toContain(exitReasonCodes.walletAdded);
    expect(engine.getWatchedWallets()).toHaveLength(1);
    expect(engine.removeWatchedWallet(wallet)).toBe(true);
    expect(engine.getWatchedWallets()).toEqual([]);
  });

  it("creates a paper exit signal when a wallet buy matches a profitable open position", () => {
    const engine = createEngine();
    const [signal] = engine.evaluateExitForPosition(
      createPosition({ unrealizedPnlPct: 50 }),
      createEvent({ side: "buy" })
    );

    expect(signal?.blocked).toBe(false);
    expect(signal?.action).toBe("paper_sell");
    expect(signal?.sellPct).toBe(100);
    expect(signal?.reasonCodes).toContain(exitReasonCodes.signalCreated);
    expect(signal?.reasonCodes).toContain(exitReasonCodes.liveExecutionDisabled);
  });

  it("returns a blocked paper signal when no position exists", () => {
    const engine = createEngine();
    const [signal] = engine.evaluateExitForPosition(
      null,
      createEvent({ side: "buy" })
    );

    expect(signal?.blocked).toBe(true);
    expect(signal?.blockers).toContain(exitReasonCodes.positionMissing);
  });

  it("blocks when minProfitPct is not met", () => {
    const engine = createEngine();
    const [signal] = engine.evaluateExitForPosition(
      createPosition({ currentPriceSol: 0.00055, unrealizedPnlPct: 10 }),
      createEvent({ side: "buy" })
    );

    expect(signal?.blocked).toBe(true);
    expect(signal?.blockers).toContain(exitReasonCodes.notProfitableEnough);
  });

  it("blocks when the paper position opened after the wallet trade", () => {
    const engine = createEngine();
    const [signal] = engine.evaluateExitForPosition(
      createPosition({ openedAt: "2026-01-01T00:02:00.000Z" }),
      createEvent({ timestamp: "2026-01-01T00:01:00.000Z" })
    );

    expect(signal?.blocked).toBe(true);
    expect(signal?.blockers).toContain(exitReasonCodes.openedAfterTrade);
  });

  it("respects custom sellPct", () => {
    const engine = createEngine({ sellPct: 50 });
    const [signal] = engine.evaluateExitForPosition(
      createPosition(),
      createEvent({ side: "buy" })
    );

    expect(signal?.sellPct).toBe(50);
  });

  it("does not create signals for disabled rules", () => {
    const engine = createEngine({ enabled: false });

    expect(
      engine.evaluateExitForPosition(createPosition(), createEvent({ side: "buy" }))
    ).toEqual([]);
    expect(engine.getState().reasonCodes).toContain(exitReasonCodes.disabled);
  });

  it("cooldown prevents duplicate actionable signals", () => {
    const engine = createEngine({ cooldownMs: 60_000 });
    const event = createEvent({ timestamp: "2026-01-01T00:01:00.000Z" });
    const first = engine.evaluateExitForPosition(createPosition(), event)[0];
    const second = engine.evaluateExitForPosition(createPosition(), event)[0];

    expect(first?.blocked).toBe(false);
    expect(second?.blocked).toBe(true);
    expect(second?.blockers).toContain("EXIT_RULE_COOLDOWN_ACTIVE");
  });

  it("fixtures are deterministic and finite", () => {
    const fixture = createExitSimulationFixture("watched-wallet-buy-profit");

    expect(fixture.signal?.blocked).toBe(false);
    expect(fixture.signal?.score).toEqual(expect.any(Number));
    expect(Number.isFinite(fixture.signal?.score)).toBe(true);
  });
});

function createEngine(rule: Partial<ReturnType<typeof createDefaultExitRule>> = {}) {
  const engine = createExitStrategyEngine({
    now: () => new Date("2026-01-01T00:02:00.000Z"),
    defaultRules: [createDefaultExitRule({ enabled: true, ...rule })]
  });
  engine.addWatchedWallet({
    address: wallet,
    alias: "Smart wallet",
    tags: ["smart_money"],
    source: "test"
  });
  return engine;
}

function createPosition(
  overrides: Partial<PaperPositionSnapshot> = {}
): PaperPositionSnapshot {
  return {
    mint,
    symbol: "EXIT",
    title: "Exit Token",
    entryPriceSol: 0.0005,
    currentPriceSol: 0.00075,
    sizeSol: 1,
    tokenAmount: 2000,
    openedAt: "2026-01-01T00:00:00.000Z",
    unrealizedPnlPct: 50,
    unrealizedPnlSol: 0.5,
    status: "open",
    ...overrides
  };
}

function createEvent(
  overrides: Partial<WatchedWalletTradeEvent> = {}
): WatchedWalletTradeEvent {
  return {
    wallet,
    walletAlias: "Smart wallet",
    mint,
    side: "buy",
    priceSol: 0.00075,
    volumeSol: 2,
    tokenAmount: 2666.66,
    signature: "sig111",
    timestamp: "2026-01-01T00:01:00.000Z",
    source: "test",
    confidence: "high",
    usableForExitStrategy: true,
    reasonCodes: ["WATCHED_WALLET_TRADE_OBSERVED"],
    raw: {},
    ...overrides
  };
}
