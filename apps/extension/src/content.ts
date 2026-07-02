import type { OverlaySignal } from "@axi/shared";
import { createOverlayEngine } from "./overlay";
import { createSignalClient } from "./signal-client";

declare global {
  interface Window {
    __AXI_OVERLAY_DEBUG__?: {
      disconnect: () => void;
      getSignals: () => OverlaySignal[];
      reconnect: () => void;
    };
  }
}

const overlay = createOverlayEngine();
const client = createSignalClient({
  url: "ws://localhost:8787/ws/signals",
  debug: true,
  onSignal: (signal) => overlay.upsertSignal(signal),
  onStatusChange: (status) => overlay.setStatus(status)
});

overlay.mount();
client.connect();

window.__AXI_OVERLAY_DEBUG__ = {
  disconnect: client.disconnect,
  getSignals: overlay.getSignals,
  reconnect: client.reconnect
};
