const maximumBearerTokenLength = 16_384;
const canonicalBearerAuthorizationPattern = /^Bearer ([\x21-\x7e]+)$/i;

/**
 * Return the bearer credential only when the Authorization field is already in the
 * canonical `Bearer <visible-ascii-token>` form and remains within the bounded OIDC
 * credential envelope. The parser never trims or normalizes attacker-controlled framing.
 */
export function parseExactBearerToken(authorization: string): string | undefined {
  if (authorization.length > "Bearer ".length + maximumBearerTokenLength) return undefined;
  return canonicalBearerAuthorizationPattern.exec(authorization)?.[1];
}
