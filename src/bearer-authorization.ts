const maximumBearerTokenLength = 16_384;
const canonicalBearerAuthorizationPattern = /^Bearer ([\x21-\x7e]+)$/i;
const utf8BomBase64UrlPrefix = "77u_";

function decodeCanonicalBase64Url(segment: string): Uint8Array | undefined {
  if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) return undefined;
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((segment.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    let roundTripBinary = "";
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
      roundTripBinary += String.fromCharCode(bytes[index]);
    }
    const canonical = btoa(roundTripBinary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    return canonical === segment ? bytes : undefined;
  } catch {
    return undefined;
  }
}

function decodeJwtJsonText(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return undefined;
  }
}

function hasDuplicateTopLevelJsonKeys(bytes: Uint8Array): boolean {
  const text = decodeJwtJsonText(bytes);
  if (text === undefined) return false;

  const seenKeys = new Set<string>();
  let structureDepth = 0;
  let stringStart = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character !== '"') continue;

      inString = false;
      if (structureDepth !== 1) continue;

      let lookahead = index + 1;
      while (lookahead < text.length && /\s/.test(text[lookahead])) lookahead += 1;
      if (text[lookahead] !== ":") continue;

      const encodedKey = text.slice(stringStart + 1, index);
      let decodedKey: string;
      try {
        decodedKey = JSON.parse(`"${encodedKey}"`) as string;
      } catch {
        return false;
      }
      if (seenKeys.has(decodedKey)) return true;
      seenKeys.add(decodedKey);
      continue;
    }

    if (character === '"') {
      inString = true;
      stringStart = index;
      continue;
    }
    if (character === "{" || character === "[") {
      structureDepth += 1;
      continue;
    }
    if (character === "}" || character === "]") structureDepth -= 1;
  }

  return false;
}

/**
 * Return the bearer credential only when the Authorization field is already in the
 * canonical `Bearer <visible-ascii-token>` form and remains within the bounded OIDC
 * credential envelope. The parser never trims or normalizes attacker-controlled framing.
 * Each JWT segment must already be non-empty canonical unpadded base64url. Protected
 * headers or payloads beginning with a UTF-8 BOM, or containing duplicate top-level JSON
 * member names after escape decoding, are rejected before any claim reader can silently
 * reinterpret the signed authority bytes.
 *
 * @param authorization Raw HTTP Authorization field bytes decoded as a JavaScript string.
 * @returns The exact bearer credential when framing and bounds are canonical; otherwise undefined.
 */
export function parseExactBearerToken(authorization: string): string | undefined {
  if (authorization.length > "Bearer ".length + maximumBearerTokenLength) return undefined;
  const token = canonicalBearerAuthorizationPattern.exec(authorization)?.[1];
  if (!token) return undefined;
  const segments = token.split(".");
  if (segments.length !== 3) return undefined;

  const decodedSegments = segments.map(decodeCanonicalBase64Url);
  if (decodedSegments.some((bytes) => bytes === undefined)) return undefined;
  const [headerBytes, payloadBytes] = decodedSegments as [Uint8Array, Uint8Array, Uint8Array];

  if (
    segments[0].startsWith(utf8BomBase64UrlPrefix)
    || segments[1].startsWith(utf8BomBase64UrlPrefix)
    || hasDuplicateTopLevelJsonKeys(headerBytes)
    || hasDuplicateTopLevelJsonKeys(payloadBytes)
  ) return undefined;
  return token;
}
