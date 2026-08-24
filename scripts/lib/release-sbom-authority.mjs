const unsafeBomRefCharacterPattern = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}]/u;

export function requireCanonicalReleaseBomRef(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || unsafeBomRefCharacterPattern.test(value)
  ) {
    throw new Error(
      `${label} must be a canonical non-empty bom-ref identity without control, format, or Unicode separator characters`,
    );
  }
  return value;
}
