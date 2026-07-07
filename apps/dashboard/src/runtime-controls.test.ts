import { describe, expect, it } from "vitest";
import {
  getMeteredControlView,
  getMeteredRuntimeBlockers,
  getWalletSetupText
} from "./runtime-controls";

describe("runtime control view helpers", () => {
  it("blocks metered start with exact gate reasons", () => {
    const blockers = getMeteredRuntimeBlockers(
      {
        liveDiscovery: { connected: false, connecting: false },
        meteredLaunchData: {
          blocked: true,
          enabled: true,
          reasonCodes: ["METERED_DATA_ACK_MISSING"]
        },
        dataWallet: {
          apiKeyConfigured: false,
          balanceStatus: "unknown",
          publicKeyConfigured: false,
          reasonCodes: ["DATA_WALLET_BALANCE_UNKNOWN"]
        }
      },
      {
        acknowledgedCost: false,
        apiKeyConfigured: false,
        budgetReached: false,
        dataWalletBalanceStatus: "unknown",
        dataWalletConfigured: false,
        enabled: true,
        liveDiscoveryActive: false,
        ready: false
      }
    );

    expect(blockers).toEqual([
      "ACK missing",
      "API key missing",
      "wallet missing",
      "balance unknown",
      "live feed offline"
    ]);
  });

  it("enables metered start only when gates pass", () => {
    const view = getMeteredControlView({
      apiStatus: "connected",
      meteredStatus: {
        acknowledgedCost: true,
        apiKeyConfigured: true,
        budgetReached: false,
        dataWalletBalanceStatus: "ok",
        dataWalletConfigured: true,
        enabled: true,
        liveDiscoveryActive: true,
        ready: true,
        reasonCodes: []
      },
      pendingAction: "ready",
      runtimeStatus: {
        liveDiscovery: { connected: true, connecting: false },
        meteredLaunchData: {
          active: false,
          blocked: false,
          enabled: true,
          reasonCodes: []
        },
        dataWallet: {
          apiKeyConfigured: true,
          balanceStatus: "ok",
          publicKeyConfigured: true,
          reasonCodes: []
        }
      }
    });

    expect(view).toMatchObject({
      buttonLabel: "Start Metered",
      disabled: false,
      state: "READY"
    });
  });

  it("never needs a wallet setup hint when a public data wallet is configured", () => {
    expect(
      getWalletSetupText({
        dataWallet: {
          publicKeyConfigured: true
        }
      })
    ).toBeNull();
    expect(getWalletSetupText(null)).toBe("Run pnpm setup:pumpportal-data-env");
  });
});
