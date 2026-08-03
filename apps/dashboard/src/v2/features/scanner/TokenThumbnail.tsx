import { useState } from "react";

export function sanitizeMetadataImageUri(uri: string | null): string | null {
  if (!uri) return null;
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function TokenThumbnail({
  uri,
  symbol
}: {
  uri: string | null;
  symbol: string;
}) {
  const [failed, setFailed] = useState(false);
  const safeUri = failed ? null : sanitizeMetadataImageUri(uri);
  return (
    <span className="axi-v2-token-thumbnail" aria-hidden="true">
      {safeUri ? (
        <img src={safeUri} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{symbol.slice(0, 2).toUpperCase() || "AX"}</span>
      )}
    </span>
  );
}
