import type { MeteredLaunchDataService } from "./metered-launch-data-service";

export type TrackingCommandSource =
  | "metered_api"
  | "runtime_control"
  | "legacy_actual_data"
  | "legacy_launch"
  | "legacy_live_card";

export type TrackingCommandRouter = {
  track: (input: {
    mint: string;
    reason: string;
    source: TrackingCommandSource;
  }) => ReturnType<MeteredLaunchDataService["trackMint"]>;
  untrack: (input: {
    mint: string;
    reason: string;
    source: TrackingCommandSource;
  }) => ReturnType<MeteredLaunchDataService["untrackMint"]>;
};

export function createTrackingCommandRouter(
  meteredLaunchData: MeteredLaunchDataService
): TrackingCommandRouter {
  return {
    track: ({ mint, reason, source }) =>
      meteredLaunchData.trackMint(mint, `${source}:${reason}`),
    untrack: ({ mint, reason, source }) =>
      meteredLaunchData.untrackMint(mint, `${source}:${reason}`)
  };
}
