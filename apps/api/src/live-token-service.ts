import type { FeedEvent, TokenCreatedEvent } from "@axi/data-feeds";
import type {
  CandidateDecision,
  RiskLevel,
  RiskSnapshot,
  ScoreBreakdown,
  TokenIdentitySummary
} from "@axi/shared";
import type { CandidateState } from "@axi/candidates";

export type LiveFeedMode = "live" | "mock" | "none" | "replay";

export type LiveToken = {
  mint: string;
  name?: string;
  symbol?: string;
  title?: string;
  displayName: string;
  source: "pumpportal";
  sourceMode: "real";
  realData: true;
  eventTypes: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  latestEventAt: string;
  latestSignature?: string;
  rawSource?: string;
  identityConfidence?: TokenIdentitySummary["confidence"];
  candidateState?: CandidateState["lifecycleState"];
  action?: CandidateDecision["action"];
  riskLevel?: RiskLevel;
  score?: number;
  reasonCodes: string[];
};

export type LiveFeedEvent = {
  sessionId: string;
  provider: "pumpportal";
  eventType: string;
  mint: string;
  name?: string;
  symbol?: string;
  title?: string;
  realData: true;
  reasonCodes: string[];
  payload: FeedEvent;
  createdAt: string;
};

export type LiveTokenContext = {
  candidate?: CandidateState;
  decision?: CandidateDecision;
  identity?: TokenIdentitySummary;
  riskSnapshot?: RiskSnapshot;
  score?: ScoreBreakdown;
};

export type LiveTokenServiceStatus = {
  mode: LiveFeedMode;
  provider: string;
  sessionId: string;
  live: boolean;
  realData: boolean;
  liveTokenCount: number;
  liveFeedEventCount: number;
  lastEventAt: string | null;
  historicalMockRowsHidden: true;
  reasonCodes: string[];
  paperOnly: true;
};

export type LiveTokenService = {
  clear: () => void;
  getLiveFeedEvents: (limit?: number) => LiveFeedEvent[];
  getLiveToken: (mint: string) => LiveToken | undefined;
  getLiveTokens: () => LiveToken[];
  getStatus: () => LiveTokenServiceStatus;
  ingestLiveFeedEvent: (
    event: FeedEvent,
    context?: LiveTokenContext
  ) => LiveToken | undefined;
};

export function createLiveTokenService(options: {
  mode: LiveFeedMode;
  provider?: string;
  sessionId?: string;
  maxEvents?: number;
}): LiveTokenService {
  const sessionId = options.sessionId ?? createSessionId();
  const provider = options.provider ?? "pumpportal";
  const maxEvents = options.maxEvents ?? 250;
  const tokens = new Map<string, LiveToken>();
  const events: LiveFeedEvent[] = [];
  let lastEventAt: string | null = null;

  function ingestLiveFeedEvent(
    event: FeedEvent,
    context: LiveTokenContext = {}
  ): LiveToken | undefined {
    if (!isLivePumpPortalTokenEvent(event)) {
      return undefined;
    }

    const eventType = getLiveEventType(event);
    const identity = context.identity;
    const existing = tokens.get(event.candidate.mint);
    const firstSeenAt = existing?.firstSeenAt ?? event.candidate.firstSeenAt;
    const reasonCodes = unique([
      "LIVE_FEED_EVENT",
      eventType === "migration"
        ? "REAL_FEED_MIGRATION_EVENT"
        : "REAL_FEED_NEW_TOKEN_EVENT",
      "HISTORICAL_MOCK_ROWS_HIDDEN",
      ...(event.reasonCodes ?? []),
      ...(context.decision?.combinedReasonCodes ?? [])
    ]);
    const token: LiveToken = {
      mint: event.candidate.mint,
      ...(identity?.name
        ? { name: identity.name }
        : event.candidate.name
          ? { name: event.candidate.name }
          : {}),
      ...(identity?.symbol
        ? { symbol: identity.symbol }
        : event.candidate.symbol
          ? { symbol: event.candidate.symbol }
          : {}),
      ...(identity?.title
        ? { title: identity.title }
        : event.candidate.title
          ? { title: event.candidate.title }
          : {}),
      displayName:
        identity?.displayName ??
        event.candidate.displayName ??
        event.candidate.title ??
        event.candidate.name ??
        event.candidate.symbol ??
        shortMint(event.candidate.mint),
      source: "pumpportal",
      sourceMode: "real",
      realData: true,
      eventTypes: unique([...(existing?.eventTypes ?? []), eventType]),
      firstSeenAt,
      lastSeenAt: event.timestamp,
      latestEventAt: event.timestamp,
      ...(event.signature ? { latestSignature: event.signature } : {}),
      ...(event.rawSourceEventType
        ? { rawSource: event.rawSourceEventType }
        : {}),
      ...(identity ? { identityConfidence: identity.confidence } : {}),
      ...(context.decision
        ? { candidateState: context.decision.lifecycleState }
        : context.candidate
          ? { candidateState: context.candidate.lifecycleState }
          : {}),
      ...(context.decision ? { action: context.decision.action } : {}),
      ...(context.riskSnapshot
        ? { riskLevel: context.riskSnapshot.riskLevel }
        : {}),
      ...(context.score ? { score: context.score.total } : {}),
      reasonCodes
    };

    tokens.set(event.candidate.mint, token);
    lastEventAt = event.timestamp;

    events.unshift({
      sessionId,
      provider: "pumpportal",
      eventType,
      mint: event.candidate.mint,
      ...(token.name ? { name: token.name } : {}),
      ...(token.symbol ? { symbol: token.symbol } : {}),
      ...(token.title ? { title: token.title } : {}),
      realData: true,
      reasonCodes,
      payload: event,
      createdAt: event.timestamp
    });

    while (events.length > maxEvents) {
      events.pop();
    }

    return token;
  }

  return {
    clear: () => {
      tokens.clear();
      events.splice(0, events.length);
      lastEventAt = null;
    },
    getLiveFeedEvents: (limit = maxEvents) => events.slice(0, limit),
    getLiveToken: (mint) => tokens.get(mint),
    getLiveTokens: () =>
      Array.from(tokens.values()).sort(
        (left, right) =>
          Date.parse(right.latestEventAt) - Date.parse(left.latestEventAt)
      ),
    getStatus: () => {
      const reasonCodes = ["HISTORICAL_MOCK_ROWS_HIDDEN"];

      if (options.mode === "live") {
        reasonCodes.push("LIVE_FEED_EXPECTED");
      }

      if (tokens.size === 0) {
        reasonCodes.push("LIVE_FEED_NO_EVENTS_YET");
      }

      return {
        mode: options.mode,
        provider,
        sessionId,
        live: options.mode === "live",
        realData: true,
        liveTokenCount: tokens.size,
        liveFeedEventCount: events.length,
        lastEventAt,
        historicalMockRowsHidden: true,
        reasonCodes: unique(reasonCodes),
        paperOnly: true
      };
    },
    ingestLiveFeedEvent
  };
}

function isLivePumpPortalTokenEvent(
  event: FeedEvent
): event is TokenCreatedEvent {
  return (
    event.type === "token_created" &&
    event.source === "pumpportal" &&
    event.realData !== false
  );
}

function getLiveEventType(event: TokenCreatedEvent): "migration" | "new_token" {
  return event.rawSourceEventType?.toLowerCase().includes("migr")
    ? "migration"
    : "new_token";
}

function createSessionId(): string {
  return `live-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 8)}...${mint.slice(-6)}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
