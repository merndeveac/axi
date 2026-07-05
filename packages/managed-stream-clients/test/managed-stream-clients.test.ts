import { describe, expect, it } from "vitest";
import { createDefaultSubscriptionConfig } from "@axi/stream-core";
import {
  buildLaserStreamSdkSubscriptionRequest,
  buildLaserStreamSubscriptionRequest,
  buildManagedStreamSubscriptionProfile,
  buildYellowstoneSubscriptionRequest,
  createDisabledManagedStreamClient,
  createLaserStreamClient,
  createLaserStreamRealClient,
  createManagedStreamClient,
  createManagedStreamClientFactory,
  createMockManagedStreamTransport,
  createNotImplementedManagedStreamClient,
  createYellowstoneClient,
  evaluateLaserStreamRealReadiness,
  managedStreamClientReasonCodes,
  managedStreamProfileReasonCodes,
  validateManagedStreamClientConfig
} from "../src";

const baseSubscription = createDefaultSubscriptionConfig({
  provider: "yellowstone",
  authConfigured: true,
  commitment: "confirmed",
  endpoint: "https://yellowstone.example.invalid?token=secret",
  transactions: {
    enabled: true,
    accountInclude: ["FakeProgram111111111111111111111111111111111"],
    accountExclude: [],
    accountRequired: ["FakeRequired1111111111111111111111111111111"],
    vote: false,
    failed: false
  }
});

