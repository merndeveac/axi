import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";

export type WatchedWalletSetting = {
  address: string;
  alias: string | null;
  tags: string[];
  enabled: boolean;
};

export type ExitRuleSetting = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  minProfitPct: number;
  sellPct: number;
};

export function useWatchedWalletSettings(enabled = true) {
  return useQuery({
    queryKey: ["settings", "watched-wallets"],
    queryFn: ({ signal }) =>
      apiClient.get<{ current: WatchedWalletSetting[] }>("/exit/wallets", { signal }),
    enabled,
    staleTime: 10_000
  });
}

export function useExitRuleSettings(enabled = true) {
  return useQuery({
    queryKey: ["settings", "exit-rules"],
    queryFn: ({ signal }) =>
      apiClient.get<{ current: ExitRuleSetting[] }>("/exit/rules", { signal }),
    enabled,
    staleTime: 10_000
  });
}
