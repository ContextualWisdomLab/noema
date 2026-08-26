const maximumBearerTokenLength = 16_384;
const canonicalBearerAuthorizationPattern = /^Bearer ([\x21-\x7e]+)$/i;
const utf8BomBase64UrlPrefix = "77u_";

/**
 * Return the bearer credential only when the Authorization field is already in the
 * canonical `Bearer <visible-ascii-token>` form and remains within the bounded OIDC
 * credential envelope. The parser never trims or normalizes attacker-controlled framing.
 * JWT payloads beginning with a UTF-8 BOM are rejected before any claim reader can
 * silently strip those signed bytes while interpreting JSON authority.
 *
 * @param authorization Raw HTTP Authorization field bytes decoded as a JavaScript string.
 * @returns The exact bearer credential when framing and bounds are canonical; otherwise undefined.
 */
export function parseExactBearerToken(authorization: string): string | undefined {
  if (authorization.length > "Bearer ".length + maximumBearerTokenLength) return undefined;
  const token = canonicalBearerAuthorizationPattern.exec(authorization)?.[1];
  if (!token) return undefined;
  const segments = token.split(".");
  if (segments.length === 3 && segments[1].startsWith(utf8BomBase64UrlPrefix)) return undefined;
  return token;
}
