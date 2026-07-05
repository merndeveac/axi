import { describe, expect, it } from "vitest";
import {
  buildLightningEndpointUrl,
  createDisabledLightningClient,
  createLightningBuyPlan,
  createLightningSellPlan,
  createLightningTradeRequest,
  createPumpPortalLightningClient,
  maskApiKey,
  sanitizeLightningConfig,
  validateLightningTradeRequest
} from "../src/index";

const limits = {
  maxBuySol: 0.005,
  maxDailySol: 0.02,
  maxOpenPositions: 1,
  maxSlippagePct: 10,
  priorityFeeSol: 0.00005,
  pool: "auto",
  skipPreflight: false,
  jitoOnly: false
};

describe("@axi/pumpportal-lightning", () => {
  it("builds a buy request without sending anything", () => {
    const request = createLightningTradeRequest({
      action: "buy",
      mint: "So11111111111111111111111111111111111111112",
      amount: 0.001
    });

    expect(request.action).toBe("buy");
    expect(request.denominatedInSol).toBe(true);
    expect(request.pool).toBe("auto");
  });

  it("builds a sell request without sending anything", () => {
    const request = createLightningTradeRequest({
      action: "sell",
      mint: "So11111111111111111111111111111111111111112",
      amount: 25,
      denominatedInSol: false
    });

    expect(request.action).toBe("sell");
    expect(request.denominatedInSol).toBe(false);
  });

  it("validates amount and slippage caps", () => {
    const request = createLightningTradeRequest({
      action: "buy",
      mint: "So11111111111111111111111111111111111111112",
      amount: 0.02,
      slippage: 15
    });

    const checks = validateLightningTradeRequest(request, limits);

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "LIGHTNING_AMOUNT_EXCEEDS_MAX_BUY",
          passed: false
        }),
        expect.objectContaining({
          code: "LIGHTNING_SLIPPAGE_TOO_HIGH",
          passed: false
        }),
        expect.objectContaining({
          code: "LIGHTNING_ENDPOINT_NOT_CALLED",
          passed: true
        })
      ])
    );
  });

  it("creates dry-run buy and sell plans", () => {
    const buyPlan = createLightningBuyPlan({
      id: "buy-plan",
      mint: "So11111111111111111111111111111111111111112",
      amountSol: 0.001,
      limits
    });
    const sellPlan = createLightningSellPlan({
      id: "sell-plan",
      mint: "So11111111111111111111111111111111111111112",
      amountSol: 0.001,
      limits
    });

    expect(buyPlan.id).toBe("buy-plan");
    expect(buyPlan.blocked).toBe(false);
    expect(sellPlan.request.action).toBe("sell");
  });

  it("refuses execution through disabled clients", async () => {
    const disabled = createDisabledLightningClient();
    const client = createPumpPortalLightningClient({
      apiKey: "api-key-value",
      allowLiveTrading: true
    });
    const request = createLightningTradeRequest({
      action: "buy",
      mint: "So11111111111111111111111111111111111111112",
      amount: 0.001
    });

    await expect(disabled.executeTrade(request)).resolves.toMatchObject({
      executed: false,
      endpointCalled: false,
      reasonCodes: expect.arrayContaining(["LIGHTNING_EXECUTION_DISABLED"])
    });
    await expect(client.executeTrade(request)).resolves.toMatchObject({
      executed: false,
      endpointCalled: false
    });
  });

  it("masks API keys and keeps sanitized config secret-free", () => {
    const sanitized = sanitizeLightningConfig({
      apiKey: "abcdef1234567890",
      maxBuySol: 0.001
    });

    expect(maskApiKey("abcdef1234567890")).toBe("abcd...7890");
    expect(sanitized.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain("abcdef1234567890");
  });

  it("can build an internal endpoint URL without logging the key", () => {
    const url = buildLightningEndpointUrl(
      "https://pumpportal.fun/api/trade",
      "api-key-value"
    );

    expect(url).toContain("api-key=api-key-value");
    expect(maskApiKey("api-key-value")).toBe("api-...alue");
  });
});
