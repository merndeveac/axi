import { describe, expect, it } from "vitest";
import {
  scheduleNewestCandidate,
  type TrackingSchedulerCandidate,
  type TrackingSchedulerPolicy,
  type TrackingSchedulerTrackedMint
} from "../src/index";

const now = "2026-07-16T12:01:00.000Z";
const policy: TrackingSchedulerPolicy = {
  enabled: true,
  maxConcurrentMints: 3,
  reservedNewestSlots: 1,
  maxProtectedMints: 2,
  queueLimit: 50,
  queueMaxAgeMs: 30_000,
  staleNoTradesMs: 30_000,
  maxTrackingAgeMs: 300_000
};
const candidate: TrackingSchedulerCandidate = {
  mint: "incoming",
  discoveredAt: "2026-07-16T12:00:55.000Z",
  observedAt: "2026-07-16T12:00:55.000Z",
  score: 1,
  phase: "discovery_only",
  hardRejected: false,
  migration: false,
  eligible: true
};

describe("@axi/tracking-scheduler", () => {
  it("tracks the newest candidate when a slot is open", () => {
    const decision = scheduleNewestCandidate({
      candidate,
      tracked: [trackedMint("one")],
      policy,
      now
    });

    expect(decision.action).toBe("track");
    expect(decision.preemptMint).toBeNull();
    expect(decision.reasonCodes).toContain(
      "SCHEDULER_NEWEST_ALWAYS_CONSIDERED"
    );
  });

  it("preempts the weakest unprotected slot even when the newest score is lower", () => {
    const decision = scheduleNewestCandidate({
      candidate,
      tracked: [
        trackedMint("strong", { score: 90 }),
        trackedMint("weak", { score: 70 }),
        trackedMint("middle", { score: 80 })
      ],
      policy,
      now
    });

    expect(decision.action).toBe("preempt");
    expect(decision.preemptMint).toBe("weak");
    expect(decision.reasonCodes).toContain(
      "SCHEDULER_PREEMPT_WEAKEST_FOR_NEWEST"
    );
  });

  it("caps soft protection so a reserved newest slot remains replaceable", () => {
    const decision = scheduleNewestCandidate({
      candidate,
      tracked: [
        trackedMint("ripping", {
          protectionReason: "ripping",
          score: 90
        }),
        trackedMint("hot", { protectionReason: "hot", score: 70 }),
        trackedMint("score", {
          protectionReason: "protected_score",
          score: 80
        })
      ],
      policy,
      now
    });

    expect(decision.protectedMints).toEqual(["hot", "ripping"]);
    expect(decision.preemptMint).toBe("score");
    expect(decision.reasonCodes).toContain("SCHEDULER_PROTECTION_CAP_ENFORCED");
  });

  it("queues the newest candidate when every slot has an absolute position", () => {
    const decision = scheduleNewestCandidate({
      candidate,
      tracked: [
        trackedMint("paper-one", { protectionReason: "paper_position" }),
        trackedMint("paper-two", { protectionReason: "paper_position" }),
        trackedMint("live", { protectionReason: "live_position" })
      ],
      policy,
      now
    });

    expect(decision.action).toBe("queue");
    expect(decision.preemptMint).toBeNull();
    expect(decision.reasonCodes).toContain(
      "SCHEDULER_ALL_SLOTS_ABSOLUTELY_PROTECTED"
    );
  });

  it("keeps a pending calibration outcome bounded from scheduler preemption", () => {
    const decision = scheduleNewestCandidate({
      candidate,
      tracked: [
        trackedMint("capture", {
          protectionReason: "calibration_outcome"
        })
      ],
      policy: { ...policy, maxConcurrentMints: 1 },
      now
    });

    expect(decision.action).toBe("queue");
    expect(decision.protectedMints).toEqual(["capture"]);
    expect(decision.reasonCodes).toContain(
      "SCHEDULER_ALL_SLOTS_ABSOLUTELY_PROTECTED"
    );
  });

  it("does not let position protection override a hard reject", () => {
    const decision = scheduleNewestCandidate({
      candidate,
      tracked: [
        trackedMint("rejected-paper", {
          hardRejected: true,
          protectionReason: "paper_position"
        }),
        trackedMint("paper", { protectionReason: "paper_position" }),
        trackedMint("live", { protectionReason: "live_position" })
      ],
      policy,
      now
    });

    expect(decision.action).toBe("preempt");
    expect(decision.preemptMint).toBe("rejected-paper");
    expect(decision.protectedMints).toEqual(["live", "paper"]);
    expect(decision.reasonCodes).toContain("SCHEDULER_EVICT_HARD_REJECT");
  });

  it("keeps an existing subscription across migration discovery", () => {
    const decision = scheduleNewestCandidate({
      candidate: { ...candidate, migration: true, mint: "existing" },
      tracked: [trackedMint("existing")],
      policy,
      now
    });

    expect(decision.action).toBe("keep");
    expect(decision.reasonCodes).toContain("SCHEDULER_MIGRATION_CONTINUITY");
  });

  it("drops hard rejects before any capacity mutation", () => {
    const decision = scheduleNewestCandidate({
      candidate: { ...candidate, hardRejected: true },
      tracked: [trackedMint("one")],
      policy,
      now
    });

    expect(decision.action).toBe("drop");
    expect(decision.reasonCodes).toContain("SCHEDULER_DROP_HARD_REJECT");
  });

  it("drops an already tracked mint when it becomes hard rejected", () => {
    const decision = scheduleNewestCandidate({
      candidate: {
        ...candidate,
        hardRejected: true,
        mint: "already-tracked"
      },
      tracked: [trackedMint("already-tracked")],
      policy,
      now
    });

    expect(decision.action).toBe("drop");
    expect(decision.reasonCodes).toContain("SCHEDULER_DROP_HARD_REJECT");
  });

  it("evicts stale zero-trade slots before active weak slots", () => {
    const decision = scheduleNewestCandidate({
      candidate,
      tracked: [
        trackedMint("active", { score: 1, eventCount: 10 }),
        trackedMint("stale", {
          score: 99,
          eventCount: 0,
          subscribedAt: "2026-07-16T12:00:00.000Z"
        }),
        trackedMint("other", { score: 2, eventCount: 10 })
      ],
      policy,
      now
    });

    expect(decision.preemptMint).toBe("stale");
    expect(decision.reasonCodes).toContain("SCHEDULER_EVICT_STALE_NO_TRADES");
  });
});

function trackedMint(
  mint: string,
  overrides: Partial<TrackingSchedulerTrackedMint> = {}
): TrackingSchedulerTrackedMint {
  return {
    mint,
    subscribedAt: "2026-07-16T12:00:45.000Z",
    score: 50,
    phase: "watching",
    eventCount: 1,
    latestTradeAt: "2026-07-16T12:00:50.000Z",
    hardRejected: false,
    protectionReason: null,
    ...overrides
  };
}
