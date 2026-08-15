/**
 * Convert a cache TTL configuration into bounded milliseconds.
 *
 * Noema accepts positive fractional configuration for compatibility with the
 * existing numeric environment contract, but cache expiry must never normalize
 * to zero. Values that are non-finite, non-positive, or smaller than one whole
 * second therefore fall back to the reviewed default. Larger values are floored
 * and capped before conversion to milliseconds.
 *
 * @param raw optional environment value expressed in seconds
 * @param defaultSeconds safe fallback TTL in seconds
 * @param maxSeconds maximum accepted TTL in seconds
 * @returns a positive bounded TTL in milliseconds
 */
export function configuredTtlMs(
  raw: string | undefined,
  defaultSeconds: number,
  maxSeconds: number,
): number {
  const seconds = Number(raw ?? String(defaultSeconds));
  if (!Number.isFinite(seconds) || seconds <= 0) return defaultSeconds * 1000;
  const normalizedSeconds = Math.floor(seconds);
  if (normalizedSeconds <= 0) return defaultSeconds * 1000;
  return Math.min(normalizedSeconds, maxSeconds) * 1000;
}
