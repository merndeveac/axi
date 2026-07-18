export * from "./paper-exit-policy";

export type WatchedWalletSource = "manual" | "imported" | "test";
export type WatchedWalletTradeSource =
  | "pumpportal_account_trade"
  | "chain_events"
  | "test";
export type WatchedWalletTradeSide = "buy" | "sell" | "unknown";
export type ExitRuleTrigger =
  | "watched_wallet_buy"
  | "watched_wallet_sell"
  | "watched_wallet_any_trade";

export type WatchedWallet = {
  address: string;
  alias?: string | null;
  tags: string[];
  enabled: boolean;
  source: WatchedWalletSource;
  reasonCodes: string[];
  createdAt: string;
  updatedAt: string;
};

export type WatchedWalletTradeEvent = {
  wallet: string;
  walletAlias?: string | null;
  mint: string;
  side: WatchedWalletTradeSide;
  priceSol?: number | null;
  volumeSol?: number | null;
  tokenAmount?: number | null;
  signature?: string | null;
  timestamp: string;
  source: WatchedWalletTradeSource;
  confidence: "low" | "medium" | "high";
  usableForExitStrategy: boolean;
  reasonCodes: string[];
  raw?: unknown;
};

export type PaperPositionSnapshot = {
  mint: string;
  symbol?: string | null;
  title?: string | null;
  entryPriceSol?: number | null;
  currentPriceSol?: number | null;
  sizeSol: number;
  tokenAmount?: number | null;
  openedAt: string;
  unrealizedPnlPct?: number | null;
  unrealizedPnlSol?: number | null;
  status: "open" | "closed" | "unknown";
};

export type ExitRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: ExitRuleTrigger;
  minProfitPct: number;
  minProfitSol?: number | null;
  sellPct: number;
  requirePositionOpenedBeforeWalletTrade: boolean;
  maxPositionAgeMs?: number | null;
  allowedWalletTags?: string[];
  blockedWalletTags?: string[];
  requireCurrentPrice: boolean;
  cooldownMs: number;
  priority: number;
  reasonCodes: string[];
};

export type ExitSignal = {
  id: string;
  mint: string;
  wallet: string;
  walletAlias?: string | null;
  ruleId: string;
  action: "paper_sell";
  sellPct: number;
  sellReason: string;
  blocked: boolean;
  blockers: string[];
  warnings: string[];
  positionSnapshot: PaperPositionSnapshot | null;
  triggerEvent: WatchedWalletTradeEvent;
  score?: number;
  reasonCodes: string[];
  createdAt: string;
};

export type ExitStrategyState = {
  watchedWalletCount: number;
  enabledRuleCount: number;
  observedTradeCount: number;
  exitSignalCount: number;
  latestSignalAt: string | null;
  reasonCodes: string[];
};

export type ExitStrategyEngineOptions = {
  now?: () => Date;
  defaultRules?: ExitRule[];
};

export const exitReasonCodes = {
  disabled: "EXIT_STRATEGY_DISABLED",
  walletAdded: "WATCHED_WALLET_ADDED",
  tradeObserved: "WATCHED_WALLET_TRADE_OBSERVED",
  buyTrigger: "WATCHED_WALLET_BUY_TRIGGER",
  sellTrigger: "WATCHED_WALLET_SELL_TRIGGER",
  positionFound: "PAPER_POSITION_FOUND",
  positionMissing: "PAPER_POSITION_MISSING",
  notProfitableEnough: "POSITION_NOT_PROFITABLE_ENOUGH",
  openedAfterTrade: "POSITION_OPENED_AFTER_WALLET_TRADE",
  currentPriceMissing: "CURRENT_PRICE_MISSING",
  ruleDisabled: "EXIT_RULE_DISABLED",
  ruleMatched: "EXIT_RULE_MATCHED",
  signalCreated: "EXIT_SIGNAL_CREATED",
  signalBlocked: "EXIT_SIGNAL_BLOCKED",
  paperSellPlanOnly: "PAPER_SELL_PLAN_ONLY",
  liveExecutionDisabled: "LIVE_EXECUTION_DISABLED"
} as const;

