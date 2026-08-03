import type { ScannerStreamMessageV2 } from "@axi/shared";

type ScannerSocketOptions = {
  url: string;
  onMessage: (message: ScannerStreamMessageV2) => void;
  onStateChange?: (state: "connecting" | "open" | "stale" | "closed") => void;
  onReconcileRequired?: () => void;
  staleAfterMs?: number;
  maximumBackoffMs?: number;
  random?: () => number;
};

export function parseScannerStreamMessage(
  input: string
): ScannerStreamMessageV2 | null {
  try {
    const value = JSON.parse(input) as Partial<ScannerStreamMessageV2>;
    if (
      value.schemaVersion !== "scanner-stream-v2" ||
      typeof value.type !== "string" ||
      typeof value.sequence !== "number" ||
      !Number.isInteger(value.sequence) ||
      value.sequence < 1 ||
      typeof value.generatedAt !== "string"
    ) {
      return null;
    }
    return value as ScannerStreamMessageV2;
  } catch {
    return null;
  }
}

export function reconnectDelay(
  attempt: number,
  maximumMs = 15_000,
  random = Math.random
): number {
  const bounded = Math.min(500 * 2 ** Math.max(0, attempt), maximumMs);
  return Math.round(bounded * (0.8 + random() * 0.4));
}

export class ScannerWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private staleTimer: number | null = null;
  private attempt = 0;
  private lastSequence = 0;
  private stopped = true;

  constructor(private readonly options: ScannerSocketOptions) {}

  connect(): void {
    this.stopped = false;
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.staleTimer !== null) window.clearTimeout(this.staleTimer);
    this.socket?.close(1000, "V2 client closed");
    this.socket = null;
    this.options.onStateChange?.("closed");
  }

  private open(): void {
    if (this.stopped) return;
    this.options.onStateChange?.("connecting");
    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.attempt = 0;
      this.options.onStateChange?.("open");
      this.armStaleTimer();
      if (this.lastSequence > 0) this.options.onReconcileRequired?.();
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const message = parseScannerStreamMessage(event.data);
      if (!message) return;
      if (this.lastSequence > 0 && message.sequence > this.lastSequence + 1) {
        this.options.onReconcileRequired?.();
      }
      if (message.sequence <= this.lastSequence) return;
      this.lastSequence = message.sequence;
      this.armStaleTimer();
      this.options.onMessage(message);
    });
    socket.addEventListener("close", () => {
      this.socket = null;
      if (this.stopped) return;
      this.options.onStateChange?.("closed");
      const delay = reconnectDelay(
        this.attempt++,
        this.options.maximumBackoffMs,
        this.options.random
      );
      this.reconnectTimer = window.setTimeout(() => this.open(), delay);
    });
  }

  private armStaleTimer(): void {
    if (this.staleTimer !== null) window.clearTimeout(this.staleTimer);
    this.staleTimer = window.setTimeout(() => {
      this.options.onStateChange?.("stale");
      this.options.onReconcileRequired?.();
    }, this.options.staleAfterMs ?? 5_000);
  }
}
