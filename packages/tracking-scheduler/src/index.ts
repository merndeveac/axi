export type TrackingProtectionReason =
  | "paper_position"
  | "live_position"
  | "migration"
  | "ripping"
  | "hot"
  | "protected_score";

export type TrackingSchedulerCandidate = {
  mint: string;
  discoveredAt: string;
  observedAt: string;
  score: number;
  phase: string;
  hardRejected: boolean;
  migration: boolean;
  eligible: boolean;
};

export type TrackingSchedulerTrackedMint = {
  mint: string;
  subscribedAt: string;
  score: number;
  phase: string;
  eventCount: number;
  latestTradeAt: string | null;
  hardRejected: boolean;
  protectionReason: TrackingProtectionReason | null;
};

export type TrackingSchedulerPolicy = {
  enabled: boolean;
  maxConcurrentMints: number;
  reservedNewestSlots: number;
  maxProtectedMints: number;
  queueLimit: number;
  queueMaxAgeMs: number;
  staleNoTradesMs: number;
  maxTrackingAgeMs: number;
};

export type TrackingSchedulerAction =
  "track" | "keep" | "preempt" | "queue" | "drop";

export type TrackingSchedulerDecision = {
  action: TrackingSchedulerAction;
  incomingMint: string;
  preemptMint: string | null;
  protectedMints: string[];
  evictionEligibleMints: string[];
  effectiveMaxProtectedMints: number;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

type ClassifiedTrackedMint = TrackingSchedulerTrackedMint & {
  absoluteProtection: boolean;
  ageMs: number;
  staleNoTrades: boolean;
  trackingAgeExpired: boolean;
};

export function scheduleNewestCandidate(input: {
  candidate: TrackingSchedulerCandidate;
  tracked: TrackingSchedulerTrackedMint[];
  policy: TrackingSchedulerPolicy;
  now?: string | Date;
}): TrackingSchedulerDecision {
  const nowMs = toTime(input.now ?? new Date(), Date.now());
  const policy = normalizePolicy(input.policy);
  const candidate = normalizeCandidate(input.candidate, nowMs);
  const tracked = uniqueTracked(input.tracked).map((mint) =>
    classifyTrackedMint(mint, policy, nowMs)
  );
  const protection = selectProtectedMints(tracked, policy);
  const protectedMints = protection.protected.map((mint) => mint.mint).sort();
  const evictionEligible = tracked
    .filter((mint) => !protection.protectedSet.has(mint.mint))
    .sort(compareEvictionPriority);
  const base = {
    incomingMint: candidate.mint,
    protectedMints,
    evictionEligibleMints: evictionEligible.map((mint) => mint.mint),
    effectiveMaxProtectedMints: policy.effectiveMaxProtectedMints,
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const
  };

  if (candidate.hardRejected) {
    return {
      ...base,
      action: "drop",
      preemptMint: null,
      reasonCodes: [
        "SCHEDULER_NEWEST_ALWAYS_CONSIDERED",
        "SCHEDULER_DROP_HARD_REJECT"
      ]
    };
  }

  if (tracked.some((mint) => mint.mint === candidate.mint)) {
    return {
      ...base,
      action: "keep",
      preemptMint: null,
      reasonCodes: unique([
        "SCHEDULER_NEWEST_ALWAYS_CONSIDERED",
        "SCHEDULER_ALREADY_TRACKED",
        ...(candidate.migration ? ["SCHEDULER_MIGRATION_CONTINUITY"] : [])
      ])
    };
  }

  if (!candidate.eligible) {
    return {
      ...base,
      action: "drop",
      preemptMint: null,
      reasonCodes: [
        "SCHEDULER_NEWEST_ALWAYS_CONSIDERED",
        "SCHEDULER_DROP_POLICY_INELIGIBLE"
      ]
    };
  }

  if (!policy.enabled) {
    return {
      ...base,
      action: "drop",
      preemptMint: null,
      reasonCodes: ["SCHEDULER_NEWEST_ALWAYS_CONSIDERED", "SCHEDULER_DISABLED"]
    };
  }

  if (tracked.length < policy.maxConcurrentMints) {
    return {
      ...base,
      action: "track",
      preemptMint: null,
      reasonCodes: unique([
        "SCHEDULER_NEWEST_ALWAYS_CONSIDERED",
        "SCHEDULER_OPEN_SLOT",
        ...(candidate.migration ? ["SCHEDULER_MIGRATION_CONTINUITY"] : [])
      ])
    };
  }

  const victim = evictionEligible[0];

  if (victim) {
    return {
      ...base,
      action: "preempt",
      preemptMint: victim.mint,
      reasonCodes: unique([
        "SCHEDULER_NEWEST_ALWAYS_CONSIDERED",
        getEvictionReason(victim),
        ...(victim.protectionReason !== null
          ? ["SCHEDULER_PROTECTION_CAP_ENFORCED"]
          : []),
        ...(candidate.migration ? ["SCHEDULER_MIGRATION_CONTINUITY"] : [])
      ])
    };
  }

  const candidateAgeMs = Math.max(
    0,
    nowMs - toTime(candidate.observedAt, nowMs)
  );
  const canQueue =
    policy.queueLimit > 0 &&
    (policy.queueMaxAgeMs <= 0 || candidateAgeMs <= policy.queueMaxAgeMs);

  return {
    ...base,
    action: canQueue ? "queue" : "drop",
    preemptMint: null,
    reasonCodes: unique([
      "SCHEDULER_NEWEST_ALWAYS_CONSIDERED",
      "SCHEDULER_ALL_SLOTS_ABSOLUTELY_PROTECTED",
      canQueue ? "SCHEDULER_QUEUED" : "SCHEDULER_QUEUE_UNAVAILABLE"
    ])
  };
}

function normalizePolicy(policy: TrackingSchedulerPolicy): {
  enabled: boolean;
  maxConcurrentMints: number;
  reservedNewestSlots: number;
  effectiveMaxProtectedMints: number;
  queueLimit: number;
  queueMaxAgeMs: number;
  staleNoTradesMs: number;
  maxTrackingAgeMs: number;
} {
  const maxConcurrentMints = nonnegativeInteger(policy.maxConcurrentMints);
  const reservedNewestSlots = Math.min(
    maxConcurrentMints,
    nonnegativeInteger(policy.reservedNewestSlots)
  );
  const protectionCeiling = Math.max(
    0,
    maxConcurrentMints - reservedNewestSlots
  );

  return {
    enabled: policy.enabled,
    maxConcurrentMints,
    reservedNewestSlots,
    effectiveMaxProtectedMints: Math.min(
      protectionCeiling,
      nonnegativeInteger(policy.maxProtectedMints)
    ),
    queueLimit: nonnegativeInteger(policy.queueLimit),
    queueMaxAgeMs: nonnegativeFinite(policy.queueMaxAgeMs),
    staleNoTradesMs: nonnegativeFinite(policy.staleNoTradesMs),
    maxTrackingAgeMs: nonnegativeFinite(policy.maxTrackingAgeMs)
  };
}

function normalizeCandidate(
  candidate: TrackingSchedulerCandidate,
  nowMs: number
): TrackingSchedulerCandidate {
  return {
    ...candidate,
    mint: candidate.mint.trim(),
    score: clamp(candidate.score, 0, 100),
    discoveredAt: toIso(candidate.discoveredAt, nowMs),
    observedAt: toIso(candidate.observedAt, nowMs)
  };
}

function uniqueTracked(
  tracked: TrackingSchedulerTrackedMint[]
): TrackingSchedulerTrackedMint[] {
  const unique = new Map<string, TrackingSchedulerTrackedMint>();

  for (const mint of tracked) {
    const normalizedMint = mint.mint.trim();

    if (!normalizedMint || unique.has(normalizedMint)) {
      continue;
    }

    unique.set(normalizedMint, {
      ...mint,
      mint: normalizedMint,
      score: clamp(mint.score, 0, 100),
      eventCount: nonnegativeInteger(mint.eventCount)
    });
  }

  return Array.from(unique.values());
}

function classifyTrackedMint(
  mint: TrackingSchedulerTrackedMint,
  policy: ReturnType<typeof normalizePolicy>,
  nowMs: number
): ClassifiedTrackedMint {
  const subscribedAtMs = toTime(mint.subscribedAt, nowMs);
  const ageMs = Math.max(0, nowMs - subscribedAtMs);

  return {
    ...mint,
    absoluteProtection:
      mint.protectionReason === "paper_position" ||
      mint.protectionReason === "live_position",
    ageMs,
    staleNoTrades:
      policy.staleNoTradesMs > 0 &&
      ageMs >= policy.staleNoTradesMs &&
      mint.eventCount === 0,
    trackingAgeExpired:
      policy.maxTrackingAgeMs > 0 && ageMs >= policy.maxTrackingAgeMs
  };
}

function selectProtectedMints(
  tracked: ClassifiedTrackedMint[],
  policy: ReturnType<typeof normalizePolicy>
): {
  protected: ClassifiedTrackedMint[];
  protectedSet: Set<string>;
} {
  const absolute = tracked.filter(
    (mint) =>
      mint.absoluteProtection &&
      !mint.hardRejected &&
      !mint.staleNoTrades &&
      !mint.trackingAgeExpired
  );
  const softSlots = Math.max(
    0,
    policy.effectiveMaxProtectedMints - absolute.length
  );
  const soft = tracked
    .filter(
      (mint) =>
        !mint.absoluteProtection &&
        mint.protectionReason !== null &&
        !mint.hardRejected &&
        !mint.staleNoTrades &&
        !mint.trackingAgeExpired
    )
    .sort(compareProtectionPriority)
    .slice(0, softSlots);
  const protectedMints = [...absolute, ...soft];

  return {
    protected: protectedMints,
    protectedSet: new Set(protectedMints.map((mint) => mint.mint))
  };
}

function compareProtectionPriority(
  left: ClassifiedTrackedMint,
  right: ClassifiedTrackedMint
): number {
  return (
    protectionRank(right.protectionReason) -
      protectionRank(left.protectionReason) ||
    right.score - left.score ||
    right.eventCount - left.eventCount ||
    toTime(right.subscribedAt, 0) - toTime(left.subscribedAt, 0) ||
    left.mint.localeCompare(right.mint)
  );
}

function compareEvictionPriority(
  left: ClassifiedTrackedMint,
  right: ClassifiedTrackedMint
): number {
  return (
    evictionRank(left) - evictionRank(right) ||
    left.score - right.score ||
    left.eventCount - right.eventCount ||
    toTime(left.subscribedAt, 0) - toTime(right.subscribedAt, 0) ||
    left.mint.localeCompare(right.mint)
  );
}

function evictionRank(mint: ClassifiedTrackedMint): number {
  if (mint.hardRejected) {
    return 0;
  }

  if (mint.trackingAgeExpired) {
    return 1;
  }

  if (mint.staleNoTrades) {
    return 2;
  }

  return 3;
}

function getEvictionReason(mint: ClassifiedTrackedMint): string {
  if (mint.hardRejected) {
    return "SCHEDULER_EVICT_HARD_REJECT";
  }

  if (mint.trackingAgeExpired) {
    return "SCHEDULER_EVICT_MAX_AGE";
  }

  if (mint.staleNoTrades) {
    return "SCHEDULER_EVICT_STALE_NO_TRADES";
  }

  return "SCHEDULER_PREEMPT_WEAKEST_FOR_NEWEST";
}

function protectionRank(reason: TrackingProtectionReason | null): number {
  switch (reason) {
    case "live_position":
    case "paper_position":
      return 6;
    case "ripping":
      return 5;
    case "migration":
      return 4;
    case "hot":
      return 3;
    case "protected_score":
      return 2;
    default:
      return 0;
  }
}

function toTime(value: string | Date, fallback: number): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value: string, fallback: number): string {
  return new Date(toTime(value, fallback)).toISOString();
}

function nonnegativeFinite(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function nonnegativeInteger(value: number): number {
  return Math.floor(nonnegativeFinite(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
