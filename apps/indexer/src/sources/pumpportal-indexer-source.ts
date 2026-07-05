export type PumpPortalIndexerSourceStatus = {
  available: false;
  provider: "pumpportal";
  reasonCodes: string[];
  message: string;
};

export function getPumpPortalIndexerSourceStatus(): PumpPortalIndexerSourceStatus {
  return {
    available: false,
    provider: "pumpportal",
    reasonCodes: ["PUMPPORTAL_INDEXER_BRIDGE_NOT_ENABLED"],
    message:
      "PumpPortal indexer bridge is a future adapter; current step uses existing API feed ingestion."
  };
}
