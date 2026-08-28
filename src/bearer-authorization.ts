const maximumAuthorizationFieldLength = 16_384;
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
    const canonical = btoa(roundTripBinary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function hasNonObjectJsonShape(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed === null || typeof parsed !== "object" || Array.isArray(parsed);
  } catch {
    // Leave syntactically malformed object envelopes to the downstream malformed-token path.
    return false;
  }
}

function hasUnsupportedJoseSigningSemantics(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return (
      Object.prototype.hasOwnProperty.call(parsed, "crit")
      || Object.prototype.hasOwnProperty.call(parsed, "b64")
    );
  } catch {
    // Leave syntactically malformed protected headers to the downstream malformed-token path.
    return false;
  }
}

function hasDuplicateTopLevelJsonKeys(text: string): boolean {
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
 * credential envelope. The complete Authorization field, including the scheme and one
 * ASCII separator, must fit within the reviewed 16 KiB limit. The parser never trims or
 * normalizes attacker-controlled framing. Each JWT segment must already be non-empty
 * canonical unpadded base64url. Protected headers and payloads must also already be valid
 * UTF-8 JSON objects; BOM-prefixed authority, syntactically valid non-object envelopes,
 * unsupported JOSE critical/signing-input semantics, and duplicate top-level JSON member
 * names after escape decoding are rejected before any claim reader can silently
 * reinterpret signed bytes. Noema does not implement the RFC 7797 `b64` extension, so a
 * protected `b64` member is rejected whether or not a malformed token also omits `crit`.
 * Syntactically malformed JSON remains on the downstream malformed-token error boundary.
 *
 * @param authorization Raw HTTP Authorization field bytes decoded as a JavaScript string.
 * @returns The exact bearer credential when framing and bounds are canonical; otherwise undefined.
 */
export function parseExactBearerToken(authorization: string): string | undefined {
  if (authorization.length > maximumAuthorizationFieldLength) return undefined;
  const token = canonicalBearerAuthorizationPattern.exec(authorization)?.[1];
  if (!token) return undefined;
  const segments = token.split(".");
  if (segments.length !== 3) return undefined;
  const decodedSegments = segments.map(decodeCanonicalBase64Url);
  if (decodedSegments.some((bytes) => bytes === undefined)) return undefined;
  const [headerBytes, payloadBytes] = decodedSegments as [Uint8Array, Uint8Array, Uint8Array];
  const headerText = decodeJwtJsonText(headerBytes);
  const payloadText = decodeJwtJsonText(payloadBytes);
  if (
    headerText === undefined
    || payloadText === undefined
    || segments[0].startsWith(utf8BomBase64UrlPrefix)
    || segments[1].startsWith(utf8BomBase64UrlPrefix)
    || hasNonObjectJsonShape(headerText)
    || hasNonObjectJsonShape(payloadText)
    || hasUnsupportedJoseSigningSemantics(headerText)
    || hasDuplicateTopLevelJsonKeys(headerText)
    || hasDuplicateTopLevelJsonKeys(payloadText)
  ) return undefined;
  return token;
}