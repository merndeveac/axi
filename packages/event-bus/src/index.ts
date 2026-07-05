import type { IndexerEventType, NormalizedIndexerEvent } from "@axi/indexer-core";

export type EventHandler = (event: NormalizedIndexerEvent) => void | Promise<void>;

export type EventPublisher = {
  publish: (event: NormalizedIndexerEvent) => void;
};

export type EventSubscriber = {
  subscribe: (
    handler: EventHandler,
    options?: EventBusSubscribeOptions
  ) => () => void;
};

export type EventBusSubscribeOptions = {
  replayRecent?: boolean;
  replayLimit?: number;
};

export type EventBusStats = {
  publishedCount: number;
  subscriberCount: number;
  eventsByType: Partial<Record<IndexerEventType, number>>;
  lastEventAt: string | null;
  errorCount: number;
};

export type EventBus = EventPublisher &
  EventSubscriber & {
    clear: () => void;
    getRecentEvents: (limit?: number) => NormalizedIndexerEvent[];
    getStats: () => EventBusStats;
  };

export type InMemoryEventBusOptions = {
  recentEventLimit?: number;
};

export function createInMemoryEventBus(
  options: InMemoryEventBusOptions = {}
): EventBus {
  const recentEventLimit = Math.max(1, options.recentEventLimit ?? 1000);
  const subscribers = new Set<EventHandler>();
  const recentEvents: NormalizedIndexerEvent[] = [];
  const eventsByType = new Map<IndexerEventType, number>();
  let publishedCount = 0;
  let lastEventAt: string | null = null;
  let errorCount = 0;

  function publish(event: NormalizedIndexerEvent): void {
    publishedCount += 1;
    eventsByType.set(event.type, (eventsByType.get(event.type) ?? 0) + 1);
    lastEventAt = new Date().toISOString();
    recentEvents.unshift(event);

    while (recentEvents.length > recentEventLimit) {
      recentEvents.pop();
    }

    for (const subscriber of subscribers) {
      notifySubscriber(subscriber, event);
    }
  }

  function subscribe(
    handler: EventHandler,
    subscribeOptions: EventBusSubscribeOptions = {}
  ): () => void {
    subscribers.add(handler);

    if (subscribeOptions.replayRecent) {
      const replayLimit = Math.max(0, subscribeOptions.replayLimit ?? recentEvents.length);

      for (const event of recentEvents.slice(0, replayLimit).reverse()) {
        notifySubscriber(handler, event);
      }
    }

    return () => {
      subscribers.delete(handler);
    };
  }

  function notifySubscriber(
    handler: EventHandler,
    event: NormalizedIndexerEvent
  ): void {
    try {
      const result = handler(event);

      if (result instanceof Promise) {
        void result.catch(() => {
          errorCount += 1;
        });
      }
    } catch {
      errorCount += 1;
    }
  }

  return {
    clear: () => {
      recentEvents.splice(0, recentEvents.length);
      eventsByType.clear();
      publishedCount = 0;
      lastEventAt = null;
      errorCount = 0;
    },
    getRecentEvents: (limit = recentEventLimit) => recentEvents.slice(0, limit),
    getStats: () => ({
      publishedCount,
      subscriberCount: subscribers.size,
      eventsByType: Object.fromEntries(eventsByType) as Partial<
        Record<IndexerEventType, number>
      >,
      lastEventAt,
      errorCount
    }),
    publish,
    subscribe
  };
}
