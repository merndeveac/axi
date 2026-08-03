export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly path: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { path: string; status?: number | null; retryable?: boolean }
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status ?? null;
    this.path = options.path;
    this.retryable = options.retryable ?? false;
  }
}

export class ApiTimeoutError extends ApiRequestError {
  constructor(path: string, timeoutMs: number) {
    super(`GET ${path} timed out after ${timeoutMs} ms`, {
      path,
      retryable: true
    });
    this.name = "ApiTimeoutError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
