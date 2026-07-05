import {
  createIndexerEventId,
  indexerReasonCodes,
  type NormalizedIndexerEvent
} from "@axi/indexer-core";

export type MockIndexerSource = {
  name: "mock";
  start: (handler: (event: NormalizedIndexerEvent) => void) => void;
  stop: () => void;
};

export function createMockIndexerSource(options: {
  now?: () => Date;
} = {}): MockIndexerSource {
  const now = options.now ?? (() => new Date());
  let stopped = false;

  return {
    name: "mock",
    start: (handler) => {
      stopped = false;

      for (const event of createMockIndexerEvents(now())) {
        if (stopped) {
          return;
        }

        handler(event);
      }
    },
    stop: () => {
      stopped = true;
    }
  };
}

export function createMockIndexerEvents(now: Date): NormalizedIndexerEvent[] {
  const receivedAt = now.toISOString();
  const mint = "MockIndexerMint11111111111111111111111111";
  const createdBase = {
    schemaVersion: 1 as const,
    source: "mock",
    sourceMode: "mock" as const,
    chain: "solana" as const,
    receivedAt,
    reasonCodes: [
      indexerReasonCodes.schemaV1,
      indexerReasonCodes.sourceMock,
      indexerReasonCodes.eventNormalized
    ]
  };

  return [
    {
      ...createdBase,
      id: createIndexerEventId({
        type: "token_created",
        mint,
        source: "mock",
        receivedAt,
        sequence: 1
      }),
      type: "token_created",
      mint,
      name: "Mock Indexer Token",
      symbol: "MIDX",
      metadataUri: null,
      creator: "MockCreator111111111111111111111111111111",
      bondingCurve: "MockBondingCurve111111111111111111111111",
      associatedBondingCurve: null,
      initialBuySol: 1,
      marketCapSol: 42
    },
    {
      ...createdBase,
      id: createIndexerEventId({
        type: "token_trade",
        mint,
        source: "mock",
        receivedAt,
        sequence: 2
      }),
      type: "token_trade",
      mint,
      side: "buy",
      trader: "MockBuyer1111111111111111111111111111111",
      priceSol: 0.00042,
      priceUsd: null,
      volumeSol: 1.5,
      volumeUsd: null,
      tokenAmount: 3571,
      pool: null,
      bondingCurve: "MockBondingCurve111111111111111111111111",
      confidence: "high",
      usableForMetrics: true,
      reasonCodes: [
        indexerReasonCodes.schemaV1,
        indexerReasonCodes.sourceMock,
        indexerReasonCodes.eventUsableForMetrics
      ]
    },
    {
      ...createdBase,
      id: createIndexerEventId({
        type: "holder_snapshot",
        mint,
        source: "mock",
        receivedAt,
        sequence: 3
      }),
      type: "holder_snapshot",
      mint,
      holderCount: 25,
      topHolderPct: 8,
      top10HolderPct: 28,
      source: "mock"
    }
  ];
}
