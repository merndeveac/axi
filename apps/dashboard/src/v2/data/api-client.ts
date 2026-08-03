import { ApiRequestError, ApiTimeoutError, isAbortError } from "./errors";

export type ApiRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  dedupe?: boolean;
  headers?: HeadersInit;
};

type ApiClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
};

export type ApiClient = {
  get<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;
};

const configuredBaseUrl =
  import.meta.env.VITE_AXI_API_URL ?? "http://localhost:8787";

function abortPromise(signal: AbortSignal, path: string): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException(`Request for ${path} aborted`, "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new DOMException(`Request for ${path} aborted`, "AbortError")),
      { once: true }
    );
  });
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? configuredBaseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 8_000;
  const inflight = new Map<string, Promise<unknown>>();

  async function perform<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    requestOptions: ApiRequestOptions
  ): Promise<T> {
    const timeoutMs = requestOptions.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onConsumerAbort = () => controller.abort();
    requestOptions.signal?.addEventListener("abort", onConsumerAbort, {
      once: true
    });

    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
          ...requestOptions.headers
        },
        ...(method === "POST" && body !== undefined
          ? { body: JSON.stringify(body) }
          : {})
      });

      if (!response.ok) {
        throw new ApiRequestError(`${method} ${path} failed with ${response.status}`, {
          path,
          status: response.status,
          retryable: response.status === 408 || response.status === 429 || response.status >= 500
        });
      }
      return (await response.json()) as T;
    } catch (error) {
      if (timedOut) throw new ApiTimeoutError(path, timeoutMs);
      if (isAbortError(error)) throw error;
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError(
        error instanceof Error ? error.message : `${method} ${path} failed`,
        { path, retryable: true }
      );
    } finally {
      window.clearTimeout(timeout);
      requestOptions.signal?.removeEventListener("abort", onConsumerAbort);
    }
  }

  function request<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    requestOptions: ApiRequestOptions = {}
  ): Promise<T> {
    if (method !== "GET" || requestOptions.dedupe === false) {
      return perform<T>(method, path, body, requestOptions);
    }

    const key = `${method}:${path}`;
    let shared = inflight.get(key) as Promise<T> | undefined;
    if (!shared) {
      const sharedOptions = { ...requestOptions };
      delete sharedOptions.signal;
      shared = perform<T>(method, path, body, {
        ...sharedOptions
      }).finally(() => inflight.delete(key));
      inflight.set(key, shared);
    }
    return requestOptions.signal
      ? Promise.race([shared, abortPromise(requestOptions.signal, path)])
      : shared;
  }

  return {
    get: <T>(path: string, requestOptions?: ApiRequestOptions) =>
      request<T>("GET", path, undefined, requestOptions),
    post: <T>(path: string, body?: unknown, requestOptions?: ApiRequestOptions) =>
      request<T>("POST", path, body, {
        ...requestOptions,
        dedupe: false
      })
  };
}

export const apiClient = createApiClient();
