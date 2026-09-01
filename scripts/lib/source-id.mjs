const unsafeDisplayControlPattern = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/u;

export function hasUnsafeSourceId(value) {
  const rawSourceId = String(value ?? "");
  const sourceId = rawSourceId.trim();
  const normalized = sourceId.toLowerCase();
  return rawSourceId !== sourceId
    || unsafeDisplayControlPattern.test(sourceId)
    || normalized === "placeholder"
    || normalized === "todo"
    || normalized === "tbd"
    || normalized.startsWith("replace-with-")
    || /https?:\/\//i.test(sourceId)
    || sourceId.includes("?")
    || /(^|[^a-z0-9])(github_pat_|gh[pousr]_)/i.test(sourceId)
    || /(^|[^a-z0-9])(token|secret|api[_-]?key|access[_-]?key|private[_-]?key)([^a-z0-9]|$)/i.test(sourceId);
}
