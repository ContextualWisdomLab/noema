const canonicalBearerAuthorizationPattern = /^Bearer ([\x21-\x7e]+)$/i;

/**
 * Return the bearer credential only when the Authorization field is already in the
 * canonical `Bearer <visible-ascii-token>` form. The parser never trims or normalizes
 * attacker-controlled credential framing.
 */
export function parseExactBearerToken(authorization: string): string | undefined {
  return canonicalBearerAuthorizationPattern.exec(authorization)?.[1];
}
