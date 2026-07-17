export type CapacityConfidence = "none" | "low" | "medium" | "high";

export type CapacityConstraint =
  "none" | "concurrency" | "event_cap" | "cost_cap";

export type CapacityModelInput = {
  observationWindowMs: number;
  launchCount: number;
  tradeEventCount: number;
  concurrentSlots: number;
  trackedMintCount: number;
  protectedMintCount: number;
  initialObservationMs: number;
  extendedObservationMs: number;
  staleNoTradesMs: number;
  totalEventsThisSession: number;
  maxEventsPerSession: number;
  estimatedSessionCostSol: number;
  maxSessionCostSol: number;
  eventCostSolPer10000: number;
  schedulerMutationApplied?: boolean;
};

export type CapacityModelResult = {
  observation: {
    windowMs: number;
    launchCount: number;
    launchRatePerMinute: number;
    launchConfidence: CapacityConfidence;
    tradeEventCount: number;
    observedEventsPerSecond: number;
    eventRateConfidence: CapacityConfidence;
    observedEventsPerSecondPerTrackedMint: number;
  };
  slots: {
    concurrentSlots: number;
    trackedMintCount: number;
    protectedMintCount: number;
    availableNewestSlots: number;
    requiredInitialSlots: number;
    requiredInitialSlotsRoundedUp: number;
    minimumTotalSlotsForFullInitialCoverage: number;
    requiredInitialSlotSecondsPerMinute: number;
    availableInitialSlotSecondsPerMinute: number;
    maximumFullyObservedLaunchesPerMinute: number;
    initialCoverageRatio: number;
    allLaunchesCanReceiveInitialWindow: boolean;
    protectedSlotShare: number;
  };
  activity: {
    projectedEventsPerSecondAtCapacity: number;
    projectedHourlyEventsAtCapacity: number;
    projectedHourlyCostSolAtCapacity: number;
  };
  budget: {
    eventCostSolPerMessage: number;
    totalEventsThisSession: number;
    maxEventsPerSession: number;
    remainingEventsByEventCap: number;
    estimatedSessionCostSol: number;
    maxSessionCostSol: number;
    remainingCostSol: number;
    remainingEventsByCostCap: number;
    effectiveRemainingEvents: number;
    estimatedMinutesUntilEventCapAtCapacity: number | null;
    estimatedMinutesUntilCostCapAtCapacity: number | null;
    bindingConstraint: CapacityConstraint;
  };
  policy: {
    initialObservationMs: number;
    extendedObservationMs: number;
    staleNoTradesMs: number;
    newestAlwaysConsidered: true;
    schedulerMutationApplied: boolean;
  };
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type CapacityScenario = {
  id: string;
  launchIntervalSeconds: number;
  messagesPerSecondPerTrackedMint: number;
};

export type CapacityScenarioResult = {
  id: string;
  launchIntervalSeconds: number;
  messagesPerSecondPerTrackedMint: number;
  launchRatePerMinute: number;
  requiredInitialSlotsRoundedUp: number;
  initialCoverageRatio: number;
  projectedHourlyEventsAtCapacity: number;
  projectedHourlyCostSolAtCapacity: number;
  allLaunchesCanReceiveInitialWindow: boolean;
};

export const defaultCapacityScenarios: CapacityScenario[] = [
  ...createActivityScenarios(30),
  ...createActivityScenarios(10),
  ...createActivityScenarios(5)
];

export function evaluateCapacityModel(
  input: CapacityModelInput
): CapacityModelResult {
  const observationWindowMs = positiveFinite(input.observationWindowMs, 1_000);
  const launchCount = nonnegativeInteger(input.launchCount);
  const tradeEventCount = nonnegativeInteger(input.tradeEventCount);
  const concurrentSlots = nonnegativeInteger(input.concurrentSlots);
  const trackedMintCount = nonnegativeInteger(input.trackedMintCount);
  const requestedProtectedMintCount = nonnegativeInteger(
    input.protectedMintCount
  );
  const protectedMintCount = Math.min(
    concurrentSlots,
    requestedProtectedMintCount
  );
  const initialObservationMs = positiveFinite(
    input.initialObservationMs,
    30_000
  );
  const extendedObservationMs = positiveFinite(
    input.extendedObservationMs,
    initialObservationMs
  );
  const staleNoTradesMs = nonnegativeFinite(input.staleNoTradesMs);
  const observationMinutes = observationWindowMs / 60_000;
  const observationSeconds = observationWindowMs / 1_000;
  const launchRatePerMinute = safeDivide(launchCount, observationMinutes);
  const observedEventsPerSecond = safeDivide(
    tradeEventCount,
    observationSeconds
  );
  const observedEventsPerSecondPerTrackedMint = safeDivide(
    observedEventsPerSecond,
    trackedMintCount
  );
  const availableNewestSlots = Math.max(
    0,
    concurrentSlots - protectedMintCount
  );
  const initialObservationSeconds = initialObservationMs / 1_000;
  const requiredInitialSlots =
    (launchRatePerMinute / 60) * initialObservationSeconds;
  const requiredInitialSlotSecondsPerMinute =
    launchRatePerMinute * initialObservationSeconds;
  const availableInitialSlotSecondsPerMinute = availableNewestSlots * 60;
  const initialCoverageRatio =
    requiredInitialSlotSecondsPerMinute <= 0
      ? 1
      : clamp01(
          availableInitialSlotSecondsPerMinute /
            requiredInitialSlotSecondsPerMinute
        );
  const maximumFullyObservedLaunchesPerMinute = safeDivide(
    availableInitialSlotSecondsPerMinute,
    initialObservationSeconds
  );
  const eventCostSolPerMessage = safeDivide(
    nonnegativeFinite(input.eventCostSolPer10000),
    10_000
  );
  const projectedEventsPerSecondAtCapacity =
    observedEventsPerSecondPerTrackedMint * concurrentSlots;
  const projectedHourlyEventsAtCapacity =
    projectedEventsPerSecondAtCapacity * 3_600;
  const projectedHourlyCostSolAtCapacity =
    projectedHourlyEventsAtCapacity * eventCostSolPerMessage;
  const totalEventsThisSession = nonnegativeInteger(
    input.totalEventsThisSession
  );
  const maxEventsPerSession = nonnegativeInteger(input.maxEventsPerSession);
  const remainingEventsByEventCap = Math.max(
    0,
    maxEventsPerSession - totalEventsThisSession
  );
  const estimatedSessionCostSol = nonnegativeFinite(
    input.estimatedSessionCostSol
  );
  const maxSessionCostSol = nonnegativeFinite(input.maxSessionCostSol);
  const remainingCostSol = Math.max(
    0,
    maxSessionCostSol - estimatedSessionCostSol
  );
  const remainingEventsByCostCap =
    eventCostSolPerMessage > 0
      ? Math.floor(remainingCostSol / eventCostSolPerMessage)
      : Number.MAX_SAFE_INTEGER;
  const effectiveRemainingEvents = Math.min(
    remainingEventsByEventCap,
    remainingEventsByCostCap
  );
  const estimatedMinutesUntilEventCapAtCapacity = minutesUntil(
    remainingEventsByEventCap,
    projectedEventsPerSecondAtCapacity
  );
  const estimatedMinutesUntilCostCapAtCapacity = minutesUntil(
    remainingEventsByCostCap,
    projectedEventsPerSecondAtCapacity
  );
  const bindingConstraint = getBindingConstraint({
    initialCoverageRatio,
    remainingEventsByCostCap,
    remainingEventsByEventCap
  });
  const reasonCodes = unique([
    "CAPACITY_MODEL_OBSERVATION_ONLY",
    "SCHEDULER_POLICY_UNCHANGED",
    ...(launchCount === 0 ? ["CAPACITY_LAUNCH_SAMPLE_EMPTY"] : []),
    ...(tradeEventCount === 0 ? ["CAPACITY_TRADE_SAMPLE_EMPTY"] : []),
    ...(initialCoverageRatio < 1
      ? ["INITIAL_COVERAGE_CAPACITY_SHORTFALL"]
      : []),
    ...(availableNewestSlots === 0 && launchCount > 0
      ? ["NEWEST_CAPACITY_BLOCKED_BY_PROTECTED_SLOTS"]
      : []),
    ...(requestedProtectedMintCount > concurrentSlots
      ? ["PROTECTED_COUNT_CLAMPED_TO_CAPACITY"]
      : []),
    ...(effectiveRemainingEvents === 0
      ? ["CAPACITY_SESSION_BUDGET_EXHAUSTED"]
      : []),
    "PAPER_ONLY",
    "TRADING_DISABLED"
  ]);

  return {
    observation: {
      windowMs: round(observationWindowMs),
      launchCount,
      launchRatePerMinute: round(launchRatePerMinute),
      launchConfidence: sampleConfidence(launchCount),
      tradeEventCount,
      observedEventsPerSecond: round(observedEventsPerSecond),
      eventRateConfidence: sampleConfidence(tradeEventCount),
      observedEventsPerSecondPerTrackedMint: round(
        observedEventsPerSecondPerTrackedMint
      )
    },
    slots: {
      concurrentSlots,
      trackedMintCount,
      protectedMintCount,
      availableNewestSlots,
      requiredInitialSlots: round(requiredInitialSlots),
      requiredInitialSlotsRoundedUp: Math.ceil(requiredInitialSlots),
      minimumTotalSlotsForFullInitialCoverage:
        Math.ceil(requiredInitialSlots) + protectedMintCount,
      requiredInitialSlotSecondsPerMinute: round(
        requiredInitialSlotSecondsPerMinute
      ),
      availableInitialSlotSecondsPerMinute: round(
        availableInitialSlotSecondsPerMinute
      ),
      maximumFullyObservedLaunchesPerMinute: round(
        maximumFullyObservedLaunchesPerMinute
      ),
      initialCoverageRatio: round(initialCoverageRatio),
      allLaunchesCanReceiveInitialWindow: initialCoverageRatio >= 1,
      protectedSlotShare: round(safeDivide(protectedMintCount, concurrentSlots))
    },
    activity: {
      projectedEventsPerSecondAtCapacity: round(
        projectedEventsPerSecondAtCapacity
      ),
      projectedHourlyEventsAtCapacity: round(projectedHourlyEventsAtCapacity),
      projectedHourlyCostSolAtCapacity: round(projectedHourlyCostSolAtCapacity)
    },
    budget: {
      eventCostSolPerMessage: round(eventCostSolPerMessage),
      totalEventsThisSession,
      maxEventsPerSession,
      remainingEventsByEventCap,
      estimatedSessionCostSol: round(estimatedSessionCostSol),
      maxSessionCostSol: round(maxSessionCostSol),
      remainingCostSol: round(remainingCostSol),
      remainingEventsByCostCap,
      effectiveRemainingEvents,
      estimatedMinutesUntilEventCapAtCapacity,
      estimatedMinutesUntilCostCapAtCapacity,
      bindingConstraint
    },
    policy: {
      initialObservationMs: round(initialObservationMs),
      extendedObservationMs: round(extendedObservationMs),
      staleNoTradesMs: round(staleNoTradesMs),
      newestAlwaysConsidered: true,
      schedulerMutationApplied: input.schedulerMutationApplied === true
    },
    reasonCodes,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true
  };
}

export function evaluateCapacityScenarios(
  input: CapacityModelInput,
  scenarios: CapacityScenario[] = defaultCapacityScenarios
): CapacityScenarioResult[] {
  return scenarios.map((scenario) => {
    const launchRatePerMinute = 60 / scenario.launchIntervalSeconds;
    const launchCount =
      launchRatePerMinute *
      (positiveFinite(input.observationWindowMs, 1_000) / 60_000);
    const tradeEventCount =
      scenario.messagesPerSecondPerTrackedMint *
      input.concurrentSlots *
      (positiveFinite(input.observationWindowMs, 1_000) / 1_000);
    const result = evaluateCapacityModel({
      ...input,
      launchCount,
      tradeEventCount,
      trackedMintCount: input.concurrentSlots
    });

    return {
      id: scenario.id,
      launchIntervalSeconds: scenario.launchIntervalSeconds,
      messagesPerSecondPerTrackedMint: scenario.messagesPerSecondPerTrackedMint,
      launchRatePerMinute: round(launchRatePerMinute),
      requiredInitialSlotsRoundedUp: result.slots.requiredInitialSlotsRoundedUp,
      initialCoverageRatio: result.slots.initialCoverageRatio,
      projectedHourlyEventsAtCapacity:
        result.activity.projectedHourlyEventsAtCapacity,
      projectedHourlyCostSolAtCapacity:
        result.activity.projectedHourlyCostSolAtCapacity,
      allLaunchesCanReceiveInitialWindow:
        result.slots.allLaunchesCanReceiveInitialWindow
    };
  });
}

function createActivityScenarios(
  launchIntervalSeconds: number
): CapacityScenario[] {
  return [
    {
      id: `launch-${launchIntervalSeconds}s-quiet`,
      launchIntervalSeconds,
      messagesPerSecondPerTrackedMint: 0.2
    },
    {
      id: `launch-${launchIntervalSeconds}s-average`,
      launchIntervalSeconds,
      messagesPerSecondPerTrackedMint: 2
    },
    {
      id: `launch-${launchIntervalSeconds}s-viral`,
      launchIntervalSeconds,
      messagesPerSecondPerTrackedMint: 10
    }
  ];
}

function getBindingConstraint(input: {
  initialCoverageRatio: number;
  remainingEventsByCostCap: number;
  remainingEventsByEventCap: number;
}): CapacityConstraint {
  if (input.remainingEventsByCostCap <= 0) {
    return "cost_cap";
  }

  if (input.remainingEventsByEventCap <= 0) {
    return "event_cap";
  }

  if (input.initialCoverageRatio < 1) {
    return "concurrency";
  }

  if (input.remainingEventsByCostCap <= input.remainingEventsByEventCap) {
    return "cost_cap";
  }

  if (input.remainingEventsByEventCap < input.remainingEventsByCostCap) {
    return "event_cap";
  }

  return "none";
}

function minutesUntil(
  remainingEvents: number,
  eventsPerSecond: number
): number | null {
  if (!Number.isFinite(remainingEvents) || eventsPerSecond <= 0) {
    return null;
  }

  return round(remainingEvents / eventsPerSecond / 60);
}

function sampleConfidence(sampleCount: number): CapacityConfidence {
  if (sampleCount <= 0) {
    return "none";
  }

  if (sampleCount < 3) {
    return "low";
  }

  if (sampleCount < 10) {
    return "medium";
  }

  return "high";
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonnegativeFinite(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function nonnegativeInteger(value: number): number {
  return Math.floor(nonnegativeFinite(value));
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
