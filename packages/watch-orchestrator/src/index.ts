import type { FeedEvent } from "@axi/data-feeds";
import {
  isValidSolanaAddress,
  type WatchedAddressKind
} from "@axi/chain-events";

export type WatchTargetKind = WatchedAddressKind;
export type WatchTargetSource =
  | "mock"
  | "pumpportal"
  | "manual"
  | "derived"
  | "unknown";
export type WatchTargetConfidence = "low" | "medium" | "high";
export type WatchEventPhase = "new_token" | "migration" | "trade" | "unknown";

export type WatchTarget = {
  address: string;
  kind: WatchTargetKind;
  mint?: string | undefined;
  symbol?: string | undefined;
  label?: string | undefined;
  source: WatchTargetSource;
  confidence: WatchTargetConfidence;
  reasonCodes: string[];
  createdAt: string;
};

export type CandidateWatchPlan = {
  mint: string;
  symbol?: string | undefined;
  source?: WatchTargetSource | undefined;
  shouldVerifyMint: boolean;
  shouldWatchEvents: boolean;
  watchTargets: WatchTarget[];
  skippedTargets: WatchTarget[];
  reasonCodes: string[];
  createdAt: string;
};

export type WatchOrchestratorOptions = {
  enabled?: boolean;
  maxTargetsPerCandidate?: number;
  allowMintWatch?: boolean;
  allowBondingCurveWatch?: boolean;
  allowPoolWatch?: boolean;
  allowProgramWatch?: boolean;
  allowWalletWatch?: boolean;
  minConfidenceToWatch?: WatchTargetConfidence;
  verifyOnNewToken?: boolean;
  verifyOnMigration?: boolean;
  watchOnNewToken?: boolean;
  watchOnMigration?: boolean;
  now?: () => Date;
};

export type CandidateWatchContext = {
  mint: string;
  symbol?: string | undefined;
  source?: string | undefined;
};

export type SelectWatchTargetsInput = {
  mint: string;
  options?: WatchOrchestratorOptions;
  targets: WatchTarget[];
};

export type SelectWatchTargetsResult = {
  selectedTargets: WatchTarget[];
  skippedTargets: WatchTarget[];
  reasonCodes: string[];
};

export type WatchDecisionInput = {
  event?: FeedEvent | undefined;
  eventPhase?: WatchEventPhase;
  options?: WatchOrchestratorOptions;
  rawSourceEventType?: string | undefined;
};

export type CreateWatchPlanInput = {
  candidate?: CandidateWatchContext | undefined;
  event?: FeedEvent | undefined;
  mint?: string | undefined;
  options?: WatchOrchestratorOptions;
  rawPayload?: unknown;
  source?: string | undefined;
  symbol?: string | undefined;
};

type NormalizedOptions = Required<
  Omit<WatchOrchestratorOptions, "now">
> & {
  now: () => Date;
};

type RawExtractionResult = {
  reasonCodes: string[];
  targets: WatchTarget[];
};

const defaultMaxTargetsPerCandidate = 3;

export class WatchOrchestrator {
  private readonly options: NormalizedOptions;

  constructor(options: WatchOrchestratorOptions = {}) {
    this.options = normalizeOptions(options);
  }

  extractWatchTargetsFromFeedEvent(event: FeedEvent): WatchTarget[] {
    return extractWatchTargetsFromFeedEvent(event, this.options);
  }

  createWatchPlan(input: Omit<CreateWatchPlanInput, "options">): CandidateWatchPlan {
    return createWatchPlan({
      ...input,
      options: this.options
    });
  }

  getOptions(): NormalizedOptions {
    return { ...this.options };
  }
}

export function createWatchOrchestrator(
  options: WatchOrchestratorOptions = {}
): WatchOrchestrator {
  return new WatchOrchestrator(options);
}

