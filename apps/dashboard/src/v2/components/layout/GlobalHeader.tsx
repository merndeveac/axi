import { Badge } from "../primitives/Badge";
import type { RefObject } from "react";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { RuntimeControlBar } from "./RuntimeControlBar";
import { SecondaryNavigation } from "./SecondaryNavigation";
import type { AppRoute, PrimaryRoute, SecondaryRoute } from "../../app/navigation";
import { useRuntimeStatus } from "../../data/hooks/useRuntimeStatus";
import { apiOfflineRuntime } from "../../fixtures/golden-path";
import { adaptRuntimeStatusV2 } from "../../data/runtime-adapter";
import { useRuntimeMutations } from "../../features/runtime/RuntimeMutations";

function ConnectionHealth() {
  const runtime = useRuntimeStatus();
  const apiOnline = runtime.isSuccess;
  const wsOnline = runtime.data?.websocketOnline ?? false;
  return (
    <div className="axi-v2-global-header__health" aria-label="Connection health">
      <span><i className={`axi-v2-dot ${apiOnline ? "axi-v2-dot--good" : "axi-v2-dot--warn"}`} />API</span>
      <span><i className={`axi-v2-dot ${wsOnline ? "axi-v2-dot--good" : "axi-v2-dot--warn"}`} />WebSocket</span>
      <span className="axi-v2-numeric">{runtime.dataUpdatedAt ? `Updated ${Math.max(0, Math.round((Date.now() - runtime.dataUpdatedAt) / 1_000))}s` : "Cached state"}</span>
    </div>
  );
}

function ConnectedRuntimeControlBar() {
  const runtime = useRuntimeStatus();
  const mutation = useRuntimeMutations();
  const summary = runtime.data ?? apiOfflineRuntime;
  const run = async (command: Parameters<typeof mutation.mutateAsync>[0]) => {
    const result = await mutation.mutateAsync(command);
    return { message: result.message, runtime: adaptRuntimeStatusV2(result.status) };
  };
  const busyAction = mutation.isPending
    ? mutation.variables.kind === "arm"
      ? "arm"
      : mutation.variables.kind === "start-metered"
        ? "start"
        : mutation.variables.kind === "stop-metered"
          ? "stop"
          : null
    : null;
  return (
    <RuntimeControlBar
      runtime={summary}
      busyAction={busyAction}
      onArm={(input) => run({ kind: "arm", input })}
      onStart={() => run({ kind: "start-metered" })}
      onStop={() => run({ kind: "stop-metered" })}
    />
  );
}

export function GlobalHeader({
  route,
  onNavigatePrimary,
  onNavigateSecondary,
  onOpenDiagnostics,
  diagnosticsTriggerRef
}: {
  route: AppRoute;
  onNavigatePrimary: (route: PrimaryRoute) => void;
  onNavigateSecondary: (route: SecondaryRoute) => void;
  onOpenDiagnostics: () => void;
  diagnosticsTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="axi-v2-global-header">
      <div className="axi-v2-global-header__top">
        <a className="axi-v2-brand" href="?ui=v2" aria-label="AXI Scanner home">
          AXI
        </a>
        <Badge tone="info">Paper only</Badge>
        <PrimaryNavigation route={route} onNavigate={onNavigatePrimary} />
        <ConnectionHealth />
        <SecondaryNavigation onNavigate={onNavigateSecondary} onOpenDiagnostics={onOpenDiagnostics} triggerRef={diagnosticsTriggerRef} />
      </div>
      <ConnectedRuntimeControlBar />
    </header>
  );
}