export function createDefaultExitRule(
  input: Partial<ExitRule> = {}
): ExitRule {
  return normalizeRule({
    id: input.id ?? "watched-wallet-buy-take-profit",
    name: input.name ?? "Watched wallet buy take profit",
    enabled: input.enabled ?? false,
    trigger: input.trigger ?? "watched_wallet_buy",
    minProfitPct: input.minProfitPct ?? 25,
    minProfitSol: input.minProfitSol ?? null,
    sellPct: input.sellPct ?? 100,
    requirePositionOpenedBeforeWalletTrade:
      input.requirePositionOpenedBeforeWalletTrade ?? true,
    maxPositionAgeMs: input.maxPositionAgeMs ?? null,
    allowedWalletTags: input.allowedWalletTags ?? [],
    blockedWalletTags: input.blockedWalletTags ?? [],
    requireCurrentPrice: input.requireCurrentPrice ?? true,
    cooldownMs: input.cooldownMs ?? 60_000,
    priority: input.priority ?? 100,
    reasonCodes: input.reasonCodes ?? ["DEFAULT_EXIT_RULE"]
  });
}

export function createExitStrategyEngine(
  options: ExitStrategyEngineOptions = {}
): ExitStrategyEngine {
  return new ExitStrategyEngine(options);
}

export class ExitStrategyEngine {
  private readonly now: () => Date;
  private readonly wallets = new Map<string, WatchedWallet>();
  private readonly events: WatchedWalletTradeEvent[] = [];
  private readonly rules = new Map<string, ExitRule>();
  private readonly signals: ExitSignal[] = [];
  private readonly cooldowns = new Map<string, number>();
  private sequence = 0;

  constructor(options: ExitStrategyEngineOptions = {}) {
    this.now = options.now ?? (() => new Date());

    for (const rule of options.defaultRules ?? [createDefaultExitRule()]) {
      this.rules.set(rule.id, normalizeRule(rule));
    }
  }

  addWatchedWallet(wallet: Partial<WatchedWallet> & { address: string }): WatchedWallet {
    const now = this.now().toISOString();
    const existing = this.wallets.get(wallet.address);
    const saved: WatchedWallet = {
      address: wallet.address.trim(),
      alias: wallet.alias ?? existing?.alias ?? null,
      tags: uniqueStrings(wallet.tags ?? existing?.tags ?? []),
      enabled: wallet.enabled ?? existing?.enabled ?? true,
      source: wallet.source ?? existing?.source ?? "manual",
      reasonCodes: uniqueStrings([
        exitReasonCodes.walletAdded,
        ...(wallet.reasonCodes ?? existing?.reasonCodes ?? [])
      ]),
      createdAt: wallet.createdAt ?? existing?.createdAt ?? now,
      updatedAt: wallet.updatedAt ?? now
    };

    this.wallets.set(saved.address, saved);
    return saved;
  }

  removeWatchedWallet(address: string): boolean {
    return this.wallets.delete(address.trim());
  }

  getWatchedWallets(): WatchedWallet[] {
    return Array.from(this.wallets.values()).sort((left, right) =>
      left.address.localeCompare(right.address)
    );
  }

  addExitRule(rule: ExitRule): ExitRule {
    const saved = normalizeRule(rule);
    this.rules.set(saved.id, saved);
    return saved;
  }

  updateExitRule(rule: ExitRule): ExitRule {
    return this.addExitRule(rule);
  }

  removeExitRule(id: string): boolean {
    return this.rules.delete(id);
  }

  getExitRules(): ExitRule[] {
    return Array.from(this.rules.values()).sort(
      (left, right) => left.priority - right.priority || left.id.localeCompare(right.id)
    );
  }

  ingestWatchedWalletTrade(event: WatchedWalletTradeEvent): WatchedWalletTradeEvent {
    const normalized = normalizeEvent(event);
    this.events.push(normalized);
    return normalized;
  }

  evaluateExitForPosition(
    position: PaperPositionSnapshot | null,
    event: WatchedWalletTradeEvent
  ): ExitSignal[] {
    const normalizedEvent = normalizeEvent(event);
    const wallet = this.wallets.get(normalizedEvent.wallet);
    const signals: ExitSignal[] = [];

    for (const rule of this.getExitRules()) {
      const signal = this.evaluateRule(rule, position, normalizedEvent, wallet);

      if (signal) {
        signals.push(signal);
      }
    }

    return signals;
  }

