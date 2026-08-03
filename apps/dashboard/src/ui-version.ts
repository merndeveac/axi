export type AxiUiVersion = "legacy" | "v2";

export function resolveUiVersion(
  search: string,
  configuredVersion: string | undefined,
  fallback: AxiUiVersion = "v2"
): AxiUiVersion {
  const queryVersion = new URLSearchParams(search).get("ui");

  if (queryVersion === "legacy" || queryVersion === "v2") {
    return queryVersion;
  }

  if (configuredVersion === "legacy" || configuredVersion === "v2") {
    return configuredVersion;
  }

  return fallback;
}
