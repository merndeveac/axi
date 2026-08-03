import type {
  MomentumScannerRow,
  MomentumScannerSummaryV2,
  ScannerReadinessV2,
  ScannerSignalV2,
  UiField,
  UiFieldSource
} from "@axi/shared";
import { uiField } from "./ui-field";

function sourceFor(row: MomentumScannerRow): UiFieldSource {
  if (row.priceSource?.includes("curve")) return "curve";
  if (row.realTradeEventCount > 0) return "token_trade";
  return "unknown";
}

function fromValue<T>(
  value: T | null,
  source: UiFieldSource,
  observedAt: string | null,
  unavailableFields: readonly string[],
  fieldName: string,
  staleFields: readonly string[] = []
): UiField<T> {
  const unavailable = value === null || unavailableFields.includes(fieldName);
  const fieldOptions = {
    availability: unavailable
      ? ("unavailable" as const)
      : staleFields.includes(fieldName)
        ? ("stale" as const)
        : ("available" as const),
    source,
    observedAt,
    reason: unavailable ? `${fieldName} unavailable` : null
  };
  return unavailable
    ? uiField<T>(null, fieldOptions)
    : uiField(value as T, fieldOptions);
}

function readinessFor(samples: number): ScannerReadinessV2 {
  if (samples >= 3) return "d2_ready";
  if (samples === 2) return "d1_ready";
  if (samples === 1) return "observed";
  return "discovery";
}

export function adaptMomentumScannerRowV2(
  row: MomentumScannerRow,
  order = 0,
  rowVersion = 1
): MomentumScannerSummaryV2 {
  const observedAt = row.lastUpdatedAt;
  const marketSource = sourceFor(row);
  const samples = row.data.validTradeSampleCount;
  const signal = row.signalDisplay.label as ScannerSignalV2;
  const combined = row.derivativeStrength.combinedDerivativeScore;

  return {
    mint: row.mint,
    rowVersion,
    order,
    firstSeenAt: row.launchedAt ?? row.latestEventAt ?? observedAt ?? "",
    latestEventAt: row.latestEventAt,
    identity: {
      displayName: row.displayName,
      symbol: row.symbol,
      shortMint: row.shortMint,
      imageUri: fromValue(
        row.imageUri,
        "enrichment",
        observedAt,
        row.unavailableFields,
        "imageUri",
        row.staleFields
      ),
      ageSeconds: fromValue(
        row.ageSeconds,
        "unknown",
        observedAt,
        row.unavailableFields,
        "ageSeconds",
        row.staleFields
      ),
      migrationStatus: row.migrationStatus
    },
    readiness: {
      trackingState: row.trackingState,
      state: readinessFor(samples),
      validSampleCount: samples,
      d1Ready: samples >= 2,
      d2Ready: samples >= 3,
      freshnessMs: fromValue(
        row.marketDataFreshnessMs,
        marketSource,
        observedAt,
        row.unavailableFields,
        "marketDataFreshnessMs",
        row.staleFields
      ),
      isProtected: row.data.isProtected
    },
    market: {
      priceSol: fromValue(
        row.priceSol,
        marketSource,
        observedAt,
        row.unavailableFields,
        "priceSol",
        row.staleFields
      ),
      priceUsd: fromValue(
        row.priceUsd,
        "enrichment",
        observedAt,
        row.unavailableFields,
        "priceUsd",
        row.staleFields
      ),
      marketCapSol: fromValue(
        row.marketCapSol,
        marketSource,
        observedAt,
        row.unavailableFields,
        "marketCapSol",
        row.staleFields
      ),
      marketCapUsd: fromValue(
        row.marketCapUsd,
        "enrichment",
        observedAt,
        row.unavailableFields,
        "marketCapUsd",
        row.staleFields
      ),
      liquiditySol: fromValue(
        row.curve.curveLiquiditySol,
        "curve",
        observedAt,
        row.unavailableFields,
        "liquiditySol",
        row.staleFields
      ),
      liquidityUsd: fromValue(
        row.liquidityUsd,
        "enrichment",
        observedAt,
        row.unavailableFields,
        "liquidityUsd",
        row.staleFields
      ),
      liquidityKind:
        row.curve.curveLiquiditySol !== null
          ? "curve"
          : row.liquidityUsd !== null
            ? "dex"
            : "unavailable"
    },
    flow: {
      volume10sSol: fromValue(
        row.volume10sSol,
        "token_trade",
        observedAt,
        row.unavailableFields,
        "volume10sSol",
        row.staleFields
      ),
      transactionCount10s: fromValue(
        row.tradeCount10s,
        "token_trade",
        observedAt,
        row.unavailableFields,
        "tradeCount10s",
        row.staleFields
      ),
      uniqueBuyers10s: fromValue(
        row.uniqueBuyers10s,
        "token_trade",
        observedAt,
        row.unavailableFields,
        "uniqueBuyers10s",
        row.staleFields
      ),
      buyPressure: fromValue(
        row.netBuyPressure,
        "token_trade",
        observedAt,
        row.unavailableFields,
        "netBuyPressure",
        row.staleFields
      )
    },
    momentum: {
      priceD1: fromValue(
        row.derivatives.dPricePctPerSec,
        "token_trade",
        observedAt,
        row.unavailableFields,
        "dPricePctPerSec",
        row.staleFields
      ),
      priceD2: fromValue(
        row.derivatives.d2PricePctPerSec2,
        "token_trade",
        observedAt,
        row.unavailableFields,
        "d2PricePctPerSec2",
        row.staleFields
      ),
      volumeD1: fromValue(
        row.derivatives.dVol10sSolPerSec,
        "token_trade",
        observedAt,
        row.unavailableFields,
        "dVol10sSolPerSec",
        row.staleFields
      ),
      volumeD2: fromValue(
        row.derivatives.d2VolSolPerSec2,
        "token_trade",
        observedAt,
        row.unavailableFields,
        "d2VolSolPerSec2",
        row.staleFields
      ),
      normalizedStrength: uiField(combined.totalScore, {
        source: "token_trade",
        observedAt,
        confidence: row.derivativeStrength.volume.confidence.overall
      }),
      confidence: uiField(
        row.derivativeStrength.volume.confidence.overall,
        { source: "token_trade", observedAt }
      )
    },
    decision: {
      signal,
      score: row.signalDisplay.score,
      topDriver: row.signalDisplay.topDriver,
      topBlocker: row.signalDisplay.topBlocker,
      riskLevel: row.riskLevel,
      hardReject: row.hardReject,
      referencePolicy: true
    },
    position: {
      status: row.paperPositionStatus,
      unrealizedPnlPct: fromValue(
        row.unrealizedPnlPct,
        "portfolio",
        observedAt,
        row.unavailableFields,
        "unrealizedPnlPct",
        row.staleFields
      ),
      unrealizedPnlSol: fromValue(
        row.unrealizedPnlSol,
        "portfolio",
        observedAt,
        row.unavailableFields,
        "unrealizedPnlSol",
        row.staleFields
      ),
      exitSignal: row.latestPaperExitSignal?.signalId ?? null
    },
    sparkline: {
      values: row.sparkline.points.map((point) => point.priceSol),
      source:
        row.sparkline.source === "trade_samples"
          ? "token_trade"
          : row.sparkline.source === "curve_marks"
            ? "curve"
            : "unknown"
    }
  };
}
