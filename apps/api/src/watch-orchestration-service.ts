import type { FeedEvent } from "@axi/data-feeds";
import type { WatchPlanSummary } from "@axi/shared";
import {
  createWatchPlan,
  type CandidateWatchPlan,
  type WatchOrchestratorOptions,
  type WatchTarget
} from "@axi/watch-orchestrator";
import {
  getLatestWatchPlan,
  getStorageStats,
  listWatchActions,
  listWatchActionsByMint,
  listWatchPlans,
  saveWatchAction,
  saveWatchPlan
} from "@axi/storage";
import type { ChainEventsService } from "./chain-events-service";
import type { ChainVerifierService } from "./chain-verifier";

export type WatchOrchestrationServiceOptions = WatchOrchestratorOptions & {
  chainEvents: ChainEventsService;
  chainVerifier: ChainVerifierService;
  logger?: {
    warn?: (message: string, context?: Record<string, unknown>) => void;
  };
  scheduleVerification?: (mint: string, event?: FeedEvent) => void;
};

export type WatchOrchestrationStatus = {
  enabled: boolean;
  verifyOnNewToken: boolean;
  verifyOnMigration: boolean;
  watchOnNewToken: boolean;
  watchOnMigration: boolean;
  maxTargetsPerCandidate: number;
  minConfidenceToWatch: "low" | "medium" | "high";
  chainVerifierEnabled: boolean;
  chainVerifierConfigured: boolean;
  chainEventsEnabled: boolean;
  chainEventsConfigured: boolean;
  watchedAddressCount: number;
  watchPlanCount: number;
  watchActionCount: number;
  paperOnly: true;
};

type CandidateContext = {
  mint: string;
  symbol?: string;
  source?: string;
};

type ManualPlanInput = {
  event?: unknown;
  mint: string;
  source?: string | undefined;
};

type NormalizedConfig = {
  enabled: boolean;
  maxTargetsPerCandidate: number;
  allowMintWatch: boolean;
  allowBondingCurveWatch: boolean;
  allowPoolWatch: boolean;
  allowProgramWatch: boolean;
  allowWalletWatch: boolean;
  minConfidenceToWatch: "low" | "medium" | "high";
  verifyOnNewToken: boolean;
  verifyOnMigration: boolean;
  watchOnNewToken: boolean;
  watchOnMigration: boolean;
  now: () => Date;
};

const defaultConfig: NormalizedConfig = {
  enabled: false,
  maxTargetsPerCandidate: 3,
  allowMintWatch: true,
  allowBondingCurveWatch: true,
  allowPoolWatch: true,
  allowProgramWatch: false,
  allowWalletWatch: false,
  minConfidenceToWatch: "medium",
  verifyOnNewToken: false,
  verifyOnMigration: false,
  watchOnNewToken: false,
  watchOnMigration: false,
  now: () => new Date()
};

export class WatchOrchestrationService {
  private readonly chainEvents: ChainEventsService;
  private readonly chainVerifier: ChainVerifierService;
  private readonly config: NormalizedConfig;
  private readonly logger: WatchOrchestrationServiceOptions["logger"];
  private readonly scheduleVerification:
    | ((mint: string, event?: FeedEvent) => void)
    | undefined;

  constructor(options: WatchOrchestrationServiceOptions) {
    this.chainEvents = options.chainEvents;
    this.chainVerifier = options.chainVerifier;
    this.config = {
      ...defaultConfig,
      ...options,
      maxTargetsPerCandidate: Math.max(
        1,
        options.maxTargetsPerCandidate ?? defaultConfig.maxTargetsPerCandidate
      ),
      now: options.now ?? defaultConfig.now
    };
    this.logger = options.logger;
    this.scheduleVerification = options.scheduleVerification;
  }

  handleFeedEvent(
    event: FeedEvent,
    candidateContext: CandidateContext
  ): CandidateWatchPlan | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const plan = withPlanReasonCodes(
      createWatchPlan({
        candidate: candidateContext,
        event,
        options: this.config
      }),
      ["ORCHESTRATION_PLAN_CREATED"]
    );

    saveWatchPlan({
      ...plan,
      payload: {
        event,
        plan
      }
    });
    this.executePlan(plan, event);

