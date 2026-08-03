import type { UiField } from "@axi/shared";
import { AlertTriangle } from "lucide-react";

export function FreshnessIndicator({ field }: { field: UiField<number> }) {
  if (field.availability === "stale") {
    return <span className="axi-v2-freshness axi-v2-freshness--stale"><AlertTriangle size={11} /> stale {field.value === null ? "" : `${Math.round(field.value / 1_000)}s`}</span>;
  }
  if (field.availability === "unproven") {
    return <span className="axi-v2-freshness axi-v2-freshness--unproven">unproven</span>;
  }
  if (field.value === null) return <span className="axi-v2-freshness">freshness —</span>;
  return <span className="axi-v2-freshness">{Math.max(0, Math.round(field.value / 1_000))}s fresh</span>;
}