export function extractWatchTargetsFromFeedEvent(
  event: FeedEvent,
  options: WatchOrchestratorOptions = {}
): WatchTarget[] {
  const config = normalizeOptions(options);
  const createdAt = getEventTimestamp(event) ?? config.now().toISOString();
  const source = normalizeSource(event.source);
  const mint = getEventMint(event);
  const symbol = getEventSymbol(event);
  const targets: WatchTarget[] = [];

  addTarget(targets, {
    address: mint,
    confidence: "medium",
    createdAt,
    kind: "mint",
    mint,
    reasonCodes: ["WATCH_TARGET_MINT", "WATCH_TARGET_MEDIUM_CONFIDENCE"],
    source,
    symbol
  });

  if ("bondingCurve" in event && event.bondingCurve) {
    addTarget(targets, {
      address: event.bondingCurve,
      confidence: "high",
      createdAt,
      kind: "bonding_curve",
      mint,
      reasonCodes: [
        "WATCH_TARGET_BONDING_CURVE",
        "WATCH_TARGET_HIGH_CONFIDENCE"
      ],
      source,
      symbol
    });
  }

  if ("creator" in event && event.creator) {
    addTarget(targets, {
      address: event.creator,
      confidence: "low",
      createdAt,
      kind: "wallet",
      mint,
      reasonCodes: ["WATCH_TARGET_WALLET", "WATCH_TARGET_LOW_CONFIDENCE"],
      source,
      symbol
    });
  }

  if (event.type === "trade" && event.trader) {
    addTarget(targets, {
      address: event.trader,
      confidence: "low",
      createdAt,
      kind: "wallet",
      mint,
      reasonCodes: ["WATCH_TARGET_WALLET", "WATCH_TARGET_LOW_CONFIDENCE"],
      source,
      symbol
    });
  }

  if (event.raw) {
    targets.push(
      ...extractWatchTargetsFromRawPumpPortalPayload(event.raw, {
        ...config,
        now: () => new Date(createdAt)
      }).map((target) => ({
        ...target,
        mint: target.mint ?? mint,
        symbol: target.symbol ?? symbol
      }))
    );
  }

  return dedupeTargets(targets).selectedTargets;
}

export function extractWatchTargetsFromRawPumpPortalPayload(
  payload: unknown,
  options: WatchOrchestratorOptions = {}
): WatchTarget[] {
  return extractRawWatchTargets(payload, normalizeOptions(options)).targets;
}

export function selectWatchTargetsForCandidate(
  input: SelectWatchTargetsInput
): SelectWatchTargetsResult {
  const config = normalizeOptions(input.options);
  const sorted = [...input.targets].sort(compareTargetPreference);
  const deduped = dedupeTargets(sorted);
  const selectedTargets: WatchTarget[] = [];
  const skippedTargets: WatchTarget[] = [...deduped.skippedTargets];
  const reasonCodes = [...deduped.reasonCodes];

  for (const target of deduped.selectedTargets) {
    const targetReasonCodes = [...target.reasonCodes];

    if (!isKindAllowed(target.kind, config)) {
      skippedTargets.push(
        withTargetReasonCodes(target, [
          "WATCH_TARGET_SKIPPED",
          kindReasonCode(target.kind)
        ])
      );
      reasonCodes.push("WATCH_TARGET_SKIPPED", kindReasonCode(target.kind));
      continue;
    }

    if (compareConfidence(target.confidence, config.minConfidenceToWatch) < 0) {
      skippedTargets.push(
        withTargetReasonCodes(target, [
          "WATCH_TARGET_LOW_CONFIDENCE",
          "WATCH_TARGET_SKIPPED"
        ])
      );
      reasonCodes.push("WATCH_TARGET_LOW_CONFIDENCE", "WATCH_TARGET_SKIPPED");
      continue;
    }

    if (selectedTargets.length >= config.maxTargetsPerCandidate) {
      skippedTargets.push(
        withTargetReasonCodes(target, [
          "WATCH_TARGET_LIMIT_REACHED",
          "WATCH_TARGET_SKIPPED"
        ])
      );
      reasonCodes.push("WATCH_TARGET_LIMIT_REACHED", "WATCH_TARGET_SKIPPED");
      continue;
    }

    selectedTargets.push(
      withTargetReasonCodes(target, [
        "WATCH_TARGET_SELECTED",
        ...targetReasonCodes
      ])
    );
    reasonCodes.push("WATCH_TARGET_SELECTED");
  }

  return {
    selectedTargets,
    skippedTargets,
    reasonCodes: uniqueReasonCodes(reasonCodes)
  };
}

