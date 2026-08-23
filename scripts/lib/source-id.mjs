const compactCredentialLabelPattern = /(^|[^a-z0-9])(clientsecret|sessiontoken|authtoken|accesstoken|refreshtoken|accesskeyid|secretaccesskey|signingkey)([^a-z0-9]|$)/i;
const credentialHeaderAssignmentPattern = /(^|[^a-z0-9])(authorization|bearer)\s*[:=]/i;
const githubCredentialTokenPattern = /(^|[^a-z0-9])(github_pat_|gh[pousr]_)/i;
const npmCredentialTokenPattern = /(^|[^a-z0-9])npm_[a-z0-9]{36}([^a-z0-9]|$)/i;
const unsafeIdentityCodePointPattern = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const nonCanonicalSpacePattern = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/u;

export function hasUnsafeSourceId(value) {
  const rawSourceId = String(value ?? "");
  const sourceId = rawSourceId.trim();
  const normalized = sourceId.toLowerCase();
  const camelSeparatedSourceId = sourceId.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return rawSourceId !== sourceId
    || sourceId !== sourceId.normalize("NFKC")
    || unsafeIdentityCodePointPattern.test(sourceId)
    || nonCanonicalSpacePattern.test(sourceId)
    || normalized === "placeholder"
    || normalized === "todo"
    || normalized === "tbd"
    || normalized.startsWith("replace-with-")
    || sourceId.includes("://")
    || sourceId.includes("?")
    || githubCredentialTokenPattern.test(sourceId)
    || npmCredentialTokenPattern.test(sourceId)
    || /(^|[^a-z0-9])(token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)([^a-z0-9]|$)/i.test(camelSeparatedSourceId)
    || compactCredentialLabelPattern.test(sourceId)
    || credentialHeaderAssignmentPattern.test(sourceId);
}
