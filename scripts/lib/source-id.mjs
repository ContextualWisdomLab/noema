export function hasUnsafeSourceId(value) {
  const sourceId = String(value ?? "").trim();
  const normalized = sourceId.toLowerCase();
  return normalized === "placeholder"
    || normalized === "todo"
    || normalized === "tbd"
    || normalized.startsWith("replace-with-")
    || /https?:\/\//i.test(sourceId)
    || sourceId.includes("?")
    || /(^|[^a-z0-9])(token|secret|api[_-]?key|access[_-]?key|private[_-]?key)([^a-z0-9]|$)/i.test(sourceId);
}
