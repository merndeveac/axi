import { loadApiConfig } from "./app";
import {
  createPumpPortalWalletsConfig,
  createPumpPortalWalletsService
} from "./pumpportal-wallets-service";

const config = loadApiConfig();
const wallets = createPumpPortalWalletsService({
  config: createWalletsConfigFromEnv()
});
const status = await wallets.refreshBalances({ force: true });

console.log(`dataWallet.apiKeyConfigured=${status.dataWallet.apiKeyConfigured}`);
console.log(
  `dataWallet.publicKeyConfigured=${status.dataWallet.publicKeyConfigured}`
);
console.log(`dataWallet.publicKey=${status.dataWallet.publicKey ?? "--"}`);
console.log(`dataWallet.balanceSol=${status.dataWallet.balanceSol ?? "--"}`);
console.log(`dataWallet.balanceStatus=${status.dataWallet.balanceStatus}`);
console.log(
  `tradingWallet.apiKeyConfigured=${status.tradingWallet.apiKeyConfigured}`
);
console.log(
  `tradingWallet.publicKeyConfigured=${status.tradingWallet.publicKeyConfigured}`
);
console.log(
  `tradingWallet.publicKey=${status.tradingWallet.publicKey ?? "--"}`
);
console.log(
  `tradingWallet.balanceSol=${status.tradingWallet.balanceSol ?? "--"}`
);
console.log(
  `tradingWallet.balanceStatus=${status.tradingWallet.balanceStatus}`
);
console.log(`sameWallet=${status.sameWallet}`);
console.log(`sameWalletWarning=${status.sameWalletWarning ?? "--"}`);
console.log(`solanaRpcConfigured=${status.solanaRpcConfigured}`);
console.log(`reasonCodes=${status.reasonCodes.join(",")}`);
console.log("warning=NO SECRETS PRINTED; NO PRIVATE KEY STORED; PAPER ONLY");

function createWalletsConfigFromEnv() {
  const dataApiKey = config.PUMPPORTAL_DATA_API_KEY ?? config.PUMPPORTAL_API_KEY;
  const sameWallet = config.PUMPPORTAL_USE_SAME_WALLET_FOR_DATA_AND_TRADING;
  const tradingApiKey = sameWallet
    ? (config.PUMPPORTAL_TRADING_API_KEY ?? dataApiKey)
    : config.PUMPPORTAL_TRADING_API_KEY;
  const tradingPublicKey = sameWallet
    ? (config.PUMPPORTAL_TRADING_WALLET_PUBLIC_KEY ??
      config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY)
    : config.PUMPPORTAL_TRADING_WALLET_PUBLIC_KEY;

  return createPumpPortalWalletsConfig({
    balanceRefreshMs: config.PUMPPORTAL_WALLET_BALANCE_REFRESH_MS,
    commitment: config.SOLANA_RPC_COMMITMENT,
    criticalBalanceSol: config.PUMPPORTAL_WALLET_MIN_BALANCE_SOL,
    dataWallet: {
      role: "data",
      apiKeyConfigured: dataApiKey !== undefined,
      publicKey: config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY
    },
    minBalanceSol: config.PUMPPORTAL_WALLET_MIN_BALANCE_SOL,
    requestTimeoutMs: config.CHAIN_VERIFIER_REQUEST_TIMEOUT_MS,
    rpcHttpUrl: config.SOLANA_RPC_HTTP,
    sameWalletAllowed: sameWallet,
    targetBalanceSol: config.PUMPPORTAL_WALLET_TARGET_BALANCE_SOL,
    tradingWallet: {
      role: "trading",
      apiKeyConfigured: tradingApiKey !== undefined,
      publicKey: tradingPublicKey
    },
    warnBalanceSol: config.PUMPPORTAL_WALLET_WARN_BALANCE_SOL
  });
}
