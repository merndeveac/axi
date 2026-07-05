import { describe, expect, it } from "vitest";
import {
  createDefaultSubscriptionConfig,
  createDisabledStreamProvider,
  createNotImplementedProvider,
  createStreamEnvelopeId,
  getEnvelopeAccountKeys,
  getEnvelopeProgramIds,
  getEnvelopeSignature,
  isTransactionEnvelope,
  maskAuthToken,
  maskStreamEndpoint,
  normalizeProviderError,
  streamReasonCodes,
  type ManagedStreamTransactionEnvelope
} from "../src";

describe("@axi/stream-core", () => {
  it("creates deterministic envelope ids", () => {
    const left = createStreamEnvelopeId({ b: 2, a: 1 });
    const right = createStreamEnvelopeId({ a: 1, b: 2 });

    expect(left).toBe(right);
    expect(left).toMatch(/^stream_/u);
  });

  it("masks endpoints and query tokens", () => {
    const masked = maskStreamEndpoint(
      "https://user:pass@example.com/stream?token=super-secret&filter=pump"
    );

    expect(masked).toContain("token=****");
    expect(masked).toContain("filter=pump");
    expect(masked).not.toContain("super-secret");
    expect(masked).not.toContain("pass");
  });

  it("masks auth tokens without exposing token material", () => {
    const masked = maskAuthToken("abc123secret");

    expect(masked).toBe("configured:12");
    expect(masked).not.toContain("abc123secret");
  });

  it("detects transaction envelopes", () => {
    const envelope: ManagedStreamTransactionEnvelope = {
      id: "env_1",
      provider: "mock",
      schemaVersion: 1,
      chain: "solana",
      commitment: "confirmed",
      streamType: "transaction",
      signature: "Sig111",
      programIds: ["Program111", "Program111"],
      accountKeys: ["Acct111"],
      receivedAt: "2026-01-01T00:00:00.000Z",
      raw: {},
      reasonCodes: [],
      transaction: {}
    };

    expect(isTransactionEnvelope(envelope)).toBe(true);
    expect(getEnvelopeSignature(envelope)).toBe("Sig111");
    expect(getEnvelopeProgramIds(envelope)).toEqual(["Program111"]);
    expect(getEnvelopeAccountKeys(envelope)).toEqual(["Acct111"]);
  });

  it("disabled provider refuses start cleanly", () => {
    const provider = createDisabledStreamProvider("yellowstone");
    provider.start();

    const status = provider.getStatus();

    expect(status.enabled).toBe(false);
    expect(status.connectionState).toBe("disabled");
    expect(status.reasonCodes).toContain(streamReasonCodes.providerDisabled);
  });

  it("not implemented provider reports not_implemented", () => {
    const provider = createNotImplementedProvider("laserstream");
    provider.subscribe(
      createDefaultSubscriptionConfig({
        provider: "laserstream",
        authConfigured: true
      })
    );
    provider.start();

    const status = provider.getStatus();

    expect(status.connectionState).toBe("not_implemented");
    expect(status.subscribed).toBe(true);
    expect(status.reasonCodes).toContain(streamReasonCodes.notImplemented);
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("normalizes provider errors without bearer credentials", () => {
    const error = normalizeProviderError(
      new Error("failed with bearer abc123secret and apiKey=secret-key")
    );

    expect(error.message).toContain("bearer ****");
    expect(error.message).toContain("apiKey=****");
    expect(error.message).not.toContain("abc123secret");
    expect(error.message).not.toContain("secret-key");
  });
});
