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
});

function collectEvents(options: {
  scenario: "normal" | "momentum" | "rug" | "flat";
  seed: number;
}): FeedEvent[] {
  const events: FeedEvent[] = [];
  const provider = new MockFeedProvider({
    ...options,
    intervalMs: 0,
    maxEvents: 6
  });

  provider.start((event) => {
    events.push(event);
  });

  return events;
}

function firstCreated(events: FeedEvent[]) {
  const event = events.find((item) => item.type === "token_created");

  if (!event || event.type !== "token_created") {
    throw new Error("Expected token_created mock event");
  }

  return event;
}