export function shouldVerifyCandidateOnChain(
  input: WatchDecisionInput
): boolean {
  const config = normalizeOptions(input.options);

  if (!config.enabled) {
    return false;
  }

  const phase = resolveEventPhase(input);
  return (
    (phase === "new_token" && config.verifyOnNewToken) ||
    (phase === "migration" && config.verifyOnMigration)
  );
}

export function shouldWatchCandidateOnChainEvents(
  input: WatchDecisionInput
): boolean {
  const config = normalizeOptions(input.options);

  if (!config.enabled) {
    return false;
  }

  const phase = resolveEventPhase(input);
  return (
    (phase === "new_token" && config.watchOnNewToken) ||
    (phase === "migration" && config.watchOnMigration)
  );
}

export function createWatchPlan(
  input: CreateWatchPlanInput
): CandidateWatchPlan {
  const config = normalizeOptions(input.options);
  const event = input.event;
  const createdAt =
    (event ? getEventTimestamp(event) : undefined) ?? config.now().toISOString();
  const rawPayload = input.rawPayload ?? event?.raw;
  const mint = input.mint ?? input.candidate?.mint ?? (event ? getEventMint(event) : "");
  const symbol =
    input.symbol ?? input.candidate?.symbol ?? (event ? getEventSymbol(event) : undefined);
  const source = normalizeSource(
    input.source ?? input.candidate?.source ?? event?.source
  );
  const rawExtraction = rawPayload
    ? extractRawWatchTargets(rawPayload, {
        ...config,
        now: () => new Date(createdAt)
      })
    : { reasonCodes: ["RAW_PAYLOAD_NO_WATCH_TARGETS"], targets: [] };
  const eventTargets = event
    ? extractWatchTargetsFromFeedEvent(event, {
        ...config,
        now: () => new Date(createdAt)
      })
    : [];
  const rawTargets = event ? [] : rawExtraction.targets;
  const manualMintTarget = !event && mint
    ? createTarget({
        address: mint,
        confidence: "medium",
        createdAt,
        kind: "mint",
        mint,
        reasonCodes: ["WATCH_TARGET_MINT", "WATCH_TARGET_MEDIUM_CONFIDENCE"],
        source,
        symbol
      })
    : undefined;
  const targets = [
    ...eventTargets,
    ...rawTargets,
    ...(manualMintTarget ? [manualMintTarget] : [])
  ].map((target) => ({
    ...target,
    mint: target.mint ?? mint,
    symbol: target.symbol ?? symbol
  }));
  const phase = resolveEventPhase({
    event,
    rawSourceEventType: event?.rawSourceEventType
  });
  const shouldVerifyMint = shouldVerifyCandidateOnChain({
    event,
    eventPhase: phase,
    options: config
  });
  const shouldWatchEvents = shouldWatchCandidateOnChainEvents({
    event,
    eventPhase: phase,
    options: config
  });

  if (!config.enabled) {
    return {
      mint,
      ...(symbol ? { symbol } : {}),
      source,
      shouldVerifyMint: false,
      shouldWatchEvents: false,
      watchTargets: [],
      skippedTargets: targets.map((target) =>
        withTargetReasonCodes(target, [
          "WATCH_ORCHESTRATOR_DISABLED",
          "WATCH_TARGET_SKIPPED"
        ])
      ),
      reasonCodes: uniqueReasonCodes([
        "WATCH_ORCHESTRATOR_DISABLED",
        "WATCH_PLAN_SKIPPED_DISABLED",
        ...rawExtraction.reasonCodes
      ]),
      createdAt
    };
  }

  const selected = selectWatchTargetsForCandidate({
    mint,
    options: config,
    targets
  });

  return {
    mint,
    ...(symbol ? { symbol } : {}),
    source,
    shouldVerifyMint,
    shouldWatchEvents,
    watchTargets: shouldWatchEvents ? selected.selectedTargets : [],
    skippedTargets: shouldWatchEvents
      ? selected.skippedTargets
      : [
          ...selected.skippedTargets,
          ...selected.selectedTargets.map((target) =>
            withTargetReasonCodes(target, [
              "WATCH_TARGET_SKIPPED",
              phase === "migration" ? "WATCH_ON_MIGRATION" : "WATCH_ON_NEW_TOKEN"
            ])
          )
        ],
    reasonCodes: uniqueReasonCodes([
      "WATCH_PLAN_CREATED",
      ...(shouldVerifyMint ? [verifyReasonCode(phase)] : []),
      ...(shouldWatchEvents ? [watchReasonCode(phase)] : []),
      ...selected.reasonCodes,
      ...rawExtraction.reasonCodes
    ]),
    createdAt
  };
}

