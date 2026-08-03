import type { MomentumScannerSummaryV2 } from "@axi/shared";

export function readinessCopy(samples: number): string {
  if (samples >= 3) return `${samples} samples · d2 ready`;
  if (samples === 2) return "2 samples · d1 ready";
  if (samples === 1) return "1 sample · observed";
  return "0 samples · discovery";
}

export function SampleReadiness({
  readiness
}: {
  readiness: MomentumScannerSummaryV2["readiness"];
}) {
  return (
    <div className="axi-v2-readiness">
      <span className="axi-v2-readiness__dots" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <i key={step} data-ready={readiness.validSampleCount >= step} />
        ))}
      </span>
      <strong>{readinessCopy(readiness.validSampleCount)}</strong>
      <span>{readiness.trackingState.replaceAll("_", " ")}</span>
    </div>
  );
}
