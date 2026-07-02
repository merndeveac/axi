import { describe, expect, it } from "vitest";
import { MockFeedProvider, type FeedEvent } from "../src/index";

describe("MockFeedProvider", () => {
  it("produces the same sequence for the same seed and scenario", () => {
    const first = collectEvents({ scenario: "momentum", seed: 42 });
    const second = collectEvents({ scenario: "momentum", seed: 42 });

    expect(second).toEqual(first);
  });

  it("produces different useful behavior for different scenarios", () => {
    const momentum = collectEvents({ scenario: "momentum", seed: 42 });
    const flat = collectEvents({ scenario: "flat", seed: 42 });

    expect(firstCreated(momentum).metrics.volumeVelocity).toBeGreaterThan(
      firstCreated(flat).metrics.volumeVelocity
    );
  });

  it("rug scenario produces higher-risk data", () => {
    const rug = firstCreated(collectEvents({ scenario: "rug", seed: 42 }));

    expect(rug.riskFlags.mintAuthorityActive).toBe(true);
    expect(rug.riskFlags.topHolderConcentrationHigh).toBe(true);
    expect(rug.metrics.topHolderPercent).toBeGreaterThan(25);
  });

  it("momentum scenario produces rising momentum-style data", () => {
    const momentum = firstCreated(
      collectEvents({ scenario: "momentum", seed: 42 })
    );

    expect(momentum.metrics.volumeVelocity).toBeGreaterThan(2);
    expect(momentum.metrics.buyerVelocity).toBeGreaterThan(2);
    expect(momentum.metrics.priceChange5mPct).toBeGreaterThan(10);
  });

  it("flat scenario produces low-change data", () => {
    const flat = firstCreated(collectEvents({ scenario: "flat", seed: 42 }));

    expect(flat.metrics.volumeVelocity).toBe(1);
    expect(flat.metrics.buyerVelocity).toBe(1);
    expect(flat.metrics.priceChange5mPct).toBeLessThan(1);
  });

  it("emits deterministic trade events", () => {
    const first = trades(collectEvents({ scenario: "normal", seed: 99 }));
    const second = trades(collectEvents({ scenario: "normal", seed: 99 }));

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(first[0]?.mint).toBe(first[0]?.token.mint);
  });

  it("momentum scenario creates rising fake trade metrics", () => {
    const momentumTrades = trades(
      collectEvents({ scenario: "momentum", seed: 42, maxEvents: 12 })
    );

    expect(momentumTrades.filter((event) => event.side === "buy").length).toBeGreaterThan(
      momentumTrades.filter((event) => event.side === "sell").length
    );
    expect(momentumTrades.at(-1)?.volumeUsd).toBeGreaterThan(
      momentumTrades[0]?.volumeUsd ?? 0
    );
    expect(momentumTrades.at(-1)?.priceUsd).toBeGreaterThan(
      momentumTrades[0]?.priceUsd ?? 0
    );
  });

  it("flat scenario creates low-change fake trades", () => {
    const flatTrades = trades(
      collectEvents({ scenario: "flat", seed: 42, maxEvents: 12 })
    );

    expect(Math.max(...flatTrades.map((event) => event.volumeUsd))).toBeLessThan(40);
    expect(flatTrades.at(-1)?.priceUsd).toBeCloseTo(flatTrades[0]?.priceUsd ?? 0);
  });

  it("rug scenario creates sell-pressure fake trades", () => {
    const rugTrades = trades(
      collectEvents({ scenario: "rug", seed: 42, maxEvents: 12 })
    );
    const sellVolume = rugTrades
      .filter((event) => event.side === "sell")
      .reduce((total, event) => total + event.volumeUsd, 0);
    const buyVolume = rugTrades
      .filter((event) => event.side === "buy")
      .reduce((total, event) => total + event.volumeUsd, 0);

    expect(sellVolume).toBeGreaterThan(buyVolume);
    expect(rugTrades.some((event) => event.riskFlags.honeypotSuspected)).toBe(true);
  });
});

function collectEvents(options: {
  maxEvents?: number;
  scenario: "normal" | "momentum" | "rug" | "flat";
  seed: number;
}): FeedEvent[] {
  const events: FeedEvent[] = [];
  const provider = new MockFeedProvider({
    ...options,
    intervalMs: 0,
    maxEvents: options.maxEvents ?? 6
  });

  provider.start((event) => {
    events.push(event);
  });

  return events;
}

function trades(events: FeedEvent[]) {
  return events.filter(
    (event): event is Extract<FeedEvent, { type: "trade" }> =>
      event.type === "trade"
  );
}

function firstCreated(events: FeedEvent[]) {
  const event = events.find((item) => item.type === "token_created");

  if (!event || event.type !== "token_created") {
    throw new Error("Expected token_created mock event");
  }

  return event;
}
