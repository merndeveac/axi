// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { ApiRequestError, ApiTimeoutError } from "./errors";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("V2 API client", () => {
  it("deduplicates simultaneous identical GET requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient({ baseUrl: "http://axi.test", fetchImpl });
    const [first, second] = await Promise.all([
      client.get<{ ok: boolean }>("/health"),
      client.get<{ ok: boolean }>("/health")
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("times out bounded requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );
    const client = createApiClient({ baseUrl: "http://axi.test", fetchImpl });
    await expect(
      client.get("/slow", { timeoutMs: 5, dedupe: false })
    ).rejects.toBeInstanceOf(ApiTimeoutError);
  });

  it("honors AbortController cancellation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );
    const client = createApiClient({ baseUrl: "http://axi.test", fetchImpl });
    const controller = new AbortController();
    const pending = client.get("/cancel", {
      signal: controller.signal,
      dedupe: false
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps independent resources independent when one fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) =>
      String(input).endsWith("/diagnostics")
        ? jsonResponse({ error: "down" }, 503)
        : jsonResponse({ rows: [1, 2] })
    );
    const client = createApiClient({ baseUrl: "http://axi.test", fetchImpl });
    const [scanner, diagnostics] = await Promise.allSettled([
      client.get<{ rows: number[] }>("/scanner"),
      client.get("/diagnostics")
    ]);
    expect(scanner).toMatchObject({ status: "fulfilled" });
    expect(diagnostics).toMatchObject({
      status: "rejected",
      reason: expect.any(ApiRequestError)
    });
  });
});
