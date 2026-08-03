// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../data/api-client";
import { DiagnosticsDrawer } from "./DiagnosticsDrawer";

vi.mock("../../data/api-client", () => ({
  apiClient: { get: vi.fn() }
}));

const getMock = vi.mocked(apiClient.get);

afterEach(() => {
  cleanup();
  getMock.mockReset();
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderDrawer(open: boolean) {
  const queryClient = client();
  const view = render(<QueryClientProvider client={queryClient}><DiagnosticsDrawer open={open} onOpenChange={vi.fn()} /></QueryClientProvider>);
  return { ...view, queryClient };
}

describe("Developer diagnostics", () => {
  it("does not request or poll resources while hidden", async () => {
    getMock.mockResolvedValue({ ok: true });
    const { rerender, queryClient } = renderDrawer(false);
    await Promise.resolve();
    expect(getMock).not.toHaveBeenCalled();
    rerender(<QueryClientProvider client={queryClient}><DiagnosticsDrawer open onOpenChange={vi.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(9));
  });

  it("isolates a failed panel while the other engineering evidence remains available", async () => {
    getMock.mockImplementation(async (path) => {
      if (String(path).includes("storage/stats")) throw new Error("storage unavailable");
      return { ok: true, reasonCodes: ["TECHNICAL_EVIDENCE"], reconciliationEquation: "accepted = observed - rejected" };
    });
    renderDrawer(true);
    expect(await screen.findByText("Storage counts unavailable")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-panel="feed-status"]')?.textContent ?? "").toContain("fields"));
    expect(document.querySelector('[data-panel="discovery-coverage"]')).toBeInTheDocument();
    expect(document.querySelector('[data-panel="trade-data-coverage"]')).toBeInTheDocument();
    expect(document.querySelector('[data-panel="raw-events"]')).toBeInTheDocument();
  });

  it("contains all required read-only engineering panels", async () => {
    getMock.mockResolvedValue({ ok: true });
    renderDrawer(true);
    for (const title of ["Discovery coverage", "Trade-data coverage", "Feed & source status", "Indexer status", "Indexer stream status", "Storage counts", "Recent raw events", "Chain verification", "Market observations"]) {
      expect(await screen.findByText(title)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /arm|start|stop|trade/i })).toBeNull();
  });
});
