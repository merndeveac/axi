export function getCoverageOwnedSubscriptionWindowMs(input: {
  maxRuntimeMs: number;
  postStopGraceMs: number;
}): number {
  const maxRuntimeMs = Math.max(1, Math.floor(input.maxRuntimeMs));
  const postStopGraceMs = Math.max(0, Math.floor(input.postStopGraceMs));
  return maxRuntimeMs + postStopGraceMs + 1;
}
