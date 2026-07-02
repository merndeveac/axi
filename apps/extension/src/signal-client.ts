import type { OverlaySignal } from "@axi/shared";

type ConnectionStatus = "connecting" | "open" | "closed";

type ServerMessage =
  | {
      type: "snapshot";
      signals: OverlaySignal[];
    }
  | {
      type: "signal";
      signal: OverlaySignal;
    };

export type SignalClientOptions = {
  debug?: boolean;
  onSignal: (signal: OverlaySignal) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  url: string;
};

export function createSignalClient(options: SignalClientOptions) {
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;
  let manuallyClosed = false;

  function connect(): void {
    manuallyClosed = false;
    options.onStatusChange("connecting");
    socket = new WebSocket(options.url);

    socket.addEventListener("open", () => {
      options.onStatusChange("open");
      debug("connected");
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;

      if (message.type === "snapshot") {
        for (const signal of message.signals) {
          options.onSignal(signal);
        }
      }

      if (message.type === "signal") {
        options.onSignal(message.signal);
      }
    });

    socket.addEventListener("close", () => {
      options.onStatusChange("closed");
      debug("closed");

      if (!manuallyClosed) {
        reconnectTimer = window.setTimeout(connect, 2000);
      }
    });
  }

  function disconnect(): void {
    manuallyClosed = true;

    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
    }

    socket?.close();
  }

  function reconnect(): void {
    disconnect();
    connect();
  }

  function debug(message: string): void {
    if (options.debug) {
      console.debug(`[AXI overlay] ${message}`);
    }
  }

  return {
    connect,
    disconnect,
    reconnect
  };
}