    return plan;
  }

  createManualPlan(input: ManualPlanInput): CandidateWatchPlan {
    const event = isFeedEvent(input.event) ? input.event : undefined;
    const plan = withPlanReasonCodes(
      createWatchPlan({
        ...(event ? { event } : {}),
        mint: input.mint,
        options: this.config,
        rawPayload: event ? undefined : input.event,
        source: input.source ?? "manual"
      }),
      this.config.enabled
        ? ["ORCHESTRATION_PLAN_CREATED"]
        : ["ORCHESTRATION_DISABLED"]
    );

    saveWatchPlan({
      ...plan,
      payload: {
        event: input.event,
        manual: true,
        plan
      }
    });

    if (this.config.enabled) {
      this.executePlan(plan, event);
    }

    return plan;
  }

  getStatus(): WatchOrchestrationStatus {
    const stats = getStorageStats();
    const chainVerifierStatus = this.chainVerifier.getStatus();
    const chainEventsStatus = this.chainEvents.getStatus();

    return {
      enabled: this.config.enabled,
      verifyOnNewToken: this.config.verifyOnNewToken,
      verifyOnMigration: this.config.verifyOnMigration,
      watchOnNewToken: this.config.watchOnNewToken,
      watchOnMigration: this.config.watchOnMigration,
      maxTargetsPerCandidate: this.config.maxTargetsPerCandidate,
      minConfidenceToWatch: this.config.minConfidenceToWatch,
      chainVerifierEnabled: chainVerifierStatus.enabled,
      chainVerifierConfigured: chainVerifierStatus.configured,
      chainEventsEnabled: chainEventsStatus.enabled,
      chainEventsConfigured: chainEventsStatus.configured,
      watchedAddressCount: chainEventsStatus.watchedAddressCount,
      watchPlanCount: stats.watchPlanCount,
      watchActionCount: stats.watchActionCount,
      paperOnly: true
    };
  }

  getWatchPlans(limit = 50): ReturnType<typeof listWatchPlans> {
    return listWatchPlans(limit);
  }

  getWatchPlan(mint: string): ReturnType<typeof getLatestWatchPlan> {
    return getLatestWatchPlan(mint);
  }

  getRecentActions(limit = 50): ReturnType<typeof listWatchActions> {
    return listWatchActions(limit);
  }

  getRecentActionsByMint(
    mint: string,
    limit = 50
  ): ReturnType<typeof listWatchActionsByMint> {
    return listWatchActionsByMint(mint, limit);
  }

  clear(): void {
    // Persistent watch history is intentionally not deleted by this service.
  }

  private executePlan(plan: CandidateWatchPlan, event: FeedEvent | undefined): void {
    this.executeVerification(plan, event);
    this.executeWatchTargets(plan);
  }

  private executeVerification(
    plan: CandidateWatchPlan,
    event: FeedEvent | undefined
  ): void {
    if (!plan.shouldVerifyMint) {
      return;
    }

    const status = this.chainVerifier.getStatus();

    if (!status.enabled) {
      saveWatchAction({
        mint: plan.mint,
        action: "verify_mint",
        address: plan.mint,
        addressKind: "mint",
        status: "skipped",
        reasonCodes: ["ORCHESTRATION_VERIFICATION_SKIPPED_DISABLED"],
        payload: {
          chainVerifier: status,
          plan
        },
        createdAt: plan.createdAt
      });
      return;
    }

    if (!status.configured || status.status !== "ready") {
      saveWatchAction({
        mint: plan.mint,
        action: "verify_mint",
        address: plan.mint,
        addressKind: "mint",
        status: "skipped",
        reasonCodes: ["ORCHESTRATION_WATCH_SKIPPED_CONFIG"],
        payload: {
          chainVerifier: status,
          plan
        },
        createdAt: plan.createdAt
      });
      return;
    }

    saveWatchAction({
      mint: plan.mint,
      action: "verify_mint",
      address: plan.mint,
      addressKind: "mint",
      status: "scheduled",
      reasonCodes: ["ORCHESTRATION_VERIFICATION_SCHEDULED"],
      payload: {
        plan
      },
      createdAt: plan.createdAt
    });
    this.scheduleVerification?.(plan.mint, event);
  }

  private executeWatchTargets(plan: CandidateWatchPlan): void {
    if (!plan.shouldWatchEvents) {
      return;
    }

    const status = this.chainEvents.getStatus();

    for (const target of plan.watchTargets) {
      if (!status.enabled) {
        this.saveSkippedWatchAction({
          plan,
          reasonCodes: ["ORCHESTRATION_WATCH_SKIPPED_DISABLED"],
          status,
          target
        });
        continue;
      }

      if (!status.configured || !["ready", "running"].includes(status.status)) {
        this.saveSkippedWatchAction({
          plan,
          reasonCodes: ["ORCHESTRATION_WATCH_SKIPPED_CONFIG"],
          status,
          target
        });
        continue;
      }

      try {
        const watchInput = {
          address: target.address,
          kind: target.kind,
          ...(target.label ? { label: target.label } : {}),
          ...(target.mint ? { mint: target.mint } : {}),
          reasonCodes: uniqueReasonCodes([
            "ORCHESTRATION_WATCH_SCHEDULED",
            ...target.reasonCodes
          ]),
          source: "watch_orchestrator",
          ...(target.symbol ? { symbol: target.symbol } : {})
        };

        this.chainEvents.watchAddress(watchInput);
        saveWatchAction({
          mint: plan.mint,
          action: "watch_address",
          address: target.address,
          addressKind: target.kind,
          status: "scheduled",
          reasonCodes: ["ORCHESTRATION_WATCH_SCHEDULED"],
          payload: {
            plan,
            target
          },
          createdAt: plan.createdAt
        });
      } catch (error) {
        const reasonCodes = [
          error instanceof Error && error.message.includes("WATCH_LIMIT")
            ? "ORCHESTRATION_WATCH_LIMIT_REACHED"
            : "ORCHESTRATION_ERROR"
        ];
        saveWatchAction({
          mint: plan.mint,
          action: "watch_address",
          address: target.address,
          addressKind: target.kind,
          status: "error",
          reasonCodes,
          payload: {
            error: error instanceof Error ? error.message : String(error),
            plan,
            target
          },
          createdAt: plan.createdAt
        });
        this.logger?.warn?.("Watch orchestration action failed", {
          address: target.address,
          error: error instanceof Error ? error.message : String(error),
          mint: plan.mint
        });
      }
    }
  }

  private saveSkippedWatchAction(options: {
    plan: CandidateWatchPlan;
    reasonCodes: string[];
    status: unknown;
    target: WatchTarget;
  }): void {
    saveWatchAction({
      mint: options.plan.mint,
      action: "watch_address",
      address: options.target.address,
      addressKind: options.target.kind,
      status: "skipped",
      reasonCodes: options.reasonCodes,
      payload: {
        chainEvents: options.status,
        plan: options.plan,
        target: options.target
      },
      createdAt: options.plan.createdAt
    });
  }
}

export function createWatchOrchestrationService(
  options: WatchOrchestrationServiceOptions
): WatchOrchestrationService {
  return new WatchOrchestrationService(options);
}

export function createWatchPlanSummary(
  plan: CandidateWatchPlan
): WatchPlanSummary {
  return {
    shouldVerifyMint: plan.shouldVerifyMint,
    shouldWatchEvents: plan.shouldWatchEvents,
    selectedTargetCount: plan.watchTargets.length,
    skippedTargetCount: plan.skippedTargets.length,
    selectedTargets: plan.watchTargets.map((target) => ({
      address: target.address,
      kind: target.kind,
      confidence: target.confidence,
      reasonCodes: target.reasonCodes,
      source: target.source
    })),
    reasonCodes: plan.reasonCodes,
    createdAt: plan.createdAt
  };
}

function withPlanReasonCodes(
  plan: CandidateWatchPlan,
  reasonCodes: string[]
): CandidateWatchPlan {
  return {
    ...plan,
    reasonCodes: uniqueReasonCodes([...plan.reasonCodes, ...reasonCodes])
  };
}

function isFeedEvent(value: unknown): value is FeedEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value.type === "token_created" || value.type === "trade")
  );
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes));
}
