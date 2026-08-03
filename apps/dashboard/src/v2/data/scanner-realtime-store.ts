import type { ScannerSnapshotV2, ScannerStreamMessageV2 } from "@axi/shared";
import { configuredApiBaseUrl } from "./api-client";
import {
  applyScannerMessage,
  applyScannerSnapshot,
  emptyVersionedScannerState,
  orderedScannerRows,
  type VersionedScannerState
} from "./versioning";
import { ScannerWebSocketClient } from "./websocket-client";

type Listener = () => void;

export class ScannerRealtimeStore {
  private state: VersionedScannerState = emptyVersionedScannerState();
  private revision = 0;
  private readonly listeners = new Set<Listener>();
  private client: ScannerWebSocketClient | null = null;
  private subscribers = 0;
  private reconcile: (() => void) | null = null;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;

  getState(): VersionedScannerState {
    return this.state;
  }

  getRows() {
    return orderedScannerRows(this.state);
  }

  applySnapshot(snapshot: ScannerSnapshotV2): void {
    const next = applyScannerSnapshot(this.state, snapshot);
    if (next !== this.state) {
      this.state = next;
      this.emit();
    }
  }

  applyMessage(message: ScannerStreamMessageV2): void {
    const next = applyScannerMessage(this.state, message);
    if (next !== this.state) {
      this.state = next;
      this.emit();
    }
    if (next.needsReconciliation) this.reconcile?.();
  }

  connect(reconcile: () => void): () => void {
    this.subscribers += 1;
    this.reconcile = reconcile;
    if (!this.client && typeof WebSocket !== "undefined") {
      const url = new URL(configuredApiBaseUrl);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/ws/v2/scanner";
      url.search = "";
      this.client = new ScannerWebSocketClient({
        url: url.toString(),
        onMessage: (message) => this.applyMessage(message),
        onReconcileRequired: () => this.reconcile?.()
      });
      this.client.connect();
    }
    return () => {
      this.subscribers = Math.max(0, this.subscribers - 1);
      if (this.subscribers === 0) {
        this.client?.disconnect();
        this.client = null;
        this.reconcile = null;
      }
    };
  }

  private emit(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}

export const scannerRealtimeStore = new ScannerRealtimeStore();
