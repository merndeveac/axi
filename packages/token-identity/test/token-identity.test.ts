import { describe, expect, it } from "vitest";
import {
  createDisplayName,
  createEmptyTokenIdentity,
  createTokenTitle,
  isTokenIdentityResolved,
  mergeTokenIdentities,
  normalizeOffchainMetadataIdentity,
  normalizePumpPortalIdentity,
  normalizeSolanaMetadataIdentity,
  normalizeTokenName,
  normalizeTokenSymbol,
  sanitizeImageUri,
  sanitizeMetadataUri,
  scoreIdentityCompleteness
} from "../src/index";

const mint = "So11111111111111111111111111111111111111112";

describe("@axi/token-identity", () => {
  it("normalizes token name and symbol", () => {
    expect(normalizeTokenName("  Axi\0   Token  ")).toBe("Axi Token");
    expect(normalizeTokenSymbol(" axi ")).toBe("AXI");
  });

  it("creates title and display names", () => {
    const identity = {
      mint,
      name: "Axi Token",
      symbol: "AXI"
    };

    expect(createTokenTitle(identity)).toBe("AXI - Axi Token");
    expect(createDisplayName(identity)).toBe("AXI Axi Token");
  });

  it("uses short mint fallback for unresolved identity", () => {
    const identity = createEmptyTokenIdentity(mint);

    expect(identity.title).toBe("So1111...1112");
    expect(identity.confidence).toBe("none");
    expect(identity.reasonCodes).toContain("IDENTITY_UNRESOLVED");
    expect(isTokenIdentityResolved(identity)).toBe(false);
  });

  it("normalizes PumpPortal payload identity", () => {
    const identity = normalizePumpPortalIdentity({
      mint,
      name: "Portal Token",
      symbol: "PORT",
      metadataUri: "https://example.test/meta.json",
      image: "https://example.test/token.png",
      twitter: "https://x.com/portal"
    });

    expect(identity.name).toBe("Portal Token");
    expect(identity.symbol).toBe("PORT");
    expect(identity.metadataUri).toBe("https://example.test/meta.json");
    expect(identity.imageUri).toBe("https://example.test/token.png");
    expect(identity.reasonCodes).toContain("IDENTITY_FROM_PUMPPORTAL");
    expect(identity.realData).toBe(true);
  });

  it("normalizes Solana metadata identity", () => {
    const identity = normalizeSolanaMetadataIdentity({
      mint,
      name: "Solana Token",
      symbol: "SOLT",
      metadataUri: "ipfs://cid/metadata.json"
    });

    expect(identity.name).toBe("Solana Token");
    expect(identity.symbol).toBe("SOLT");
    expect(identity.metadataUri).toBe("ipfs://cid/metadata.json");
    expect(identity.reasonCodes).toContain("IDENTITY_FROM_SOLANA_METADATA");
  });

  it("normalizes off-chain JSON metadata", () => {
    const identity = normalizeOffchainMetadataIdentity(
      {
        description: "A test token",
        discord: "https://discord.gg/axi",
        external_url: "https://axi.example",
        image: "ipfs://imagecid",
        name: "Offchain Token",
        symbol: "OFF",
        telegram: "https://t.me/axi",
        twitter: "https://x.com/axi"
      },
      "https://example.test/meta.json",
      mint
    );

    expect(identity.imageUri).toBe("ipfs://imagecid");
    expect(identity.description).toBe("A test token");
    expect(identity.website).toBe("https://axi.example/");
    expect(identity.reasonCodes).toContain("IDENTITY_DESCRIPTION_FOUND");
    expect(identity.reasonCodes).toContain("IDENTITY_SOCIAL_FOUND");
  });

  it("merges identities by source priority", () => {
    const pumpPortal = normalizePumpPortalIdentity({
      mint,
      name: "Pump Name",
      symbol: "PUMP",
      metadataUri: "https://example.test/meta.json"
    });
    const offchain = normalizeOffchainMetadataIdentity(
      {
        image: "https://example.test/image.png",
        name: "Offchain Name",
        symbol: "OFF"
      },
      "https://example.test/meta.json",
      mint
    );

    const merged = mergeTokenIdentities(pumpPortal, offchain);

    expect(merged.name).toBe("Offchain Name");
    expect(merged.symbol).toBe("OFF");
    expect(merged.imageUri).toBe("https://example.test/image.png");
    expect(merged.sourcePriority[0]).toBe("offchain_metadata");
    expect(merged.reasonCodes).toContain("IDENTITY_MERGED");
  });

  it("does not let mock identity override real identity", () => {
    const real = normalizePumpPortalIdentity({
      mint,
      name: "Real Token",
      symbol: "REAL"
    });
    const mock = normalizePumpPortalIdentity({
      mint,
      name: "Mock Token",
      symbol: "MOCK"
    });
    mock.dataSource = "mock";
    mock.realData = false;
    mock.sources = mock.sources.map((source) => ({
      ...source,
      realData: false,
      source: "mock"
    }));

    const merged = mergeTokenIdentities(real, mock);

    expect(merged.name).toBe("Real Token");
    expect(merged.symbol).toBe("REAL");
  });

  it("rejects unsafe URI schemes", () => {
    expect(sanitizeMetadataUri("javascript:alert(1)")).toBeNull();
    expect(sanitizeImageUri("data:text/html,<script>x</script>")).toBeNull();
    expect(sanitizeImageUri("https://example.test/image.png")).toBe(
      "https://example.test/image.png"
    );
  });

  it("sanitizes HTML and script-like text", () => {
    const identity = normalizePumpPortalIdentity({
      mint,
      name: "<script>alert(1)</script> Token",
      symbol: "<b>bad</b>"
    });

    expect(identity.name).toBe("alert(1) Token");
    expect(identity.symbol).toBe("BAD");
    expect(identity.title).not.toContain("<script>");
  });

  it("scores completeness", () => {
    const empty = createEmptyTokenIdentity(mint);
    const complete = normalizeOffchainMetadataIdentity(
      {
        description: "Complete token",
        external_url: "https://axi.example",
        image: "https://example.test/image.png",
        name: "Complete",
        symbol: "CMP",
        twitter: "https://x.com/axi"
      },
      "https://example.test/meta.json",
      mint
    );

    expect(scoreIdentityCompleteness(empty)).toBe(0);
    expect(scoreIdentityCompleteness(complete)).toBeGreaterThan(60);
  });
});
