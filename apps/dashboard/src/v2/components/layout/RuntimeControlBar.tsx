import type { RuntimeSummaryV2 } from "@axi/shared";
import { CircleStop, Play, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { formatSolV2 } from "../../lib/formatters";
import { Badge } from "../primitives/Badge";
import { Button } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";
import { Divider } from "../primitives/Divider";
import { Metric } from "../primitives/Metric";

export function RuntimeControlBar({ runtime }: { runtime: RuntimeSummaryV2 }) {
  const [armOpen, setArmOpen] = useState(false);
  const armButtonRef = useRef<HTMLButtonElement>(null);
  const stopVisible = runtime.phase === "ACTIVE" || runtime.canStop.allowed;

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
        <Button ref={armButtonRef} size="compact" onClick={() => setArmOpen(true)} disabled={!runtime.canArm.allowed} title={runtime.canArm.blocker ?? undefined}>
          <ShieldCheck size={14} aria-hidden="true" /> Arm
        </Button>
        <Button size="compact" tone="primary" disabled={!runtime.canStart.allowed} title={runtime.canStart.blocker ?? undefined}>
          <Play size={14} aria-hidden="true" /> Start
        </Button>
        {stopVisible ? (
          <Button size="compact" tone="danger" disabled={!runtime.canStop.allowed} title={runtime.canStop.blocker ?? undefined}>
            <CircleStop size={14} aria-hidden="true" /> Stop metered
          </Button>
        ) : (
          <Button size="compact" tone="quiet" disabled title={runtime.canStop.blocker ?? undefined}>
            <CircleStop size={14} aria-hidden="true" /> Stop
          </Button>
        )}
      </div>
      <Divider />
      <div className="axi-v2-runtime-bar__metrics">
        <Metric label="Spend" value={formatSolV2(runtime.spendSol.value)} />
        <Metric label="Cap" value={formatSolV2(runtime.capSol.value)} />
        <Metric label="Remaining" value={formatSolV2(runtime.remainingSol.value)} />
        <Metric label="Tracked" value={`${runtime.trackedMintCount.value ?? "—"}/${runtime.maximumConcurrentMints}`} />
      </div>
      <p className="axi-v2-runtime-bar__warning" title={runtime.warning ?? undefined}>
        {runtime.warning ?? runtime.canStart.blocker ?? "Runtime ready"}
      </p>
      <Dialog
        open={armOpen}
        onOpenChange={setArmOpen}
        restoreFocusRef={armButtonRef}
        title="Arm bounded metered data"
        description="This acknowledges data-stream cost only. It cannot trade or sign transactions."
      >
        <div className="axi-v2-arm-summary">
          <Metric label="Maximum session" value={formatSolV2(runtime.capSol.value ?? 0.0001)} />
          <Metric label="Concurrent mints" value={runtime.maximumConcurrentMints || 3} />
          <Metric label="Maximum events" value={runtime.maximumEvents || 1_000} />
        </div>
        <label className="axi-v2-checkbox">
          <input type="checkbox" />
          I acknowledge the bounded metered-data cost.
        </label>
        <div className="axi-v2-dialog__footer">
          <Button tone="primary">Acknowledge and arm</Button>
        </div>
      </Dialog>
    </div>
  );
}
