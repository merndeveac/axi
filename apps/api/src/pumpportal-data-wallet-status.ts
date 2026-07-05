import { loadApiConfig } from "./app";
import {
  createPumpPortalDataWalletConfig,
  createPumpPortalDataWalletService
} from "./pumpportal-data-wallet-service";

const config = loadApiConfig();
const dataWallet = createPumpPortalDataWalletService({
  config: createPumpPortalDataWalletConfig({
    apiKeyConfigured: config.PUMPPORTAL_API_KEY !== undefined,
    balanceRefreshMs: config.PUMPPORTAL_DATA_WALLET_BALANCE_REFRESH_MS,
    commitment: config.SOLANA_RPC_COMMITMENT,
    criticalBalanceSol: config.PUMPPORTAL_DATA_WALLET_CRITICAL_BALANCE_SOL,
    eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000,
    minBalanceSol: config.PUMPPORTAL_DATA_WALLET_MIN_BALANCE_SOL,
    publicKey: config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY,
    requestTimeoutMs: config.CHAIN_VERIFIER_REQUEST_TIMEOUT_MS,
    rpcHttpUrl: config.SOLANA_RPC_HTTP,
    targetBalanceSol: config.PUMPPORTAL_DATA_WALLET_TARGET_BALANCE_SOL,
    warnBalanceSol: config.PUMPPORTAL_DATA_WALLET_WARN_BALANCE_SOL
  })
});

const status = await dataWallet.refreshBalance({ force: true });

console.log(`apiKeyConfigured=${status.apiKeyConfigured}`);
console.log(`publicKeyConfigured=${status.publicKeyConfigured}`);
console.log(`publicKey=${status.publicKey ?? "--"}`);
console.log(`balanceSol=${status.balanceSol ?? "--"}`);
console.log(`balanceStatus=${status.balanceStatus}`);
console.log(
  `estimatedEventsRemaining=${status.estimatedEventsRemaining ?? "--"}`
);
console.log(`solanaRpcConfigured=${status.solanaRpcConfigured}`);
console.log(`reasonCodes=${status.reasonCodes.join(",")}`);
console.log("warning=DATA ONLY; PAPER ONLY; NO PRIVATE KEY STORED");