  evaluateAll(
    positionSnapshots: readonly PaperPositionSnapshot[],
    events: readonly WatchedWalletTradeEvent[] = this.events
  ): ExitSignal[] {
    const byMint = new Map(positionSnapshots.map((position) => [position.mint, position]));
    const created: ExitSignal[] = [];

    for (const event of events) {
      created.push(
        ...this.evaluateExitForPosition(byMint.get(event.mint) ?? null, event)
      );
    }

    return created;
  }

  getExitSignals(): ExitSignal[] {
    return [...this.signals].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  getRecentEvents(): WatchedWalletTradeEvent[] {
    return [...this.events].sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp)
    );
  }

  getState(): ExitStrategyState {
    return {
      watchedWalletCount: this.wallets.size,
      enabledRuleCount: this.getExitRules().filter((rule) => rule.enabled).length,
      observedTradeCount: this.events.length,
      exitSignalCount: this.signals.length,
      latestSignalAt: this.signals[0]?.createdAt ?? null,
      reasonCodes: uniqueStrings([
        ...(this.getExitRules().some((rule) => rule.enabled)
          ? []
          : [exitReasonCodes.disabled]),
        exitReasonCodes.paperSellPlanOnly,
        exitReasonCodes.liveExecutionDisabled
      ])
    };
  }

  clear(): void {
    this.events.length = 0;
    this.signals.length = 0;
    this.cooldowns.clear();
  }

  private evaluateRule(
    rule: ExitRule,
    position: PaperPositionSnapshot | null,
    event: WatchedWalletTradeEvent,
    wallet: WatchedWallet | undefined
  ): ExitSignal | null {
    const reasonCodes = new Set<string>([
      exitReasonCodes.paperSellPlanOnly,
      exitReasonCodes.liveExecutionDisabled
    ]);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!rule.enabled) {
      reasonCodes.add(exitReasonCodes.ruleDisabled);
      return null;
    }

    if (!matchesTrigger(rule.trigger, event.side)) {
      return null;
    }

    reasonCodes.add(
      event.side === "sell"
        ? exitReasonCodes.sellTrigger
        : exitReasonCodes.buyTrigger
    );

    if (!event.usableForExitStrategy) {
      blockers.push("WATCHED_WALLET_EVENT_UNUSABLE");
    }

    if (wallet && !wallet.enabled) {
      blockers.push("WATCHED_WALLET_DISABLED");
    }

    if (!matchesWalletTags(rule, wallet?.tags ?? [])) {
      blockers.push("WATCHED_WALLET_TAG_FILTER_BLOCKED");
    }

    if (!position || position.status !== "open") {
      reasonCodes.add(exitReasonCodes.positionMissing);
      blockers.push(exitReasonCodes.positionMissing);
    } else {
      reasonCodes.add(exitReasonCodes.positionFound);
      this.evaluatePosition(rule, position, event, blockers, warnings, reasonCodes);
    }

    const cooldownKey = `${rule.id}:${event.wallet}:${event.mint}`;
    const eventTime = parseTime(event.timestamp);
    const cooldownUntil = this.cooldowns.get(cooldownKey) ?? 0;

    if (eventTime < cooldownUntil) {
      blockers.push("EXIT_RULE_COOLDOWN_ACTIVE");
    }

    const blocked = blockers.length > 0;

    if (blocked) {
      reasonCodes.add(exitReasonCodes.signalBlocked);
    } else {
      reasonCodes.add(exitReasonCodes.ruleMatched);
      reasonCodes.add(exitReasonCodes.signalCreated);
      this.cooldowns.set(cooldownKey, eventTime + rule.cooldownMs);
    }

    const signal: ExitSignal = {
      id: this.createSignalId(event, rule),
      mint: event.mint,
      wallet: event.wallet,
      walletAlias: event.walletAlias ?? wallet?.alias ?? null,
      ruleId: rule.id,
      action: "paper_sell",
      sellPct: rule.sellPct,
      sellReason: blocked
        ? "Blocked watched-wallet paper exit signal"
        : "Watched wallet take-profit paper exit signal",
      blocked,
      blockers: uniqueStrings(blockers),
      warnings: uniqueStrings(warnings),
      positionSnapshot: position,
      triggerEvent: event,
      score: blocked ? 0 : computeScore(position, rule),
      reasonCodes: uniqueStrings([...reasonCodes, ...rule.reasonCodes]),
      createdAt: this.now().toISOString()
    };

    this.signals.unshift(signal);
    return signal;
  }

  private evaluatePosition(
    rule: ExitRule,
    position: PaperPositionSnapshot,
    event: WatchedWalletTradeEvent,
    blockers: string[],
    warnings: string[],
    reasonCodes: Set<string>
  ): void {
    if (rule.requireCurrentPrice && !isPositiveFinite(position.currentPriceSol ?? null)) {
      blockers.push(exitReasonCodes.currentPriceMissing);
      reasonCodes.add(exitReasonCodes.currentPriceMissing);
    }

    const pnlPct = getPnlPct(position);

    if (pnlPct === null || pnlPct < rule.minProfitPct) {
      blockers.push(exitReasonCodes.notProfitableEnough);
      reasonCodes.add(exitReasonCodes.notProfitableEnough);
    }

    if (
      rule.minProfitSol !== null &&
      rule.minProfitSol !== undefined &&
      (position.unrealizedPnlSol === null ||
        position.unrealizedPnlSol === undefined ||
        position.unrealizedPnlSol < rule.minProfitSol)
    ) {
      blockers.push("POSITION_PROFIT_SOL_BELOW_THRESHOLD");
    }

    if (
      rule.requirePositionOpenedBeforeWalletTrade &&
      parseTime(position.openedAt) > parseTime(event.timestamp)
    ) {
      blockers.push(exitReasonCodes.openedAfterTrade);
      reasonCodes.add(exitReasonCodes.openedAfterTrade);
    }

    if (
      rule.maxPositionAgeMs !== null &&
      rule.maxPositionAgeMs !== undefined &&
      parseTime(event.timestamp) - parseTime(position.openedAt) > rule.maxPositionAgeMs
    ) {
      warnings.push("POSITION_OLDER_THAN_RULE_MAX_AGE");
    }
  }

  private createSignalId(event: WatchedWalletTradeEvent, rule: ExitRule): string {
    this.sequence += 1;
    const signaturePart = event.signature?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
    return [
      "exit",
      rule.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "rule",
      event.mint.slice(0, 8),
      event.wallet.slice(0, 8),
      signaturePart || String(this.sequence).padStart(6, "0")
    ].join("_");
  }
}

