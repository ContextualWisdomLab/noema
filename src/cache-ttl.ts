const canonicalUnsignedDecimalSecondsPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/**
 * Convert a cache TTL configuration into bounded milliseconds.
 *
 * Noema accepts positive fractional decimal configuration for compatibility with
 * the existing numeric environment contract, but cache expiry must never normalize
 * to zero. Operator-provided values must already be canonical unsigned decimal
 * strings; surrounding whitespace, signs, hexadecimal/exponent aliases, leading-zero
 * integer spellings, non-finite values, non-positive values, or values smaller than
 * one whole second fall back to the reviewed default without exceeding the configured
 * maximum. Larger values are floored and capped before conversion to milliseconds.
 *
 * @param raw optional environment value expressed in canonical decimal seconds
 * @param defaultSeconds safe fallback TTL in seconds
 * @param maxSeconds maximum accepted TTL in seconds
 * @returns a positive bounded TTL in milliseconds
 */
export function configuredTtlMs(
  raw: string | undefined,
  defaultSeconds: number,
  maxSeconds: number,
): number {
  const fallbackMilliseconds = Math.min(defaultSeconds, maxSeconds) * 1000;
  if (raw !== undefined && !canonicalUnsignedDecimalSecondsPattern.test(raw)) {
    return fallbackMilliseconds;
  }
  const seconds = Number(raw ?? String(defaultSeconds));
  if (!Number.isFinite(seconds) || seconds <= 0) return fallbackMilliseconds;
  const normalizedSeconds = Math.floor(seconds);
  if (normalizedSeconds <= 0) return fallbackMilliseconds;
  return Math.min(normalizedSeconds, maxSeconds) * 1000;
}
