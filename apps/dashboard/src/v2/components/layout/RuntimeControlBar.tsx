import type { RuntimeSummaryV2 } from "@axi/shared";
import { CircleStop, Play, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MeteredArmInput } from "../../features/runtime/RuntimeMutations";
import { formatSolV2 } from "../../lib/formatters";
import { Badge } from "../primitives/Badge";
import { Button } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";
import { Divider } from "../primitives/Divider";
import { Metric } from "../primitives/Metric";

export type RuntimeActionOutcome = {
  message: string;
  runtime: RuntimeSummaryV2;
};

export function RuntimeControlBar({
  runtime,
  busyAction = null,
  onArm,
  onStart,
  onStop
}: {
  runtime: RuntimeSummaryV2;
  busyAction?: "arm" | "start" | "stop" | null;
  onArm?: (input: MeteredArmInput) => Promise<RuntimeActionOutcome>;
  onStart?: () => Promise<RuntimeActionOutcome>;
  onStop?: () => Promise<RuntimeActionOutcome>;
}) {
  const [armOpen, setArmOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [maximumSessionCostSol, setMaximumSessionCostSol] = useState(
    runtime.capSol.value ?? 0.0001
  );
  const [maximumConcurrentMints, setMaximumConcurrentMints] = useState(
    runtime.maximumConcurrentMints || 3
  );
  const [maximumEvents, setMaximumEvents] = useState(
    runtime.maximumEvents || 1_000
  );
  const [feedback, setFeedback] = useState<{
    tone: "status" | "alert";
    text: string;
  } | null>(null);
  const armButtonRef = useRef<HTMLButtonElement>(null);
  const pending = busyAction !== null;
  const valuesAreBounded =
    maximumSessionCostSol > 0 &&
    maximumSessionCostSol <= runtime.maximumSessionCostSol &&
    Number.isInteger(maximumConcurrentMints) &&
    maximumConcurrentMints > 0 &&
    maximumConcurrentMints <= runtime.maximumConcurrentMints &&
    Number.isInteger(maximumEvents) &&
    maximumEvents > 0 &&
    maximumEvents <= runtime.maximumEvents;

  useEffect(() => {
    if (!armOpen) return;
    setAcknowledged(false);
    setMaximumSessionCostSol(runtime.capSol.value ?? 0.0001);
    setMaximumConcurrentMints(runtime.maximumConcurrentMints || 3);
    setMaximumEvents(runtime.maximumEvents || 1_000);
    setFeedback(null);
  }, [armOpen, runtime.capSol.value, runtime.maximumConcurrentMints, runtime.maximumEvents]);

  async function runAction(
    action: (() => Promise<RuntimeActionOutcome>) | undefined,
    pendingText: string
  ) {
    if (!action) return;
    setFeedback({ tone: "status", text: pendingText });
    try {
      const result = await action();
      setFeedback({
        tone: "status",
        text: `${result.message} Resulting state: ${result.runtime.phase}.`
      });
      return result;
    } catch (error) {
      setFeedback({
        tone: "alert",
        text: error instanceof Error ? error.message : "Runtime request failed"
      });
      return undefined;
    }
  }

  return (
    <div className="axi-v2-runtime-bar" aria-label="Metered runtime controls">
      <div className="axi-v2-runtime-bar__status">
        <Badge tone={runtime.discovery === "active" ? "positive" : "warning"}>
          Discovery {runtime.discovery}
        </Badge>
        <span className="axi-v2-runtime-bar__wallet">
          Data wallet {runtime.walletBalanceSol.value === null ? "unknown" : formatSolV2(runtime.walletBalanceSol.value)}
        </span>
      </div>
      <Divider />
      <div className="axi-v2-runtime-bar__actions">
        <Button
          ref={armButtonRef}
          size="compact"
          onClick={() => setArmOpen(true)}
          disabled={!runtime.canArm.allowed || pending}
          title={runtime.canArm.blocker ?? undefined}
        >
          <ShieldCheck size={14} aria-hidden="true" /> {busyAction === "arm" ? "Arming…" : "Arm"}
        </Button>
        <Button
          size="compact"
          tone="primary"
          disabled={!runtime.canStart.allowed || pending}
          title={runtime.canStart.blocker ?? undefined}
          onClick={() => { void runAction(onStart, "Starting bounded metered data…"); }}
        >
          <Play size={14} aria-hidden="true" /> {busyAction === "start" ? "Starting…" : "Start"}
        </Button>
        <Button
          size="compact"
          tone={runtime.phase === "ACTIVE" ? "danger" : "quiet"}
          disabled={!runtime.canStop.allowed || pending}
          title={runtime.canStop.blocker ?? undefined}
          onClick={() => { void runAction(onStop, "Stopping metered data…"); }}
        >
          <CircleStop size={14} aria-hidden="true" /> {busyAction === "stop" ? "Stopping…" : runtime.phase === "ACTIVE" ? "Stop metered" : "Stop"}
        </Button>
      </div>
      <Divider />
      <div className="axi-v2-runtime-bar__metrics">
        <Metric label="Spend" value={formatSolV2(runtime.spendSol.value)} />
        <Metric label="Cap" value={formatSolV2(runtime.capSol.value)} />
        <Metric label="Remaining" value={formatSolV2(runtime.remainingSol.value)} />
        <Metric label="Tracked" value={`${runtime.trackedMintCount.value ?? "—"}/${runtime.maximumConcurrentMints}`} />
      </div>
      <p
        className={`axi-v2-runtime-bar__warning${feedback?.tone === "alert" ? " axi-v2-runtime-bar__warning--error" : ""}`}
        role={feedback?.tone ?? undefined}
        title={feedback?.text ?? runtime.warning ?? undefined}
      >
        {feedback?.text ?? runtime.warning ?? runtime.canStart.blocker ?? "Runtime ready"}
      </p>
      <Dialog
        open={armOpen}
        onOpenChange={(open) => { if (!pending) setArmOpen(open); }}
        restoreFocusRef={armButtonRef}
        title="Arm bounded metered data"
        description="This acknowledges data-stream cost only. It cannot trade or sign transactions. ACK belongs to this API process session and is never stored in the browser."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!acknowledged || !valuesAreBounded || !onArm) return;
            void runAction(
              () => onArm({
                ackCost: true,
                maxSessionCostSol: maximumSessionCostSol,
                maxConcurrentMints: maximumConcurrentMints,
                maxEventsPerSession: maximumEvents,
                startAfterAck: false
              }),
              "Arming bounded metered data…"
            ).then((result) => {
              if (result) setArmOpen(false);
            });
          }}
        >
          <div className="axi-v2-arm-fields">
            <label>
              <span>Maximum session SOL</span>
              <input
                aria-label="Maximum session SOL"
                type="number"
                min="0.000000001"
                max={runtime.maximumSessionCostSol}
                step="0.000000001"
                value={maximumSessionCostSol}
                onChange={(event) => setMaximumSessionCostSol(event.currentTarget.valueAsNumber)}
              />
              <small>Backend ceiling {formatSolV2(runtime.maximumSessionCostSol)}</small>
            </label>
            <label>
              <span>Maximum concurrent mints</span>
              <input
                aria-label="Maximum concurrent mints"
                type="number"
                min="1"
                max={runtime.maximumConcurrentMints}
                step="1"
                value={maximumConcurrentMints}
                onChange={(event) => setMaximumConcurrentMints(event.currentTarget.valueAsNumber)}
              />
            </label>
            <label>
              <span>Maximum events</span>
              <input
                aria-label="Maximum events"
                type="number"
                min="1"
                max={runtime.maximumEvents}
                step="1"
                value={maximumEvents}
                onChange={(event) => setMaximumEvents(event.currentTarget.valueAsNumber)}
              />
            </label>
          </div>
          <label className="axi-v2-checkbox">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
            />
            I explicitly acknowledge the bounded metered-data cost.
          </label>
          {!valuesAreBounded ? <p className="axi-v2-form-error" role="alert">Values must be positive and no greater than the backend-provided bounds.</p> : null}
          {feedback ? <p className="axi-v2-dialog-feedback" role={feedback.tone}>{feedback.text}</p> : null}
          <div className="axi-v2-dialog__footer">
            <Button tone="primary" type="submit" disabled={!acknowledged || !valuesAreBounded || pending || !onArm}>
              {busyAction === "arm" ? "Arming…" : "Acknowledge and arm"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
