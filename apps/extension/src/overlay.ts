import type { OverlaySignal } from "@axi/shared";

type OverlayStatus = "connecting" | "open" | "closed";

export function createOverlayEngine() {
  const signals = new Map<string, OverlaySignal>();
  let status: OverlayStatus = "connecting";
  let host: HTMLDivElement | undefined;
  let statusNode: HTMLSpanElement | undefined;
  let countNode: HTMLSpanElement | undefined;
  let listNode: HTMLDivElement | undefined;

  function mount(): void {
    if (host) {
      return;
    }

    host = document.createElement("div");
    host.id = "axi-local-overlay-root";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
      }

      .panel {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: 260px;
        max-width: calc(100vw - 32px);
        border: 1px solid #cfd8dc;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
        color: #182026;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid #e5e7eb;
      }

      .title {
        font-size: 12px;
        font-weight: 800;
      }

      .status {
        border-radius: 999px;
        background: #eef2f7;
        padding: 3px 8px;
        color: #475467;
        font-size: 11px;
        font-weight: 700;
      }

      .body {
        padding: 10px 12px;
      }

      .count {
        display: block;
        margin-bottom: 8px;
        color: #475467;
        font-size: 12px;
      }

      .signal {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 4px 8px;
        padding: 7px 0;
        border-top: 1px solid #edf0f3;
        font-size: 12px;
      }

      .signal:first-child {
        border-top: 0;
      }

      .mint {
        overflow: hidden;
        color: #667085;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .score {
        font-weight: 800;
      }
    `;

    const panel = document.createElement("section");
    panel.className = "panel";

    const header = document.createElement("div");
    header.className = "header";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = "AXI local";

    statusNode = document.createElement("span");
    statusNode.className = "status";

    header.append(title, statusNode);

    const body = document.createElement("div");
    body.className = "body";

    countNode = document.createElement("span");
    countNode.className = "count";

    listNode = document.createElement("div");

    body.append(countNode, listNode);
    panel.append(header, body);
    shadow.append(style, panel);
    document.documentElement.append(host);
    render();
  }

  function setStatus(nextStatus: OverlayStatus): void {
    status = nextStatus;
    render();
  }

  function upsertSignal(signal: OverlaySignal): void {
    signals.set(signal.mint, signal);
    render();
  }

  function getSignals(): OverlaySignal[] {
    return Array.from(signals.values());
  }

  function render(): void {
    if (!statusNode || !countNode || !listNode) {
      return;
    }

    const sortedSignals = Array.from(signals.values())
      .sort((left, right) => right.score - left.score)
      .slice(0, 4);

    statusNode.textContent = status;
    countNode.textContent = `${signals.size} signal${signals.size === 1 ? "" : "s"}`;
    listNode.replaceChildren(
      ...sortedSignals.map((signal) => renderSignal(signal))
    );
  }

  function renderSignal(signal: OverlaySignal): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "signal";

    const symbol = document.createElement("strong");
    symbol.textContent = signal.symbol;

    const score = document.createElement("span");
    score.className = "score";
    score.textContent = String(signal.score);

    const mint = document.createElement("span");
    mint.className = "mint";
    mint.textContent = signal.mint;

    const action = document.createElement("span");
    action.textContent = signal.action;

    row.append(symbol, score, mint, action);
    return row;
  }

  return {
    getSignals,
    mount,
    setStatus,
    upsertSignal
  };
}

// TODO: Detect Axiom token cards by mint address only after the DOM contract is
// known and user-approved. Keep this generic overlay passive until then.
