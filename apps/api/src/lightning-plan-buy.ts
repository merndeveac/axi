import { loadApiConfig } from "./app";
import {
  createLightningReadinessConfig,
  createLightningReadinessService
} from "./lightning-readiness-service";
import {
  createPumpPortalWalletsConfig,
  createPumpPortalWalletsService
} from "./pumpportal-wallets-service";

const args = parseArgs(process.argv.slice(2));
const mint = args["mint"];
const amountSol = Number(args["amount-sol"]);

if (!mint || !Number.isFinite(amountSol) || amountSol <= 0) {
  console.error("Usage: lightning:plan-buy -- --mint <MINT> --amount-sol 0.001");
  process.exitCode = 1;
} else {
  const config = loadApiConfig();
  const wallets = createPumpPortalWalletsService({
    config: createWalletsConfigFromEnv(config)
  });
  await wallets.refreshBalances({ force: true });
  const lightning = createLightningReadinessService({
    config: createLightningConfigFromEnv(config),
    wallets
  });
  const plan = lightning.createBuyPlan({
    mint,
    amountSol,
    reason: args["reason"] ?? "cli"
  });

  console.log(
    JSON.stringify(
      {
        ...plan,
        noTransactionSent: true,
        paperOnly: true,
        tradingDisabled: true
      },
      null,
      2
    )
  );
}

function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg?.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const value = argv[index + 1];

    if (value && !value.startsWith("--")) {
      parsed[key] = value;
      index += 1;
    }
  }

  return parsed;
}

function createWalletsConfigFromEnv(config: ReturnType<typeof loadApiConfig>) {
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

function createLightningConfigFromEnv(config: ReturnType<typeof loadApiConfig>) {
  return createLightningReadinessConfig({
    enabled: config.PUMPPORTAL_LIGHTNING_READINESS_ENABLED,
    liveTradingAllowed: config.PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING,
    manualArmRequired: config.PUMPPORTAL_LIGHTNING_REQUIRE_MANUAL_ARM,
    manualArmed: config.PUMPPORTAL_LIGHTNING_MANUAL_ARMED,
    baseUrl: config.PUMPPORTAL_LIGHTNING_BASE_URL,
    limits: {
      maxBuySol: config.PUMPPORTAL_LIGHTNING_MAX_BUY_SOL,
      maxDailySol: config.PUMPPORTAL_LIGHTNING_MAX_DAILY_SOL,
      maxOpenPositions: config.PUMPPORTAL_LIGHTNING_MAX_OPEN_POSITIONS,
      maxSlippagePct: config.PUMPPORTAL_LIGHTNING_MAX_SLIPPAGE_PCT,
      priorityFeeSol: config.PUMPPORTAL_LIGHTNING_PRIORITY_FEE_SOL,
      pool: config.PUMPPORTAL_LIGHTNING_POOL,
      skipPreflight: config.PUMPPORTAL_LIGHTNING_SKIP_PREFLIGHT,
      jitoOnly: config.PUMPPORTAL_LIGHTNING_JITO_ONLY
    }
  });
}