export function mergeWatchPlans(
  previous: CandidateWatchPlan | undefined,
  next: CandidateWatchPlan
): CandidateWatchPlan {
  if (!previous) {
    return next;
  }

  const mergedTargets = dedupeTargets([
    ...next.watchTargets,
    ...previous.watchTargets
  ]);
  const mergedSkipped = dedupeTargets([
    ...next.skippedTargets,
    ...previous.skippedTargets,
    ...mergedTargets.skippedTargets
  ]);

  return {
    mint: next.mint || previous.mint,
    ...(next.symbol ?? previous.symbol
      ? { symbol: next.symbol ?? previous.symbol }
      : {}),
    ...(next.source ?? previous.source
      ? { source: next.source ?? previous.source }
      : {}),
    shouldVerifyMint: previous.shouldVerifyMint || next.shouldVerifyMint,
    shouldWatchEvents: previous.shouldWatchEvents || next.shouldWatchEvents,
    watchTargets: mergedTargets.selectedTargets,
    skippedTargets: mergedSkipped.selectedTargets,
    reasonCodes: uniqueReasonCodes([
      ...previous.reasonCodes,
      ...next.reasonCodes,
      ...mergedTargets.reasonCodes,
      ...mergedSkipped.reasonCodes
    ]),
    createdAt: next.createdAt
  };
}

function normalizeOptions(
  options: WatchOrchestratorOptions = {}
): NormalizedOptions {
  return {
    enabled: options.enabled ?? false,
    maxTargetsPerCandidate: Math.max(
      1,
      options.maxTargetsPerCandidate ?? defaultMaxTargetsPerCandidate
    ),
    allowMintWatch: options.allowMintWatch ?? true,
    allowBondingCurveWatch: options.allowBondingCurveWatch ?? true,
    allowPoolWatch: options.allowPoolWatch ?? true,
    allowProgramWatch: options.allowProgramWatch ?? false,
    allowWalletWatch: options.allowWalletWatch ?? false,
    minConfidenceToWatch: options.minConfidenceToWatch ?? "medium",
    verifyOnNewToken: options.verifyOnNewToken ?? false,
    verifyOnMigration: options.verifyOnMigration ?? false,
    watchOnNewToken: options.watchOnNewToken ?? false,
    watchOnMigration: options.watchOnMigration ?? false,
    now: options.now ?? (() => new Date())
  };
}

function extractRawWatchTargets(
  payload: unknown,
  options: NormalizedOptions
): RawExtractionResult {
  const targets: WatchTarget[] = [];
  const reasonCodes: string[] = [];

  visitRawPayload(payload, (key, value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return;
    }

    const classification = classifyRawField(key);

    if (classification.skip) {
      return;
    }

    if (!classification.kind) {
      return;
    }

    if (!isValidSolanaAddress(value)) {
      reasonCodes.push("WATCH_TARGET_INVALID_ADDRESS");
      return;
    }

    const target = createTarget({
      address: value,
      confidence: classification.confidence,
      createdAt: options.now().toISOString(),
      kind: classification.kind,
      label: key,
      reasonCodes: [
        "RAW_PAYLOAD_ADDRESS_EXTRACTED",
        kindReasonCode(classification.kind),
        confidenceReasonCode(classification.confidence)
      ],
      source: "pumpportal"
    });

    if (target) {
      targets.push(target);
    }
  });

  if (targets.length === 0) {
    reasonCodes.push("RAW_PAYLOAD_NO_WATCH_TARGETS");
  }

  return {
    targets: dedupeTargets(targets).selectedTargets,
    reasonCodes: uniqueReasonCodes(reasonCodes)
  };
}

