import { describe, expect, it } from "vitest";
import {
  NormalizedIndexerEventSchema,
  createIndexerEventId,
  eventToReasonSummary,
  getEventMint,
  getEventTimestamp,
  indexerReasonCodes,
  isTradeUsableForMetrics,
  shortMint,
  type NormalizedIndexerEvent,
  type NormalizedTokenTradeEvent
} from "../src/index";

const base = {
  id: "idx_test",
  schemaVersion: 1,
  source: "mock",
  sourceMode: "mock",
  chain: "solana",
  receivedAt: "2026-01-01T00:00:00.000Z",
  reasonCodes: [indexerReasonCodes.schemaV1]
} as const;

describe("@axi/indexer-core", () => {
  it("creates deterministic event ids", () => {
    const input = {
      type: "token_created" as const,
      mint: " Mint111111111111111111111111111111111 ",
      signature: "sig",
      slot: 123,
      source: "mock"
    };

    expect(createIndexerEventId(input)).toBe(createIndexerEventId(input));
    expect(createIndexerEventId(input)).not.toBe(
      createIndexerEventId({ ...input, slot: 124 })
    );
  });

  it("validates a token_created event", () => {
    const event = NormalizedIndexerEventSchema.parse({
      ...base,
      type: "token_created",
      mint: "Mint111111111111111111111111111111111111",
      name: "Portal Token",
      symbol: "PORTAL",
      marketCapSol: null
    });

    expect(event.type).toBe("token_created");
    expect(getEventMint(event)).toBe("Mint111111111111111111111111111111111111");
    expect(shortMint(event.mint)).toBe("Mint1111...111111");
  });

  it("detects usable and unusable token trades", () => {
    const usable: NormalizedTokenTradeEvent = {
      ...base,
      id: "idx_trade_1",
      type: "token_trade",
      mint: "Mint111111111111111111111111111111111111",
      side: "buy",
      priceSol: 0.00042,
      priceUsd: null,
      volumeSol: 1.5,
      volumeUsd: null,
      tokenAmount: 3571,
      confidence: "high",
      usableForMetrics: true,
      reasonCodes: [indexerReasonCodes.eventUsableForMetrics]
    };
    const unusable: NormalizedTokenTradeEvent = {
      ...usable,
      id: "idx_trade_2",
      priceSol: null,
      usableForMetrics: false,
      reasonCodes: [indexerReasonCodes.eventUnusableForMetrics]
    };

    expect(isTradeUsableForMetrics(usable)).toBe(true);
    expect(isTradeUsableForMetrics(unusable)).toBe(false);
  });

  it("keeps unknown events safe", () => {
    const event = NormalizedIndexerEventSchema.parse({
      ...base,
      id: "idx_unknown",
      type: "unknown",
      raw: { hello: "world" },
      reasonCodes: [indexerReasonCodes.eventUnknown]
    }) as NormalizedIndexerEvent;

    expect(getEventMint(event)).toBeNull();
    expect(eventToReasonSummary(event)).toContain("INDEXER_EVENT_UNKNOWN");
  });

  it("extracts timestamps safely", () => {
    const event = NormalizedIndexerEventSchema.parse({
      ...base,
      id: "idx_timestamp",
      type: "token_metadata",
      mint: "Mint111111111111111111111111111111111111",
      source: "pumpportal",
      blockTime: 1767225600,
      processedAt: "2026-01-01T00:00:05.000Z"
    });

    expect(getEventTimestamp(event)).toBe("2026-01-01T00:00:00.000Z");
  });
});
