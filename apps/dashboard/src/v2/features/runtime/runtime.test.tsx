// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeControlBar, type RuntimeActionOutcome } from "../../components/layout/RuntimeControlBar";
import { meteredActive, meteredArmRequired, meteredReady } from "../../fixtures/golden-path";
import { adaptRuntimeStatusV2, type CanonicalRuntimeStatus } from "../../data/runtime-adapter";
import { RuntimePageView } from "./RuntimePage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("canonical runtime controls", () => {
  it.each([
    [false, false, false],
    [false, false, true],
    [false, true, false],
    [false, true, true],
    [true, false, false],
    [true, false, true],
    [true, true, false],
    [true, true, true]
  ])("uses the backend gate matrix verbatim: arm=%s start=%s stop=%s", (canArm, canStart, canStop) => {
    render(<RuntimeControlBar runtime={{ ...meteredActive, canArm: { allowed: canArm, blocker: canArm ? null : "canonical arm blocker" }, canStart: { allowed: canStart, blocker: canStart ? null : "canonical start blocker" }, canStop: { allowed: canStop, blocker: canStop ? null : "canonical stop blocker" } }} />);
    const arm = screen.getByRole("button", { name: /^arm$/i });
    const start = screen.getByRole("button", { name: /^start$/i });
    const stop = screen.getByRole("button", { name: /stop metered/i });
    if (canArm) expect(arm).toBeEnabled(); else expect(arm).toBeDisabled();
    if (canStart) expect(start).toBeEnabled(); else expect(start).toBeDisabled();
    if (canStop) expect(stop).toBeEnabled(); else expect(stop).toBeDisabled();
    if (!canStart) expect(screen.getByRole("button", { name: /^start$/i })).toHaveAttribute("title", "canonical start blocker");
  });

  it("requires explicit ACK and submits only backend-bounded values", async () => {
    const user = userEvent.setup();
    const onArm = vi.fn(async (): Promise<RuntimeActionOutcome> => ({ message: "Session armed.", runtime: meteredReady }));
    render(<RuntimeControlBar runtime={meteredArmRequired} onArm={onArm} />);
    await user.click(screen.getByRole("button", { name: /^arm$/i }));
    const submit = screen.getByRole("button", { name: "Acknowledge and arm" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /explicitly acknowledge/i }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(onArm).toHaveBeenCalledWith({ ackCost: true, maxSessionCostSol: 0.0001, maxConcurrentMints: 3, maxEventsPerSession: 1_000, startAfterAck: false }));
    expect(window.localStorage.length).toBe(0);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText(/Resulting state: READY/)).toBeInTheDocument();
  });

  it("reports pending, failure, and successful Stop state", async () => {
    const user = userEvent.setup();
    let rejectStart: ((error: Error) => void) | undefined;
    const onStart = vi.fn(() => new Promise<RuntimeActionOutcome>((_resolve, reject) => { rejectStart = reject; }));
    const { rerender } = render(<RuntimeControlBar runtime={meteredReady} onStart={onStart} />);
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Starting bounded metered data");
    rejectStart?.(new Error("canonical start rejected"));
    expect(await screen.findByRole("alert")).toHaveTextContent("canonical start rejected");

    const onStop = vi.fn(async (): Promise<RuntimeActionOutcome> => ({ message: "Metered data stopped.", runtime: { ...meteredActive, phase: "STOPPED" } }));
    rerender(<RuntimeControlBar runtime={meteredActive} onStop={onStop} />);
    await user.click(screen.getByRole("button", { name: /stop metered/i }));
    expect(await screen.findByText(/Resulting state: STOPPED/)).toBeInTheDocument();
  });

  it("keeps ACK on browser remount but resets it when the canonical API process changes", () => {
    const armed = canonicalRuntime({ acknowledged: true, canStart: true, pid: 11 });
    const first = render(<RuntimeControlBar runtime={adaptRuntimeStatusV2(armed)} />);
    expect(screen.getByRole("button", { name: /^start$/i })).toBeEnabled();
    first.unmount();
    render(<RuntimeControlBar runtime={adaptRuntimeStatusV2(armed)} />);
    expect(screen.getByRole("button", { name: /^start$/i })).toBeEnabled();
    cleanup();
    const restarted = canonicalRuntime({ acknowledged: false, canStart: false, pid: 12 });
    render(<RuntimeControlBar runtime={adaptRuntimeStatusV2(restarted)} />);
    expect(screen.getByRole("button", { name: /^start$/i })).toBeDisabled();
    expect(adaptRuntimeStatusV2(restarted).processSessionId).not.toBe(adaptRuntimeStatusV2(armed).processSessionId);
  });

  it("copies only the public wallet address and exposes no trading controls or secret fields", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const status = canonicalRuntime({ acknowledged: false, canStart: false, pid: 13 });
    render(<RuntimePageView status={status} trackedMints={[]} onCommand={vi.fn()} onOpenEvidence={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Copy public address" }));
    expect(writeText).toHaveBeenCalledWith(status.dataWallet.publicKey);
    expect(await screen.findByText("Public data-wallet address copied")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buy|sell|trade|sign|lightning/i })).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});

function canonicalRuntime({ acknowledged, canStart, pid }: { acknowledged: boolean; canStart: boolean; pid: number }): CanonicalRuntimeStatus {
  return {
    controlPlaneEnabled: true,
    localOnly: true,
    runtimeMode: "paper",
    paperOnly: true,
    tradingDisabled: true,
    api: { online: true, wsOnline: true, lastUpdatedAt: "2026-08-03T12:00:00.000Z" },
    liveDiscovery: { enabled: true, provider: "pumpportal", connected: true, connecting: false, stopped: false, lastStartedAt: null, lastStoppedAt: null, lastEventAt: null, newTokenEventCount: 1, migrationEventCount: 0, errorCount: 0, lastError: null, reasonCodes: [] },
    meteredPriceAction: { state: acknowledged ? "READY" : "ARM_REQUIRED", canArm: !acknowledged, canStart, canStop: false, acknowledgedCost: acknowledged, trackedMintCount: 0, estimatedCostSol: 0, sessionCostCapSol: 0.0001, budgetRemainingSol: 0.0001, maxConcurrentMints: 3, maxEventsPerSession: 1_000, maxUiSessionCostSol: 0.0005, eventCount: 0, provider: "pumpportal", active: false, latestEventAt: null, blockers: canStart ? [] : ["Explicit cost ACK required"], warnings: [] },
    dataWallet: { publicKeyConfigured: true, publicKey: "PublicDataWallet111111111111111111111111", shortPublicKey: "Public…111111", apiKeyConfigured: true, balanceSol: 0.01, balanceStatus: "ok", estimatedEventsRemaining: 100_000, lastBalanceCheckAt: null, reasonCodes: [] },
    process: { pid, startedAt: `2026-08-03T12:00:${pid}.000Z` },
    safety: { accountTradesEnabled: false, lightningExecutionEnabled: false, localTransactionApiEnabled: false, privateKeysLoaded: false, liveTradingEnabled: false }
  };
}
