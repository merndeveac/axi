import type {
  UiAvailability,
  UiField,
  UiFieldSource
} from "@axi/shared";

type UiFieldOptions = {
  availability?: UiAvailability;
  source?: UiFieldSource;
  observedAt?: string | null;
  confidence?: number | null;
  reason?: string | null;
};

export function uiField<T = never>(
  value: null,
  options?: UiFieldOptions
): UiField<T>;
export function uiField<T>(value: T, options?: UiFieldOptions): UiField<T>;
export function uiField<T>(
  value: T | null,
  options: UiFieldOptions = {}
): UiField<T> {
  const availability =
    options.availability ?? (value === null ? "unavailable" : "available");

  return {
    value,
    availability,
    source: options.source ?? "unknown",
    observedAt: options.observedAt ?? null,
    confidence: options.confidence ?? null,
    ...(options.reason === undefined ? {} : { reason: options.reason })
  };
}

export function isFieldRenderable<T>(
  field: UiField<T>
): field is UiField<T> & { value: T } {
  return field.value !== null && field.availability !== "unavailable";
}

export function availabilityLabel(availability: UiAvailability): string {
  switch (availability) {
    case "available":
      return "Available";
    case "stale":
      return "Stale";
    case "unproven":
      return "Unproven";
    case "unavailable":
      return "Unavailable";
  }
}
