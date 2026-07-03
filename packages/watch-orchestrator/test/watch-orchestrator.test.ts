import { describe, expect, it } from "vitest";
import type { TokenCreatedEvent } from "@axi/data-feeds";
import {
  createWatchPlan,
  createWatchOrchestrator,
  extractWatchTargetsFromFeedEvent,
  extractWatchTargetsFromRawPumpPortalPayload,
  selectWatchTargetsForCandidate,
  shouldVerifyCandidateOnChain,
  shouldWatchCandidateOnChainEvents
} from "../src/index";

const mint = "So11111111111111111111111111111111111111112";
const bondingCurve = "11111111111111111111111111111111";
const pool = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const wallet = "SysvarRent111111111111111111111111111111111";
const program = "BPFLoaderUpgradeab1e11111111111111111111111";
const createdAt = "2026-01-01T00:00:00.000Z";

describe("@axi/watch-orchestrator", () => {
  it("disabled orchestrator creates skipped plan", () => {
    const plan = createWatchPlan({
      event: createEvent(),
      options: fixedOptions()
    });

    expect(plan.shouldVerifyMint).toBe(false);
    expect(plan.shouldWatchEvents).toBe(false);
    expect(plan.watchTargets).toHaveLength(0);
    expect(plan.skippedTargets.length).toBeGreaterThan(0);
    expect(plan.reasonCodes).toContain("WATCH_ORCHESTRATOR_DISABLED");
    expect(plan.reasonCodes).toContain("WATCH_PLAN_SKIPPED_DISABLED");
  });

  it("extracts mint target from normalized event", () => {
    const targets = extractWatchTargetsFromFeedEvent(createEvent(), fixedOptions());

    expect(targets.some((target) => target.address === mint)).toBe(true);
    expect(targets.find((target) => target.address === mint)?.kind).toBe("mint");
  });

  it("extracts bonding curve from raw PumpPortal event", () => {
    const targets = extractWatchTargetsFromRawPumpPortalPayload(
      {
        mint,
        bondingCurve
      },
      fixedOptions()
    );

    expect(targets.find((target) => target.address === bondingCurve)?.kind).toBe(
      "bonding_curve"
    );
    expect(
      targets.find((target) => target.address === bondingCurve)?.confidence
    ).toBe("high");
  });

  it("extracts pool target from migration-style payload", () => {
    const targets = extractWatchTargetsFromRawPumpPortalPayload(
      {
        txType: "migration",
        mint,
        poolAddress: pool
      },
      fixedOptions()
    );

    expect(targets.find((target) => target.address === pool)?.kind).toBe("pool");
  });

  it("skips invalid addresses", () => {
    const targets = extractWatchTargetsFromRawPumpPortalPayload(
      {
        mint: "not-a-solana-address",
        bondingCurve
      },
      fixedOptions()
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]?.address).toBe(bondingCurve);
  });

  it("de-duplicates duplicate addresses", () => {
    const extractedTargets = extractWatchTargetsFromRawPumpPortalPayload(
      {
        mint,
        tokenMint: mint,
        bondingCurve
      },
      fixedOptions()
    );
    const mintTarget = extractedTargets.find((target) => target.address === mint);

    expect(mintTarget).toBeDefined();

    const selected = selectWatchTargetsForCandidate({
      mint,
      options: fixedOptions({ enabled: true, watchOnNewToken: true }),
      targets: mintTarget ? [...extractedTargets, { ...mintTarget }] : extractedTargets
    });

    expect(selected.selectedTargets.filter((target) => target.address === mint)).toHaveLength(1);
    expect(selected.skippedTargets.some((target) =>
      target.reasonCodes.includes("WATCH_TARGET_DUPLICATE")
    )).toBe(true);
  });

  it("enforces maxTargetsPerCandidate", () => {
    const plan = createWatchPlan({
      event: createEvent({
        raw: {
          mint,
          bondingCurve,
          poolAddress: pool,
          program
        }
      }),
      options: fixedOptions({
        allowProgramWatch: true,
        enabled: true,
        maxTargetsPerCandidate: 2,
        watchOnNewToken: true
      })
    });

    expect(plan.watchTargets).toHaveLength(2);
    expect(plan.skippedTargets.some((target) =>
      target.reasonCodes.includes("WATCH_TARGET_LIMIT_REACHED")
    )).toBe(true);
  });

  it("skips wallet targets by default", () => {
    const plan = createWatchPlan({
      event: createEvent({
        creator: wallet
      }),
      options: fixedOptions({
        enabled: true,
        minConfidenceToWatch: "low",
        watchOnNewToken: true
      })
    });

    expect(plan.watchTargets.some((target) => target.kind === "wallet")).toBe(false);
    expect(plan.skippedTargets.some((target) => target.kind === "wallet")).toBe(true);
  });

  it("includes wallet targets only when allowWalletWatch=true", () => {
    const plan = createWatchPlan({
      event: createEvent({
        creator: wallet
      }),
      options: fixedOptions({
        allowWalletWatch: true,
        enabled: true,
        minConfidenceToWatch: "low",
        watchOnNewToken: true
      })
    });

    expect(plan.watchTargets.some((target) => target.kind === "wallet")).toBe(true);
  });

  it("verifyOnNewToken sets shouldVerifyMint", () => {
    const plan = createWatchPlan({
      event: createEvent(),
      options: fixedOptions({
        enabled: true,
        verifyOnNewToken: true
      })
    });

    expect(shouldVerifyCandidateOnChain({
      event: createEvent(),
      options: fixedOptions({ enabled: true, verifyOnNewToken: true })
    })).toBe(true);
    expect(plan.shouldVerifyMint).toBe(true);
    expect(plan.reasonCodes).toContain("VERIFY_ON_NEW_TOKEN");
  });

  it("watchOnNewToken sets shouldWatchEvents", () => {
    const plan = createWatchPlan({
      event: createEvent(),
      options: fixedOptions({
        enabled: true,
        watchOnNewToken: true
      })
    });

    expect(shouldWatchCandidateOnChainEvents({
      event: createEvent(),
      options: fixedOptions({ enabled: true, watchOnNewToken: true })
    })).toBe(true);
    expect(plan.shouldWatchEvents).toBe(true);
    expect(plan.reasonCodes).toContain("WATCH_ON_NEW_TOKEN");
  });

  it("watchOnNewToken=false prevents event watching", () => {
    const plan = createWatchPlan({
      event: createEvent(),
      options: fixedOptions({
        enabled: true,
        watchOnNewToken: false
      })
    });

    expect(plan.shouldWatchEvents).toBe(false);
    expect(plan.watchTargets).toHaveLength(0);
  });

  it("minConfidenceToWatch filters low-confidence targets", () => {
    const plan = createWatchPlan({
      event: createEvent({
        creator: wallet
      }),
      options: fixedOptions({
        allowWalletWatch: true,
        enabled: true,
        minConfidenceToWatch: "medium",
        watchOnNewToken: true
      })
    });

    expect(plan.watchTargets.some((target) => target.kind === "wallet")).toBe(false);
    expect(plan.skippedTargets.some((target) =>
      target.reasonCodes.includes("WATCH_TARGET_LOW_CONFIDENCE")
    )).toBe(true);
  });

  it("plan reason codes are explicit", () => {
    const orchestrator = createWatchOrchestrator(
      fixedOptions({
        enabled: true,
        verifyOnNewToken: true,
        watchOnNewToken: true
      })
    );
    const plan = orchestrator.createWatchPlan({
      event: createEvent()
    });

    expect(plan.reasonCodes).toContain("WATCH_PLAN_CREATED");
    expect(plan.reasonCodes).toContain("WATCH_TARGET_SELECTED");
    expect(plan.reasonCodes).toContain("VERIFY_ON_NEW_TOKEN");
    expect(plan.reasonCodes).toContain("WATCH_ON_NEW_TOKEN");
  });
});