function visitRawPayload(
  value: unknown,
  visit: (key: string, value: unknown) => void,
  depth = 0
): void {
  if (depth > 3 || typeof value !== "object" || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      visitRawPayload(item, visit, depth + 1);
    }
    return;
  }

  for (const [key, next] of Object.entries(value)) {
    visit(key, next);

    if (typeof next === "object" && next !== null) {
      visitRawPayload(next, visit, depth + 1);
    }
  }
}

function classifyRawField(key: string): {
  confidence: WatchTargetConfidence;
  kind?: WatchTargetKind;
  skip?: boolean;
} {
  const normalizedKey = key.replaceAll("_", "").toLowerCase();

  if (normalizedKey === "quotemint") {
    return { confidence: "low", skip: true };
  }

  if (
    ["mint", "tokenmint", "basemint", "ca", "address", "contractaddress"].includes(
      normalizedKey
    )
  ) {
    return { confidence: "medium", kind: "mint" };
  }

  if (
    [
      "bondingcurve",
      "associatedbondingcurve",
      "bondingcurvekey",
      "bondingcurveaddress"
    ].includes(normalizedKey)
  ) {
    return { confidence: "high", kind: "bonding_curve" };
  }

  if (
    ["pool", "pooladdress", "pair", "pairaddress", "market", "marketaddress", "newpool"].includes(
      normalizedKey
    )
  ) {
    return { confidence: "high", kind: "pool" };
  }

  if (["creator", "user", "owner", "traderpublickey"].includes(normalizedKey)) {
    return { confidence: "low", kind: "wallet" };
  }

  if (["program", "programid", "programaddress"].includes(normalizedKey)) {
    return { confidence: "low", kind: "program" };
  }

  if (
    ["tokenaccount", "tokenaccountaddress", "associatedtokenaccount"].includes(
      normalizedKey
    )
  ) {
    return { confidence: "low", kind: "token_account" };
  }

  return { confidence: "low" };
}

function addTarget(targets: WatchTarget[], input: CreateTargetInput): void {
  const target = createTarget(input);

  if (target) {
    targets.push(target);
  }
}

type CreateTargetInput = {
  address: string;
  confidence: WatchTargetConfidence;
  createdAt: string;
  kind: WatchTargetKind;
  label?: string | undefined;
  mint?: string | undefined;
  reasonCodes: string[];
  source: WatchTargetSource;
  symbol?: string | undefined;
};

function createTarget(input: CreateTargetInput): WatchTarget | undefined {
  if (!isValidSolanaAddress(input.address)) {
    return undefined;
  }

  return {
    address: input.address,
    kind: input.kind,
    ...(input.mint ? { mint: input.mint } : {}),
    ...(input.symbol ? { symbol: input.symbol } : {}),
    ...(input.label ? { label: input.label } : {}),
    source: input.source,
    confidence: input.confidence,
    reasonCodes: uniqueReasonCodes(input.reasonCodes),
    createdAt: input.createdAt
  };
}

function dedupeTargets(targets: WatchTarget[]): SelectWatchTargetsResult {
  const seen = new Set<string>();
  const selectedTargets: WatchTarget[] = [];
  const skippedTargets: WatchTarget[] = [];
  const reasonCodes: string[] = [];

  for (const target of targets) {
    if (seen.has(target.address)) {
      skippedTargets.push(
        withTargetReasonCodes(target, [
          "WATCH_TARGET_DUPLICATE",
          "WATCH_TARGET_SKIPPED"
        ])
      );
      reasonCodes.push("WATCH_TARGET_DUPLICATE", "WATCH_TARGET_SKIPPED");
      continue;
    }

    seen.add(target.address);
    selectedTargets.push(target);
  }

  return {
    selectedTargets,
    skippedTargets,
    reasonCodes: uniqueReasonCodes(reasonCodes)
  };
}

