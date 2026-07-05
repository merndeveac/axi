import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export type PumpfunIdlInstruction = {
  name: string;
  discriminator?: number[];
};

export type PumpfunIdlEvent = {
  name: string;
  discriminator?: number[];
};

export type PumpfunIdl = {
  address?: string;
  metadata?: {
    name?: string;
    version?: string;
    origin?: string;
  };
  instructions?: PumpfunIdlInstruction[];
  events?: PumpfunIdlEvent[];
};

export type AnchorIdentification = {
  matched: boolean;
  name: string | null;
  discriminatorHex: string | null;
  reasonCodes: string[];
};

export type AnchorProgramDataParseResult = {
  ok: boolean;
  data: Uint8Array | null;
  base64: string | null;
  reasonCodes: string[];
  error?: string;
};

export type AnchorEventDecodeResult = {
  ok: boolean;
  eventName: string | null;
  discriminatorHex: string | null;
  rawDataBase64: string | null;
  decoded: null;
  reasonCodes: string[];
  error?: string;
};

export type PumpfunIdlDecoder = {
  status: "unavailable" | "loaded" | "test_idl_only";
  idl: PumpfunIdl | null;
  identifyInstruction: (data: string | Uint8Array) => AnchorIdentification;
  decodeEventLog: (logLine: string) => AnchorEventDecodeResult;
};

export function loadPumpfunIdl(path?: string): PumpfunIdl | null {
  if (!path) {
    return null;
  }

  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8")) as PumpfunIdl;
}

export function getAnchorInstructionDiscriminator(name: string): Uint8Array {
  return createAnchorDiscriminator(`global:${name}`);
}

export function getAnchorEventDiscriminator(name: string): Uint8Array {
  return createAnchorDiscriminator(`event:${name}`);
}

export function identifyAnchorInstructionByDiscriminator(
  data: string | Uint8Array,
  idl: PumpfunIdl | null | undefined
): AnchorIdentification {
  return identifyByDiscriminator(data, idl?.instructions ?? [], "instruction");
}

export function identifyAnchorEventByDiscriminator(
  data: string | Uint8Array,
  idl: PumpfunIdl | null | undefined
): AnchorIdentification {
  return identifyByDiscriminator(data, idl?.events ?? [], "event");
}

export function parseAnchorProgramDataLog(
  logLine: string
): AnchorProgramDataParseResult {
  const match = /^Program data:\s+(.+)$/i.exec(logLine.trim());

  if (!match?.[1]) {
    return {
      ok: false,
      data: null,
      base64: null,
      reasonCodes: ["ANCHOR_PROGRAM_DATA_LOG_NOT_FOUND"],
      error: "Log line is not an Anchor Program data log"
    };
  }

  try {
    const data = Buffer.from(match[1], "base64");

    if (data.length < 8) {
      return {
        ok: false,
        data,
        base64: match[1],
        reasonCodes: ["ANCHOR_PROGRAM_DATA_TOO_SHORT"],
        error: "Program data payload is shorter than an Anchor discriminator"
      };
    }

    return {
      ok: true,
      data,
      base64: match[1],
      reasonCodes: ["ANCHOR_PROGRAM_DATA_PARSED"]
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      base64: match[1],
      reasonCodes: ["ANCHOR_PROGRAM_DATA_PARSE_FAILED"],
      error: error instanceof Error ? error.message : "Unknown base64 parse error"
    };
  }
}

export function decodeAnchorEventFromProgramData(
  logLine: string,
  idl: PumpfunIdl | null | undefined
): AnchorEventDecodeResult {
  const parsed = parseAnchorProgramDataLog(logLine);

  if (!parsed.ok || !parsed.data) {
    return {
      ok: false,
      eventName: null,
      discriminatorHex: null,
      rawDataBase64: parsed.base64,
      decoded: null,
      reasonCodes: parsed.reasonCodes,
      ...(parsed.error ? { error: parsed.error } : {})
    };
  }

  const identified = identifyAnchorEventByDiscriminator(parsed.data, idl);

  return {
    ok: identified.matched,
    eventName: identified.name,
    discriminatorHex: identified.discriminatorHex,
    rawDataBase64: parsed.base64,
    decoded: null,
    reasonCodes: identified.matched
      ? ["ANCHOR_EVENT_IDENTIFIED", ...identified.reasonCodes]
      : ["ANCHOR_EVENT_NOT_IDENTIFIED", ...identified.reasonCodes],
    ...(identified.matched ? {} : { error: "No matching event discriminator" })
  };
}

export function createPumpfunIdlDecoder(options: {
  idl?: PumpfunIdl | null;
  idlPath?: string;
  testIdlOnly?: boolean;
} = {}): PumpfunIdlDecoder {
  const idl = options.idl ?? loadPumpfunIdl(options.idlPath);
  const status = !idl
    ? "unavailable"
    : options.testIdlOnly
      ? "test_idl_only"
      : "loaded";

  return {
    status,
    idl,
    identifyInstruction: (data) => identifyAnchorInstructionByDiscriminator(data, idl),
    decodeEventLog: (logLine) => decodeAnchorEventFromProgramData(logLine, idl)
  };
}

function createAnchorDiscriminator(seed: string): Uint8Array {
  return createHash("sha256").update(seed).digest().subarray(0, 8);
}

function identifyByDiscriminator(
  data: string | Uint8Array,
  entries: Array<{ name: string; discriminator?: number[] }>,
  namespace: "instruction" | "event"
): AnchorIdentification {
  const bytes = normalizeData(data);

  if (!bytes || bytes.length < 8) {
    return {
      matched: false,
      name: null,
      discriminatorHex: bytes ? toHex(bytes.subarray(0, 8)) : null,
      reasonCodes: ["ANCHOR_DISCRIMINATOR_DATA_INVALID"]
    };
  }

  const actual = bytes.subarray(0, 8);

  for (const entry of entries) {
    const expected = entry.discriminator
      ? Uint8Array.from(entry.discriminator)
      : namespace === "instruction"
        ? getAnchorInstructionDiscriminator(entry.name)
        : getAnchorEventDiscriminator(entry.name);

    if (toHex(actual) === toHex(expected)) {
      return {
        matched: true,
        name: entry.name,
        discriminatorHex: toHex(actual),
        reasonCodes: ["ANCHOR_DISCRIMINATOR_MATCHED"]
      };
    }
  }

  return {
    matched: false,
    name: null,
    discriminatorHex: toHex(actual),
    reasonCodes: ["ANCHOR_DISCRIMINATOR_NOT_MATCHED"]
  };
}

function normalizeData(data: string | Uint8Array): Uint8Array | null {
  if (data instanceof Uint8Array) {
    return data;
  }

  const trimmed = data.trim();

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    return Uint8Array.from(Buffer.from(trimmed, "hex"));
  }

  try {
    return Uint8Array.from(Buffer.from(trimmed, "base64"));
  } catch {
    return null;
  }
}

function toHex(data: Uint8Array): string {
  return Buffer.from(data).toString("hex");
}
