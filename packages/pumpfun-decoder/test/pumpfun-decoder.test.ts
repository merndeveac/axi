import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { isTradeUsableForMetrics } from "@axi/indexer-core";
import {
  classifyPumpfunTransaction,
  decodePumpfunTransaction,
  decodePumpfunTransactionBatch,
  getAnchorInstructionDiscriminator,
  pumpfunEventToIndexerEvent,
  pumpfunReasonCodes,
  type PumpfunIdl
} from "../src/index";

const fixtureNames = [
  "token-created.json",
  "buy-trade.json",
  "sell-trade.json",
  "migration.json",
  "failed-transaction.json",
  "unknown-transaction.json"
] as const;

describe("@axi/pumpfun-decoder", () => {
  it("decodes token-created fixtures to normalized token_created events", () => {
    const decoded = decodePumpfunTransaction(readFixture("token-created.json"));
    const normalized = pumpfunEventToIndexerEvent(decoded);

    expect(decoded.kind).toBe("token_created");
    expect(normalized.type).toBe("token_created");
    expect(normalized.reasonCodes).toContain(
      pumpfunReasonCodes.tokenCreatedDecoded
    );
  });

  it("decodes buy fixtures to usable normalized buy trades", () => {
    const decoded = decodePumpfunTransaction(readFixture("buy-trade.json"));
    const normalized = pumpfunEventToIndexerEvent(decoded);

    expect(decoded.kind).toBe("token_trade");
    expect(normalized.type).toBe("token_trade");

    if (normalized.type !== "token_trade") {
      throw new Error("expected token_trade");
    }

    expect(normalized.side).toBe("buy");
    expect(normalized.priceSol).toBe(0.0005);
    expect(normalized.volumeSol).toBe(1.5);
    expect(normalized.tokenAmount).toBe(3000);
    expect(normalized.usableForMetrics).toBe(true);
    expect(isTradeUsableForMetrics(normalized)).toBe(true);
  });

  it("decodes sell fixtures to usable normalized sell trades", () => {
    const decoded = decodePumpfunTransaction(readFixture("sell-trade.json"));
    const normalized = pumpfunEventToIndexerEvent(decoded);

    expect(normalized.type).toBe("token_trade");

    if (normalized.type !== "token_trade") {
      throw new Error("expected token_trade");
    }

    expect(normalized.side).toBe("sell");
    expect(normalized.priceSol).toBe(0.0004);
    expect(normalized.usableForMetrics).toBe(true);
  });

  it("decodes migration fixtures to normalized token_migrated events", () => {
    const decoded = decodePumpfunTransaction(readFixture("migration.json"));
    const normalized = pumpfunEventToIndexerEvent(decoded);

    expect(decoded.kind).toBe("token_migrated");
    expect(normalized.type).toBe("token_migrated");
    expect(normalized.reasonCodes).toContain(pumpfunReasonCodes.migrationDecoded);
  });

  it("returns ignored unknown events for failed transactions", () => {
    const decoded = decodePumpfunTransaction(readFixture("failed-transaction.json"));
    const normalized = pumpfunEventToIndexerEvent(decoded);

    expect(decoded.kind).toBe("unknown");
    expect(normalized.type).toBe("unknown");
    expect(decoded.reasonCodes).toContain(
      pumpfunReasonCodes.failedTransactionIgnored
    );
  });

  it("returns unknown events for unsupported transactions", () => {
    const decoded = decodePumpfunTransaction(readFixture("unknown-transaction.json"));
    const normalized = pumpfunEventToIndexerEvent(decoded);

    expect(decoded.kind).toBe("unknown");
    expect(normalized.type).toBe("unknown");
    expect(decoded.reasonCodes).toContain(pumpfunReasonCodes.unknownTransaction);
  });

  it("marks invalid trade amounts unusable for metrics", () => {
    const fixture = readFixture("buy-trade.json");
    const instruction = readFixtureInstruction(fixture);
    const meta = fixture.meta as { logMessages: string[] };

    instruction.parsed.info.solAmount = 0;
    instruction.parsed.info.tokenAmount = 0;
    meta.logMessages = [
      "Program log: pumpfun fixture",
      "Program log: Instruction: Buy"
    ];

    const decoded = decodePumpfunTransaction(fixture);
    const normalized = pumpfunEventToIndexerEvent(decoded);

    expect(normalized.type).toBe("token_trade");

    if (normalized.type !== "token_trade") {
      throw new Error("expected token_trade");
    }

    expect(normalized.usableForMetrics).toBe(false);
    expect(normalized.reasonCodes).toContain(
      pumpfunReasonCodes.insufficientTradeAmounts
    );
  });

  it("never emits NaN or Infinity", () => {
    for (const name of fixtureNames) {
      const decoded = decodePumpfunTransaction(readFixture(name));
      expect(hasNonFiniteNumber(decoded)).toBe(false);
      expect(hasNonFiniteNumber(pumpfunEventToIndexerEvent(decoded))).toBe(false);
    }
  });

  it("preserves order in batch decoding", () => {
    const decoded = decodePumpfunTransactionBatch([
      readFixture("token-created.json"),
      readFixture("buy-trade.json"),
      readFixture("migration.json")
    ]);

    expect(decoded.map((event) => event.kind)).toEqual([
      "token_created",
      "token_trade",
      "token_migrated"
    ]);
  });

  it("includes decoder reason codes", () => {
    const decoded = decodePumpfunTransaction(readFixture("buy-trade.json"));

    expect(decoded.reasonCodes).toContain(pumpfunReasonCodes.decoderStarted);
    expect(decoded.reasonCodes).toContain(
      pumpfunReasonCodes.transactionClassified
    );
    expect(decoded.reasonCodes).toContain(pumpfunReasonCodes.tradeDecoded);
  });

  it("classifies buy fixtures with trade evidence", () => {
    const classification = classifyPumpfunTransaction(readFixture("buy-trade.json"));

    expect(classification.kind).toBe("token_trade");
    expect(classification.side).toBe("buy");
    expect(classification.evidence.logHints.length).toBeGreaterThan(0);
    expect(classification.evidence.balanceDeltaHints.length).toBeGreaterThan(0);
  });

  it("classifies sell fixtures with trade evidence", () => {
    const classification = classifyPumpfunTransaction(readFixture("sell-trade.json"));

    expect(classification.kind).toBe("token_trade");
    expect(classification.side).toBe("sell");
    expect(classification.evidence.logHints.length).toBeGreaterThan(0);
    expect(classification.evidence.balanceDeltaHints.length).toBeGreaterThan(0);
  });

  it("keeps unknown fixtures blocked by insufficient evidence", () => {
    const classification = classifyPumpfunTransaction(
      readFixture("unknown-transaction.json")
    );

    expect(classification.kind).toBe("unknown");
    expect(classification.blockers).toContain("insufficient_event_type_evidence");
  });

  it("uses IDL hints to raise classification confidence", () => {
    const idl: PumpfunIdl = {
      instructions: [{ name: "buy" }]
    };
    const fixture = readFixture("unknown-transaction.json");
    const transaction = fixture.transaction as {
      message: { instructions: Array<Record<string, unknown>> };
    };

    transaction.message.instructions[0] = {
      programId: "PumpFunFixtureProgram1111111111111111111111",
      data: Buffer.from(getAnchorInstructionDiscriminator("buy")).toString(
        "base64"
      )
    };

    const classification = classifyPumpfunTransaction(fixture, { idl });

    expect(classification.kind).toBe("token_trade");
    expect(classification.confidence).toBe("high");
    expect(classification.evidence.idlHints).toContain("idl_instruction=buy");
  });

  it("keeps balance-only inference low confidence", () => {
    const fixture = readFixture("buy-trade.json");
    const meta = fixture.meta as { logMessages: string[] };
    const transaction = fixture.transaction as {
      message: { instructions: Array<Record<string, unknown>> };
    };

    meta.logMessages = [];
    transaction.message.instructions = [];

    const classification = classifyPumpfunTransaction(fixture);

    expect(classification.kind).toBe("unknown");
    expect(classification.confidence).toBe("low");
    expect(classification.evidence.balanceDeltaHints.length).toBeGreaterThan(0);
  });

  it("classifies failed transactions as ignored with blockers", () => {
    const classification = classifyPumpfunTransaction(
      readFixture("failed-transaction.json")
    );

    expect(classification.kind).toBe("unknown");
    expect(classification.blockers).toContain("transaction_failed");
    expect(classification.reasonCodes).toContain(
      pumpfunReasonCodes.failedTransactionIgnored
    );
  });
});

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")
  ) as Record<string, unknown>;
}

function readFixtureInstruction(fixture: Record<string, unknown>): {
  parsed: { info: Record<string, unknown> };
} {
  const transaction = fixture.transaction as
    | {
        message?: {
          instructions?: Array<{
            parsed?: { info?: Record<string, unknown> };
          }>;
        };
      }
    | undefined;
  const instruction = transaction?.message?.instructions?.[0];
  const info = instruction?.parsed?.info;

  if (!instruction || !info) {
    throw new Error("fixture instruction missing parsed info");
  }

  return {
    parsed: {
      info
    }
  };
}

function hasNonFiniteNumber(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === "number") {
    return !Number.isFinite(value);
  }

  if (typeof value !== "object" || value === null || seen.has(value)) {
    return false;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((entry) => hasNonFiniteNumber(entry, seen));
  }

  return Object.values(value as Record<string, unknown>).some((entry) =>
    hasNonFiniteNumber(entry, seen)
  );
}