describe("@axi/managed-stream-clients", () => {
  it("defaults to a disabled client", () => {
    const client = createManagedStreamClient();
    const status = client.getStatus();

    expect(status.kind).toBe("disabled");
    expect(status.connectionState).toBe("disabled");
    expect(status.reasonCodes).toContain(managedStreamClientReasonCodes.disabled);
  });

  it("reports Yellowstone and LaserStream skeletons as not implemented", () => {
    const yellowstone = createYellowstoneClient({
      enabled: true,
      endpoint: "https://yellowstone.example.invalid?token=secret",
      authToken: "yellowstone-secret"
    });
    const laserstream = createLaserStreamClient({
      enabled: true,
      endpoint: "https://laserstream.example.invalid",
      apiKey: "laserstream-secret"
    });

    expect(yellowstone.getStatus().connectionState).toBe("not_implemented");
    expect(yellowstone.getStatus().reasonCodes).toContain(
      managedStreamClientReasonCodes.yellowstoneSkeleton
    );
    expect(JSON.stringify(yellowstone.getStatus())).not.toContain("yellowstone-secret");
    expect(laserstream.getStatus().connectionState).toBe("not_implemented");
    expect(laserstream.getStatus().reasonCodes).toContain(
      managedStreamClientReasonCodes.laserstreamSkeleton
    );
    expect(JSON.stringify(laserstream.getStatus())).not.toContain("laserstream-secret");
  });

  it("validates and masks real client configuration", () => {
    const invalid = validateManagedStreamClientConfig({
      kind: "yellowstone",
      enabled: true
    });
    const valid = validateManagedStreamClientConfig({
      kind: "laserstream",
      enabled: true,
      endpoint: "https://laserstream.example.invalid?api_key=secret",
      apiKey: "secret"
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.reasonCodes).toContain(
      managedStreamClientReasonCodes.endpointMissing
    );
    expect(invalid.reasonCodes).toContain(managedStreamClientReasonCodes.authMissing);
    expect(valid.ok).toBe(true);
    expect(valid.endpointMasked).toContain("api_key=****");
    expect(valid.authMasked).toBe("configured:6");
    expect(JSON.stringify(valid)).not.toContain("secret");
  });

  it("builds sanitized Yellowstone and LaserStream subscription previews", () => {
    const yellowstone = buildYellowstoneSubscriptionRequest(baseSubscription);
    const laserstream = buildLaserStreamSubscriptionRequest({
      ...baseSubscription,
      provider: "laserstream"
    });

    expect(yellowstone.provider).toBe("yellowstone");
    expect(yellowstone.request).toMatchObject({
      provider: "yellowstone",
      commitment: "confirmed"
    });
    expect(yellowstone.reasonCodes).toContain(
      managedStreamClientReasonCodes.subscriptionBuilt
    );
    expect(JSON.stringify(yellowstone)).not.toContain("secret");
    expect(laserstream.provider).toBe("laserstream");
    expect(laserstream.request).toMatchObject({
      provider: "laserstream",
      filters: {
        transactions: {
          enabled: true
        }
      }
    });
    expect(JSON.stringify(laserstream)).not.toContain("secret");
  });

  it("builds SDK-shaped LaserStream transaction subscriptions", () => {
    const request = buildLaserStreamSdkSubscriptionRequest({
      ...baseSubscription,
      provider: "laserstream"
    });

    expect(request).toMatchObject({
      commitment: "confirmed",
      transactions: {
        axi_pumpfun_transactions: {
          vote: false,
          failed: false,
          accountInclude: ["FakeProgram111111111111111111111111111111111"]
        }
      }
    });
  });

  it("evaluates real LaserStream gates without exposing secrets", () => {
    const blocked = evaluateLaserStreamRealReadiness({});
    const ready = evaluateLaserStreamRealReadiness({
      allowRealConnection: true,
      realConnectionAck: true,
      realProvider: "laserstream",
      enabled: true,
      endpoint: "https://laserstream.example.invalid?api-key=secret",
      apiKey: "laserstream-secret"
    });

    expect(blocked.canConnect).toBe(false);
    expect(blocked.reasonCodes).toContain(
      managedStreamClientReasonCodes.realStreamDisabled
    );
    expect(blocked.reasonCodes).toContain(
      managedStreamClientReasonCodes.realStreamAckMissing
    );
    expect(ready.canConnect).toBe(true);
    expect(ready.reasonCodes).toContain(
      managedStreamClientReasonCodes.laserstreamReadyToConnect
    );
    expect(ready.maskedConfig.endpointMasked).toContain("api-key=****");
    expect(ready.maskedConfig.apiKeyMasked).toBe("configured:18");
    expect(JSON.stringify(ready)).not.toContain("laserstream-secret");
  });

  it("uses injected mock transport without opening a real network connection", async () => {
    const transport = createMockManagedStreamTransport({
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });
    const client = createYellowstoneClient({
      enabled: true,
      endpoint: "https://yellowstone.example.invalid",
      authToken: "secret",
      transport,
      subscriptionConfig: baseSubscription
    });
    const signatures: Array<string | null | undefined> = [];

    client.onEnvelope((envelope) => {
      signatures.push(envelope.signature);
    });

    await client.start();
    transport.emitMessage({
      streamType: "transaction",
      signature: "Sig111",
      slot: 42,
      transaction: {}
    });

    const status = client.getStatus();

    expect(transport.sentMessages).toHaveLength(1);
    expect(status.connectionState).toBe("connected");
    expect(status.receivedCount).toBe(1);
    expect(status.transactionCount).toBe(1);
    expect(status.reasonCodes).toContain(
      managedStreamClientReasonCodes.transportConnected
    );
    expect(status.reasonCodes).toContain(
      managedStreamClientReasonCodes.messageReceived
    );
    expect(signatures).toEqual(["Sig111"]);
  });

  it("blocks real LaserStream transport unless every gate is explicit", async () => {
    const transport = createMockManagedStreamTransport();
    const client = createLaserStreamRealClient({
      enabled: true,
      endpoint: "https://laserstream.example.invalid",
      apiKey: "laserstream-secret",
      transport
    });

    await client.start();

    expect(client.getStatus().connectionState).toBe("blocked");
    expect(client.getStatus().reasonCodes).toContain(
      managedStreamClientReasonCodes.realStreamDisabled
    );
    expect(transport.getStatus().connected).toBe(false);
    expect(transport.sentMessages).toHaveLength(0);
  });

  it("connects a gated LaserStream mock transport and normalizes tx messages", async () => {
    const transport = createMockManagedStreamTransport({
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });
    const client = createLaserStreamRealClient({
      allowRealConnection: true,
      realConnectionAck: true,
      realProvider: "laserstream",
      enabled: true,
      endpoint: "https://laserstream.example.invalid",
      apiKey: "laserstream-secret",
      transport,
      maxMessagesPerSession: 1,
      maxRuntimeMs: 100000,
      subscriptionConfig: {
        ...baseSubscription,
        provider: "laserstream"
      }
    });
    const envelopes: Array<{ signature?: string | null; accountKeys?: string[] }> =
      [];

    client.onEnvelope((envelope) => {
      envelopes.push({
        signature: envelope.signature ?? null,
        accountKeys: envelope.accountKeys ?? []
      });
    });

    await client.start();
    transport.emitMessage({
      transaction: {
        signature: "LaserSig111",
        slot: 99,
        transaction: {
          message: {
            accountKeys: ["Account111111111111111111111111111111111"]
          }
        },
        meta: {
          logMessages: ["Program log: hello"],
          err: null
        }
      }
    });
    await Promise.resolve();

    const status = client.getStatus();

    expect(transport.sentMessages[0]).toMatchObject({
      commitment: "confirmed",
      transactions: {
        axi_pumpfun_transactions: {
          accountInclude: ["FakeProgram111111111111111111111111111111111"]
        }
      }
    });
    expect(envelopes).toEqual([
      {
        signature: "LaserSig111",
        accountKeys: ["Account111111111111111111111111111111111"]
      }
    ]);
    expect(status.receivedCount).toBe(1);
    expect(status.transactionCount).toBe(1);
    expect(status.connectionState).toBe("disconnected");
    expect(status.reasonCodes).toContain(
      managedStreamClientReasonCodes.laserstreamSessionLimitReached
    );
    expect(JSON.stringify(status)).not.toContain("laserstream-secret");
  });

  it("stops a gated LaserStream session at the runtime limit", async () => {
    const transport = createMockManagedStreamTransport();
    const runtime = { handler: null as (() => void) | null };
    const client = createLaserStreamRealClient({
      allowRealConnection: true,
      realConnectionAck: true,
      realProvider: "laserstream",
      enabled: true,
      endpoint: "https://laserstream.example.invalid",
      apiKey: "laserstream-secret",
      transport,
      maxRuntimeMs: 1000,
      setTimeout: (handler) => {
        runtime.handler = handler;
        return "timer";
      },
      clearTimeout: () => undefined
    });

    await client.start();
    expect(runtime.handler).not.toBeNull();
    runtime.handler?.();
    await Promise.resolve();

    expect(client.getStatus().connectionState).toBe("disconnected");
    expect(client.getStatus().reasonCodes).toContain(
      managedStreamClientReasonCodes.laserstreamRuntimeLimitReached
    );
  });

  it("reports a clear SDK boundary when gates are open but SDK is unavailable", async () => {
    const client = createLaserStreamRealClient({
      allowRealConnection: true,
      realConnectionAck: true,
      realProvider: "laserstream",
      enabled: true,
      endpoint: "https://laserstream.example.invalid",
      apiKey: "laserstream-secret",
      sdkLoader: async () => ({})
    });

    await client.start();

    expect(client.getStatus().connectionState).toBe("not_implemented");
    expect(client.getStatus().reasonCodes).toContain(
      managedStreamClientReasonCodes.sdkNotInstalledOrNotImplemented
    );
  });

  it("creates disabled and not implemented clients directly", () => {
    const disabled = createDisabledManagedStreamClient("laserstream");
    const notImplemented = createNotImplementedManagedStreamClient("yellowstone");

    expect(disabled.getStatus().connectionState).toBe("disabled");
    expect(notImplemented.getStatus().connectionState).toBe("not_implemented");
  });

  it("creates clients through the factory", () => {
    const factory = createManagedStreamClientFactory({
      enabled: true,
      endpoint: "https://yellowstone.example.invalid",
      authToken: "secret"
    });
    const client = factory.createYellowstoneClient();

    expect(client.getStatus().kind).toBe("yellowstone");
    expect(client.getStatus().connectionState).toBe("not_implemented");
  });

  it("builds subscription profiles without authoritative Pump.fun IDs", () => {
    const placeholder = buildManagedStreamSubscriptionProfile(
      "pumpfun_program_transactions",
      {
        provider: "yellowstone"
      }
    );
    const supplied = buildManagedStreamSubscriptionProfile(
      "laserstream_pumpfun_transactions",
      {
        provider: "laserstream",
        programIds: [
          "FakePumpfunProgram111111111111111111111111111",
          "FakePumpswapProgram11111111111111111111111111"
        ],
        watchedAddresses: ["FakeWatched111111111111111111111111111111"]
      }
    );
    const healthcheck = buildManagedStreamSubscriptionProfile("minimal_healthcheck", {
      provider: "yellowstone"
    });

    expect(placeholder.reasonCodes).toContain(
      managedStreamProfileReasonCodes.profileRequiresProgramIds
    );
    expect(placeholder.subscriptionConfig.transactions.accountInclude).toEqual([]);
    expect(supplied.subscriptionSummary.transactionAccountIncludeCount).toBe(2);
    expect(supplied.subscriptionSummary.transactionAccountRequiredCount).toBe(1);
    expect(healthcheck.subscriptionConfig.slots.enabled).toBe(true);
    expect(healthcheck.subscriptionConfig.transactions.enabled).toBe(false);
  });
});
