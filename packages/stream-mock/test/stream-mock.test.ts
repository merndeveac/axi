import { describe, expect, it } from "vitest";
import { createDefaultSubscriptionConfig } from "@axi/stream-core";
import {
  createMockManagedStreamProvider,
  createMockTransactionEnvelopeFromFixture,
  createPumpfunFixtureStreamScenario,
  loadMockStreamScenario
} from "../src";

describe("@axi/stream-mock", () => {
  it("emits fixture envelopes", () => {
    const provider = createMockManagedStreamProvider({
      scenario: "pumpfun_trades"
    });
    const signatures: string[] = [];

    provider.onEnvelope((envelope) => {
      if (envelope.signature) {
        signatures.push(envelope.signature);
      }
    });
    provider.start();

    expect(signatures).toEqual([
      "pumpfun_fixture_buy_trade_sig",
      "pumpfun_fixture_sell_trade_sig"
    ]);
    expect(provider.getStatus().transactionCount).toBe(2);
  });

  it("respects maxEvents", () => {
    const provider = createMockManagedStreamProvider({
      scenario: "pumpfun_basic",
      maxEvents: 1
    });
    const envelopes: string[] = [];

    provider.onEnvelope((envelope) => {
      envelopes.push(envelope.id);
    });
    provider.start();

    expect(envelopes).toHaveLength(1);
    expect(provider.getStatus().receivedCount).toBe(1);
  });

  it("stop works before emission", () => {
    const provider = createMockManagedStreamProvider({
      scenario: "pumpfun_basic",
      intervalMs: 50
    });
    const envelopes: string[] = [];

    provider.onEnvelope((envelope) => {
      envelopes.push(envelope.id);
    });
    provider.stop();

    expect(envelopes).toHaveLength(0);
    expect(provider.getStatus().connectionState).toBe("disconnected");
  });

  it("error scenario increments errorCount", () => {
    const provider = createMockManagedStreamProvider({
      scenario: "error_after_n",
      errorAfterN: 1
    });
    const envelopes: string[] = [];

    provider.onEnvelope((envelope) => {
      envelopes.push(envelope.id);
    });
    provider.start();

    expect(envelopes).toHaveLength(1);
    expect(provider.getStatus().errorCount).toBe(1);
    expect(provider.getStatus().connectionState).toBe("error");
  });

  it("subscribe config is recorded", () => {
    const provider = createMockManagedStreamProvider();
    provider.subscribe(
      createDefaultSubscriptionConfig({
        provider: "mock",
        commitment: "finalized",
        transactions: {
          enabled: true,
          accountInclude: ["Pump111"],
          accountExclude: [],
          accountRequired: [],
          vote: false,
          failed: false
        }
      })
    );

    const status = provider.getStatus();

    expect(status.subscribed).toBe(true);
    expect(status.commitment).toBe("finalized");
    expect(status.subscriptions?.transactions.accountInclude).toEqual(["Pump111"]);
  });

  it("creates Pump.fun fixture stream scenarios", () => {
    const scenario = createPumpfunFixtureStreamScenario({
      kinds: ["token_created", "buy_trade"]
    });

    expect(scenario.envelopes).toHaveLength(2);
    expect(scenario.envelopes[0]?.streamType).toBe("transaction");
  });

  it("loads empty scenario and creates transaction envelopes", () => {
    const empty = loadMockStreamScenario("empty");
    const envelope = createMockTransactionEnvelopeFromFixture({
      signature: "Sig111",
      slot: 5,
      blockTime: 1767225600,
      transaction: { message: { accountKeys: [], instructions: [] } },
      meta: { err: null, logMessages: [] }
    });

    expect(empty.envelopes).toEqual([]);
    expect(envelope.signature).toBe("Sig111");
    expect(envelope.receivedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