export function createExitSimulationFixture(
  fixture:
    | "watched-wallet-buy-profit"
    | "watched-wallet-buy-no-position"
    | "watched-wallet-buy-below-profit"
    | "watched-wallet-sell"
): {
  event: WatchedWalletTradeEvent;
  position: PaperPositionSnapshot | null;
  rule: ExitRule;
  signal: ExitSignal | null;
} {
  const engine = createExitStrategyEngine({
    now: () => new Date("2026-01-01T00:02:00.000Z"),
    defaultRules: [
      createDefaultExitRule({
        enabled: true,
        sellPct: fixture === "watched-wallet-sell" ? 50 : 100
      })
    ]
  });
  const wallet = engine.addWatchedWallet({
    address: "WatchWallet111111111111111111111111111111",
    alias: "watched",
    tags: ["smart_money", "exit_liquidity"],
    source: "test"
  });
  const event = normalizeEvent({
    wallet: wallet.address,
    walletAlias: wallet.alias ?? null,
    mint: "ExitMint111111111111111111111111111111111",
    side: fixture === "watched-wallet-sell" ? "sell" : "buy",
    priceSol: 0.00075,
    volumeSol: 3,
    tokenAmount: 4000,
    signature: `fixture-${fixture}`,
    timestamp: "2026-01-01T00:01:00.000Z",
    source: "test",
    confidence: "high",
    usableForExitStrategy: true,
    reasonCodes: [exitReasonCodes.tradeObserved],
    raw: { fixture }
  });
  const position =
    fixture === "watched-wallet-buy-no-position"
      ? null
      : {
          mint: event.mint,
          symbol: "EXIT",
          title: "Exit Token",
          entryPriceSol: 0.0005,
          currentPriceSol:
            fixture === "watched-wallet-buy-below-profit" ? 0.00055 : 0.00075,
          sizeSol: 1,
          tokenAmount: 2000,
          openedAt: "2026-01-01T00:00:00.000Z",
          unrealizedPnlPct:
            fixture === "watched-wallet-buy-below-profit" ? 10 : 50,
          unrealizedPnlSol:
            fixture === "watched-wallet-buy-below-profit" ? 0.1 : 0.5,
          status: "open" as const
        };
  const [signal] = engine.evaluateExitForPosition(position, event);

  return {
    event,
    position,
    rule: engine.getExitRules()[0] ?? createDefaultExitRule(),
    signal: signal ?? null
  };
}

