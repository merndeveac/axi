import { describe, expect, it, vi } from "vitest";
import type { SolanaChainClient } from "@axi/solana-chain";
import {
  createPumpPortalDataWalletConfig,
  createPumpPortalDataWalletService
} from "../src/pumpportal-data-wallet-service";

const publicKey = "So11111111111111111111111111111111111111112";

describe("PumpPortalDataWalletService", () => {
  it("reports safe missing-config defaults without secrets", () => {
    const service = createPumpPortalDataWalletService({
      config: createPumpPortalDataWalletConfig()
    });
    const status = service.getStatus();
    const serialized = JSON.stringify(status).toLowerCase();

    expect(status.apiKeyConfigured).toBe(false);
    expect(status.publicKeyConfigured).toBe(false);
    expect(status.balanceStatus).toBe("missing_config");
    expect(status.reasonCodes).toContain("DATA_WALLET_PUBLIC_KEY_MISSING");
    expect(status.reasonCodes).toContain("PUMPPORTAL_DATA_API_KEY_MISSING");
    expect(status.reasonCodes).toContain("PUMPPORTAL_API_KEY_MISSING");
    expect(serialized).not.toContain("privatekey");
    expect(serialized).not.toContain("api-key-value");
  });

  it("estimates metered event cost and remaining events", () => {
    const service = createPumpPortalDataWalletService({
      config: createPumpPortalDataWalletConfig({
        apiKeyConfigured: true,
        eventCostSolPer10000: 0.01,
        publicKey
      })
    });

    expect(service.estimateEventCost(25_000)).toBe(0.025);
    expect(service.estimateRemainingEvents(0.05)).toBe(50_000);
  });

  it("flags invalid public keys without calling RPC", async () => {
    const solanaClient = createMockSolanaClient(0.05);
    const service = createPumpPortalDataWalletService({
      config: createPumpPortalDataWalletConfig({
        apiKeyConfigured: true,
        publicKey: "INVALID_PUBLIC_KEY",
        rpcHttpUrl: "http://localhost:8899"
      }),
      solanaClient
    });

    const status = await service.refreshBalance({ force: true });

    expect(status.publicKeyValid).toBe(false);
    expect(status.balanceStatus).toBe("missing_config");
    expect(status.reasonCodes).toContain("DATA_WALLET_PUBLIC_KEY_INVALID");
    expect(solanaClient.getSolBalance).not.toHaveBeenCalled();
  });

  it("uses mocked read-only RPC balance for low-balance readiness", async () => {
    const service = createPumpPortalDataWalletService({
      config: createPumpPortalDataWalletConfig({
        apiKeyConfigured: true,
        publicKey,
        rpcHttpUrl: "http://localhost:8899"
      }),
      solanaClient: createMockSolanaClient(0.025)
    });

    const status = await service.refreshBalance({ force: true });

    expect(status.balanceSol).toBe(0.025);
    expect(status.balanceStatus).toBe("low");
    expect(status.estimatedEventsRemaining).toBe(25_000);
    expect(status.reasonCodes).toContain("DATA_WALLET_READY");
    expect(status.reasonCodes).toContain("DATA_WALLET_BALANCE_LOW");
  });

  it("blocks metered streams when verified balance is below minimum", async () => {
    const service = createPumpPortalDataWalletService({
      config: createPumpPortalDataWalletConfig({
        apiKeyConfigured: true,
        minBalanceSol: 0.02,
        publicKey,
        rpcHttpUrl: "http://localhost:8899"
      }),
      solanaClient: createMockSolanaClient(0.005)
    });

    await service.refreshBalance({ force: true });
    const readiness = service.getActualDataReadiness();

    expect(readiness.subscriptionBlockers).toContain(
      "DATA_WALLET_FUNDS_REQUIRED_FOR_METERED_STREAM"
    );
  });

  it("retains the last verified balance when a later RPC refresh fails", async () => {
    const solanaClient = createMockSolanaClient(0.025);
    solanaClient.getSolBalance.mockResolvedValueOnce({
      publicKey,
      balanceLamports: 25_000_000,
      balanceSol: 0.025,
      inspectedAt: "2026-01-01T00:00:00.000Z"
    });
    solanaClient.getSolBalance.mockResolvedValueOnce({
      publicKey,
      balanceLamports: null,
      balanceSol: null,
      inspectedAt: "2026-01-01T00:01:00.000Z",
      error: {
        code: "SOLANA_RPC_TIMEOUT",
        message: "RPC timed out",
        retryable: true
      }
    });
    const service = createPumpPortalDataWalletService({
      config: createPumpPortalDataWalletConfig({
        apiKeyConfigured: true,
        publicKey,
        rpcHttpUrl: "http://localhost:8899"
      }),
      solanaClient
    });

    await service.refreshBalance({ force: true });
    const status = await service.refreshBalance({ force: true });

    expect(status.balanceSol).toBe(0.025);
    expect(status.balanceLamports).toBe(25_000_000);
    expect(status.lastBalanceCheckAt).toBe("2026-01-01T00:00:00.000Z");
    expect(status.lastError).toContain("SOLANA_RPC_TIMEOUT");
    expect(status.reasonCodes).toContain("DATA_WALLET_BALANCE_LAST_KNOWN");
    expect(status.reasonCodes).toContain("DATA_WALLET_BALANCE_REFRESH_FAILED");
  });
});

function createMockSolanaClient(balanceSol: number) {
  return {
    getSolBalance: vi.fn(async () => ({
      publicKey,
      balanceLamports: Math.round(balanceSol * 1_000_000_000),
      balanceSol,
      inspectedAt: "2026-01-01T00:00:00.000Z"
    }))
  } as unknown as SolanaChainClient & {
    getSolBalance: ReturnType<typeof vi.fn>;
  };
}
