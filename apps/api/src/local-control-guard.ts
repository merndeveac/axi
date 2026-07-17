import type { FastifyReply, FastifyRequest } from "fastify";

export const defaultAllowedControlOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173"
] as const;

export type LocalControlDecision = {
  allowed: boolean;
  mutation: boolean;
  reasonCodes: string[];
};

export function createAllowedControlOrigins(
  origins: readonly string[] | undefined
): Set<string> {
  return new Set(
    (origins?.length ? origins : defaultAllowedControlOrigins)
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );
}

export function evaluateLocalControlRequest(
  request: FastifyRequest,
  allowedOrigins: ReadonlySet<string>
): LocalControlDecision {
  const mutation = isMutationMethod(request.method);

  if (!mutation) {
    return {
      allowed: true,
      mutation,
      reasonCodes: ["READ_ONLY_REQUEST"]
    };
  }

  const addresses = getRequestAddresses(request);
  const local = addresses.length > 0 && addresses.every(isLocalAddress);

  if (!local) {
    return {
      allowed: false,
      mutation,
      reasonCodes: ["NON_LOCAL_MUTATION_REJECTED"]
    };
  }

  const origin = normalizeOrigin(request.headers.origin);

  if (origin && !allowedOrigins.has(origin)) {
    return {
      allowed: false,
      mutation,
      reasonCodes: ["UNAPPROVED_CONTROL_ORIGIN"]
    };
  }

  return {
    allowed: true,
    mutation,
    reasonCodes: [
      "LOCAL_MUTATION_ALLOWED",
      ...(origin ? ["CONTROL_ORIGIN_ALLOWED"] : ["NO_BROWSER_ORIGIN"])
    ]
  };
}

export function applyControlCorsHeaders(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedOrigins: ReadonlySet<string>
): void {
  const origin = normalizeOrigin(request.headers.origin);

  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "content-type");

  if (origin && allowedOrigins.has(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
  }
}

export function sendLocalControlRejection(
  reply: FastifyReply,
  decision: LocalControlDecision
): FastifyReply {
  const reason = decision.reasonCodes[0] ?? "LOCAL_CONTROL_REJECTED";

  return reply.code(403).send({
    error:
      reason === "NON_LOCAL_MUTATION_REJECTED"
        ? "CONTROL_REQUEST_DENIED_NON_LOCAL"
        : reason,
    message:
      reason === "UNAPPROVED_CONTROL_ORIGIN"
        ? "State-changing API requests are only accepted from an approved local origin."
        : "State-changing API requests are only accepted from the local machine.",
    reasonCodes: decision.reasonCodes,
    paperOnly: true,
    tradingDisabled: true
  });
}

export function isMutationMethod(method: string): boolean {
  return method === "POST" || method === "PATCH" || method === "DELETE";
}

function getRequestAddresses(request: FastifyRequest): string[] {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedAddresses =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",").map((value) => value.trim())
      : Array.isArray(forwardedFor)
        ? forwardedFor
            .flatMap((value) => value.split(","))
            .map((value) => value.trim())
        : [];
  const directAddresses = [request.ip, request.raw.socket.remoteAddress].filter(
    (value): value is string => Boolean(value)
  );

  return [...forwardedAddresses, ...directAddresses].filter(Boolean);
}

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.trim().replace(/\/$/, "");
}

function isLocalAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();

  return (
    normalized === "127.0.0.1" ||
    normalized.startsWith("127.") ||
    normalized === "::1" ||
    normalized === "localhost" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized.startsWith("::ffff:127.")
  );
}
