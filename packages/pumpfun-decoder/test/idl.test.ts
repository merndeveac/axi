import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  createPumpfunIdlDecoder,
  decodeAnchorEventFromProgramData,
  getAnchorEventDiscriminator,
  getAnchorInstructionDiscriminator,
  identifyAnchorEventByDiscriminator,
  identifyAnchorInstructionByDiscriminator,
  parseAnchorProgramDataLog,
  type PumpfunIdl
} from "../src/idl";

const testIdl: PumpfunIdl = {
  metadata: {
    name: "test_pumpfun",
    version: "0.0.0-test",
    origin: "unit-test"
  },
  instructions: [{ name: "buy" }, { name: "sell" }],
  events: [{ name: "TradeEvent" }]
};

describe("@axi/pumpfun-decoder IDL hooks", () => {
  it("creates deterministic instruction discriminators", () => {
    expect(toHex(getAnchorInstructionDiscriminator("buy"))).toBe(
      toHex(getAnchorInstructionDiscriminator("buy"))
    );
    expect(toHex(getAnchorInstructionDiscriminator("buy"))).not.toBe(
      toHex(getAnchorInstructionDiscriminator("sell"))
    );
  });

  it("creates deterministic event discriminators", () => {
    expect(toHex(getAnchorEventDiscriminator("TradeEvent"))).toBe(
      toHex(getAnchorEventDiscriminator("TradeEvent"))
    );
    expect(toHex(getAnchorEventDiscriminator("TradeEvent"))).not.toBe(
      toHex(getAnchorEventDiscriminator("CreateEvent"))
    );
  });

  it("identifies instructions from a minimal test IDL", () => {
    const data = concat(getAnchorInstructionDiscriminator("buy"), [1, 2, 3]);
    const result = identifyAnchorInstructionByDiscriminator(data, testIdl);

    expect(result).toMatchObject({
      matched: true,
      name: "buy"
    });
  });

  it("identifies events from a minimal test IDL", () => {
    const data = concat(getAnchorEventDiscriminator("TradeEvent"), [1, 2, 3]);
    const result = identifyAnchorEventByDiscriminator(data, testIdl);

    expect(result).toMatchObject({
      matched: true,
      name: "TradeEvent"
    });
  });

  it("parses Program data base64 log lines", () => {
    const data = concat(getAnchorEventDiscriminator("TradeEvent"), [9, 9]);
    const parsed = parseAnchorProgramDataLog(
      `Program data: ${Buffer.from(data).toString("base64")}`
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.data?.length).toBe(10);
  });

  it("returns structured decode failure instead of throwing", () => {
    const result = decodeAnchorEventFromProgramData("Program log: nope", testIdl);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("works without an IDL", () => {
    const decoder = createPumpfunIdlDecoder();

    expect(decoder.status).toBe("unavailable");
    expect(decoder.identifyInstruction("abcd").matched).toBe(false);
  });
});

function concat(prefix: Uint8Array, suffix: number[]): Uint8Array {
  return Uint8Array.from([...prefix, ...suffix]);
}

function toHex(data: Uint8Array): string {
  return Buffer.from(data).toString("hex");
}
