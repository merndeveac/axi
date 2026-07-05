import {
  createDefaultSubscriptionConfig,
  type ManagedStreamCommitment,
  type ManagedStreamProviderKind,
  type ManagedStreamSubscriptionConfig
} from "@axi/stream-core";
import type { ManagedStreamSubscriptionSummary } from "./index";

export const managedStreamProfileReasonCodes = {
  profileBuilt: "STREAM_PROFILE_BUILT",
  profilePlaceholder: "STREAM_PROFILE_PLACEHOLDER",
  profileRequiresProgramIds: "STREAM_PROFILE_REQUIRES_PROGRAM_IDS"
} as const;

export type ManagedStreamProfileReasonCode =
  (typeof managedStreamProfileReasonCodes)[keyof typeof managedStreamProfileReasonCodes];

export type ManagedStreamSubscriptionProfileName =
  | "pumpfun_program_transactions"
  | "pumpfun_and_pumpswap_transactions"
  | "laserstream_pumpfun_transactions"
  | "yellowstone_pumpfun_transactions"
  | "watched_addresses"
  | "minimal_healthcheck";

export type ManagedStreamProfileBuildOptions = {
  provider: ManagedStreamProviderKind;
  commitment?: ManagedStreamCommitment | undefined;
  programIds?: string[] | undefined;
  watchedAddresses?: string[] | undefined;
  baseConfig?: ManagedStreamSubscriptionConfig | undefined;
};

export type ManagedStreamProfileBuildResult = {
  profile: ManagedStreamSubscriptionProfileName;
  subscriptionConfig: ManagedStreamSubscriptionConfig;
  subscriptionSummary: ManagedStreamSubscriptionSummary;
  reasonCodes: ManagedStreamProfileReasonCode[];
};

export function buildManagedStreamSubscriptionProfile(
  profile: ManagedStreamSubscriptionProfileName,
  options: ManagedStreamProfileBuildOptions
): ManagedStreamProfileBuildResult {
  const config = options.baseConfig
    ? cloneSubscriptionConfig(options.baseConfig)
    : createDefaultSubscriptionConfig({
        provider: options.provider,
        authConfigured: false,
        commitment: options.commitment ?? "confirmed"
      });
  const reasonCodes: ManagedStreamProfileReasonCode[] = [
    managedStreamProfileReasonCodes.profileBuilt
  ];
  const programIds = uniqueStrings(options.programIds ?? []);
  const watchedAddresses = uniqueStrings(options.watchedAddresses ?? []);

  config.provider = options.provider;
  config.commitment = options.commitment ?? config.commitment;

  if (profile === "minimal_healthcheck") {
    config.transactions.enabled = false;
    config.transactions.accountInclude = [];
    config.transactions.accountExclude = [];
    config.transactions.accountRequired = [];
    config.accounts.enabled = false;
    config.accounts.owners = [];
    config.accounts.accounts = [];
    config.slots.enabled = true;
    config.blocks.enabled = false;
  }

  if (profile === "watched_addresses") {
    config.transactions.enabled = true;
    config.transactions.accountRequired = watchedAddresses;
    config.transactions.accountInclude = programIds;

    if (watchedAddresses.length === 0) {
      reasonCodes.push(managedStreamProfileReasonCodes.profilePlaceholder);
      reasonCodes.push(managedStreamProfileReasonCodes.profileRequiresProgramIds);
    }
  }

  if (
    profile === "pumpfun_program_transactions" ||
    profile === "pumpfun_and_pumpswap_transactions" ||
    profile === "laserstream_pumpfun_transactions" ||
    profile === "yellowstone_pumpfun_transactions"
  ) {
    config.transactions.enabled = true;
    config.transactions.accountInclude = programIds;
    config.transactions.accountRequired = watchedAddresses;

    if (programIds.length === 0) {
      reasonCodes.push(managedStreamProfileReasonCodes.profilePlaceholder);
      reasonCodes.push(managedStreamProfileReasonCodes.profileRequiresProgramIds);
    }
  }

  return {
    profile,
    subscriptionConfig: config,
    subscriptionSummary: createManagedStreamSubscriptionSummary(config, profile),
    reasonCodes: uniqueReasonCodes(reasonCodes)
  };
}

function uniqueReasonCodes(
  codes: ManagedStreamProfileReasonCode[]
): ManagedStreamProfileReasonCode[] {
  return Array.from(new Set(codes));
}

function cloneSubscriptionConfig(
  config: ManagedStreamSubscriptionConfig
): ManagedStreamSubscriptionConfig {
  return {
    provider: config.provider,
    authConfigured: config.authConfigured,
    commitment: config.commitment,
    transactions: {
      enabled: config.transactions.enabled,
      accountInclude: [...config.transactions.accountInclude],
      accountExclude: [...config.transactions.accountExclude],
      accountRequired: [...config.transactions.accountRequired],
      vote: config.transactions.vote,
      failed: config.transactions.failed
    },
    accounts: {
      enabled: config.accounts.enabled,
      owners: [...config.accounts.owners],
      accounts: [...config.accounts.accounts]
    },
    slots: { enabled: config.slots.enabled },
    blocks: { enabled: config.blocks.enabled },
    maxReconnectAttempts: config.maxReconnectAttempts,
    reconnectBackoffMs: config.reconnectBackoffMs,
    ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {})
  };
}

function createManagedStreamSubscriptionSummary(
  config: ManagedStreamSubscriptionConfig,
  profile: string | null = null
): ManagedStreamSubscriptionSummary {
  return {
    provider: config.provider,
    profile,
    commitment: config.commitment,
    transactionsEnabled: config.transactions.enabled,
    transactionAccountIncludeCount: config.transactions.accountInclude.length,
    transactionAccountExcludeCount: config.transactions.accountExclude.length,
    transactionAccountRequiredCount: config.transactions.accountRequired.length,
    accountsEnabled: config.accounts.enabled,
    accountOwnerCount: config.accounts.owners.length,
    accountCount: config.accounts.accounts.length,
    slotsEnabled: config.slots.enabled,
    blocksEnabled: config.blocks.enabled,
    maxReconnectAttempts: config.maxReconnectAttempts,
    reconnectBackoffMs: config.reconnectBackoffMs
  };
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string"))
  );
}