function isKindAllowed(
  kind: WatchTargetKind,
  options: NormalizedOptions
): boolean {
  if (kind === "mint") {
    return options.allowMintWatch;
  }

  if (kind === "bonding_curve") {
    return options.allowBondingCurveWatch;
  }

  if (kind === "pool") {
    return options.allowPoolWatch;
  }

  if (kind === "program") {
    return options.allowProgramWatch;
  }

  if (kind === "wallet") {
    return options.allowWalletWatch;
  }

  return false;
}

function compareTargetPreference(left: WatchTarget, right: WatchTarget): number {
  const priorityDelta = targetPriority(left.kind) - targetPriority(right.kind);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return confidenceRank(right.confidence) - confidenceRank(left.confidence);
}

function targetPriority(kind: WatchTargetKind): number {
  switch (kind) {
    case "pool":
    case "bonding_curve":
      return 0;
    case "mint":
      return 1;
    case "token_account":
      return 2;
    case "program":
      return 3;
    case "wallet":
      return 4;
    case "unknown":
      return 5;
  }
}

function compareConfidence(
  left: WatchTargetConfidence,
  right: WatchTargetConfidence
): number {
  return confidenceRank(left) - confidenceRank(right);
}

function confidenceRank(confidence: WatchTargetConfidence): number {
  switch (confidence) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
  }
}

function resolveEventPhase(input: WatchDecisionInput): WatchEventPhase {
  if (input.eventPhase) {
    return input.eventPhase;
  }

  const rawType = input.rawSourceEventType ?? input.event?.rawSourceEventType;

  if (rawType?.toLowerCase().includes("migr")) {
    return "migration";
  }

  if (input.event?.type === "token_created") {
    return "new_token";
  }

  if (input.event?.type === "trade") {
    return "trade";
  }

  return "unknown";
}

function verifyReasonCode(phase: WatchEventPhase): string {
  return phase === "migration" ? "VERIFY_ON_MIGRATION" : "VERIFY_ON_NEW_TOKEN";
}

function watchReasonCode(phase: WatchEventPhase): string {
  return phase === "migration" ? "WATCH_ON_MIGRATION" : "WATCH_ON_NEW_TOKEN";
}

function kindReasonCode(kind: WatchTargetKind): string {
  switch (kind) {
    case "mint":
      return "WATCH_TARGET_MINT";
    case "bonding_curve":
      return "WATCH_TARGET_BONDING_CURVE";
    case "pool":
      return "WATCH_TARGET_POOL";
    case "program":
      return "WATCH_TARGET_PROGRAM";
    case "token_account":
      return "WATCH_TARGET_TOKEN_ACCOUNT";
    case "wallet":
      return "WATCH_TARGET_WALLET";
    case "unknown":
      return "WATCH_TARGET_UNKNOWN";
  }
}

function confidenceReasonCode(confidence: WatchTargetConfidence): string {
  switch (confidence) {
    case "low":
      return "WATCH_TARGET_LOW_CONFIDENCE";
    case "medium":
      return "WATCH_TARGET_MEDIUM_CONFIDENCE";
    case "high":
      return "WATCH_TARGET_HIGH_CONFIDENCE";
  }
}

function withTargetReasonCodes(
  target: WatchTarget,
  reasonCodes: string[]
): WatchTarget {
  return {
    ...target,
    reasonCodes: uniqueReasonCodes([...target.reasonCodes, ...reasonCodes])
  };
}

function getEventMint(event: FeedEvent): string {
  return event.type === "token_created" ? event.candidate.mint : event.mint;
}

function getEventSymbol(event: FeedEvent): string | undefined {
  if (event.type === "token_created") {
    return event.candidate.symbol;
  }

  return event.type === "trade" ? event.symbol : undefined;
}

function getEventTimestamp(event: FeedEvent): string | undefined {
  return event.timestamp;
}

function normalizeSource(source: string | undefined): WatchTargetSource {
  if (source === "mock" || source === "pumpportal" || source === "manual") {
    return source;
  }

  if (source === "derived") {
    return "derived";
  }

  return "unknown";
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes));
}