function normalizeRule(rule: ExitRule): ExitRule {
  return {
    ...rule,
    minProfitPct: finiteOrZero(rule.minProfitPct),
    minProfitSol:
      rule.minProfitSol === null || rule.minProfitSol === undefined
        ? null
        : finiteOrZero(rule.minProfitSol),
    sellPct: clamp(finiteOrZero(rule.sellPct), 1, 100),
    maxPositionAgeMs:
      rule.maxPositionAgeMs === null || rule.maxPositionAgeMs === undefined
        ? null
        : finiteOrZero(rule.maxPositionAgeMs),
    cooldownMs: Math.max(0, finiteOrZero(rule.cooldownMs)),
    priority: finiteOrZero(rule.priority),
    allowedWalletTags: uniqueStrings(rule.allowedWalletTags ?? []),
    blockedWalletTags: uniqueStrings(rule.blockedWalletTags ?? []),
    reasonCodes: uniqueStrings(rule.reasonCodes)
  };
}

function normalizeEvent(event: WatchedWalletTradeEvent): WatchedWalletTradeEvent {
  return {
    ...event,
    wallet: event.wallet.trim(),
    walletAlias: event.walletAlias ?? null,
    mint: event.mint.trim(),
    priceSol: finiteOrNull(event.priceSol ?? null),
    volumeSol: finiteOrNull(event.volumeSol ?? null),
    tokenAmount: finiteOrNull(event.tokenAmount ?? null),
    signature: event.signature ?? null,
    reasonCodes: uniqueStrings([
      exitReasonCodes.tradeObserved,
      ...event.reasonCodes
    ])
  };
}

function matchesTrigger(trigger: ExitRuleTrigger, side: WatchedWalletTradeSide): boolean {
  return (
    trigger === "watched_wallet_any_trade" ||
    (trigger === "watched_wallet_buy" && side === "buy") ||
    (trigger === "watched_wallet_sell" && side === "sell")
  );
}

function matchesWalletTags(rule: ExitRule, walletTags: readonly string[]): boolean {
  const tagSet = new Set(walletTags);
  const allowed = rule.allowedWalletTags ?? [];
  const blocked = rule.blockedWalletTags ?? [];

  if (allowed.length > 0 && !allowed.some((tag) => tagSet.has(tag))) {
    return false;
  }

  return !blocked.some((tag) => tagSet.has(tag));
}

function getPnlPct(position: PaperPositionSnapshot): number | null {
  if (Number.isFinite(position.unrealizedPnlPct ?? null)) {
    return position.unrealizedPnlPct ?? null;
  }

  if (
    isPositiveFinite(position.entryPriceSol ?? null) &&
    isPositiveFinite(position.currentPriceSol ?? null)
  ) {
    return (
      (((position.currentPriceSol ?? 0) - (position.entryPriceSol ?? 0)) /
        (position.entryPriceSol ?? 1)) *
      100
    );
  }

  return null;
}

function computeScore(position: PaperPositionSnapshot | null, rule: ExitRule): number {
  if (!position) {
    return 0;
  }

  return round(clamp((getPnlPct(position) ?? 0) + rule.sellPct * 0.25, 0, 100));
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPositiveFinite(value: number | null): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(10)) : 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
