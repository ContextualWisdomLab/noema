const unsafeBomRefCharacterPattern = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/u;

export function requireCanonicalReleaseBomRef(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value !== value.normalize("NFC")
    || unsafeBomRefCharacterPattern.test(value)
  ) {
    throw new Error(
      `${label} must be a canonical non-empty bom-ref identity in NFC without control, format, surrogate, or non-ASCII Unicode separator characters`,
    );
  }
  return value;
}