function createEvent(
  overrides: Partial<TokenCreatedEvent> = {}
): TokenCreatedEvent {
  return {
    type: "token_created",
    candidate: {
      id: {
        chain: "solana",
        mint
      },
      mint,
      symbol: "PORTAL",
      name: "Portal Token",
      source: "pumpportal",
      ageSeconds: 0,
      firstSeenAt: createdAt
    },
    metrics: {
      priceUsd: 0,
      marketCapUsd: 0,
      liquidityUsd: 0,
      volume1mUsd: 0,
      volume5mUsd: 0,
      volume15mUsd: 0,
      buyCount1m: 0,
      buyCount5m: 0,
      sellCount1m: 0,
      sellCount5m: 0,
      uniqueBuyers1m: 0,
      uniqueBuyers5m: 0,
      uniqueSellers1m: 0,
      uniqueSellers5m: 0,
      holderCount: 0,
      topHolderPercent: 0,
      top10HolderPercent: 0,
      priceChange1mPct: 0,
      priceChange5mPct: 0,
      volumeVelocity: 0,
      buyerVelocity: 0
    },
    metricsComplete: false,
    raw: {
      mint
    },
    rawSourceEventType: "new_token",
    receivedAt: createdAt,
    riskFlags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      topHolderConcentrationHigh: false,
      mutableMetadata: false,
      suspiciousName: false,
      lowLiquidity: true,
      washTradingSuspected: false,
      honeypotSuspected: false
    },
    source: "pumpportal",
    timestamp: createdAt,
    ...overrides
  };
}

function fixedOptions(
  overrides: Parameters<typeof createWatchPlan>[0]["options"] = {}
) {
  return {
    now: () => new Date(createdAt),
    ...overrides
  };
}
