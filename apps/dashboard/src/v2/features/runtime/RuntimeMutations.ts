import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../data/api-client";
import { queryKeys } from "../../data/query-keys";
import type { CanonicalRuntimeStatus } from "../../data/runtime-adapter";

export type MeteredArmInput = {
  ackCost: true;
  maxSessionCostSol: number;
  maxConcurrentMints: number;
  maxEventsPerSession: number;
  startAfterAck?: boolean;
};

export type RuntimeCommand =
  | { kind: "arm"; input: MeteredArmInput }
  | { kind: "start-metered" }
  | { kind: "stop-metered" }
  | { kind: "start-discovery" }
  | { kind: "stop-discovery" }
  | { kind: "restart-discovery" }
  | { kind: "refresh-wallet" };

export type RuntimeCommandResult = {
  ok: boolean;
  message: string;
  status: CanonicalRuntimeStatus;
  paperOnly: true;
  tradingDisabled: true;
};

function commandRequest(command: RuntimeCommand) {
  switch (command.kind) {
    case "arm":
      return apiClient.post<RuntimeCommandResult>(
        "/runtime/metered-launch-data/ack-session",
        command.input
      );
    case "start-metered":
      return apiClient.post<RuntimeCommandResult>(
        "/runtime/metered-launch-data/start"
      );
    case "stop-metered":
      return apiClient.post<RuntimeCommandResult>(
        "/runtime/metered-launch-data/stop"
      );
    case "start-discovery":
      return apiClient.post<RuntimeCommandResult>(
        "/runtime/live-discovery/start"
      );
    case "stop-discovery":
      return apiClient.post<RuntimeCommandResult>(
        "/runtime/live-discovery/stop"
      );
    case "restart-discovery":
      return apiClient.post<RuntimeCommandResult>(
        "/runtime/live-discovery/restart"
      );
    case "refresh-wallet":
      return apiClient.post<RuntimeCommandResult>("/runtime/data-wallet/refresh");
  }
}

export function useRuntimeMutations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commandRequest,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.runtime, result.status);
      void queryClient.invalidateQueries({ queryKey: queryKeys.runtime });
    }
  });
}
