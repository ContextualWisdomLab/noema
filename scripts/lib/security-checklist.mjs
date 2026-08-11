const isoDateOrTimestampRegex = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;

export function evaluateSecurityChecklistText(text) {
  const items = [...text.matchAll(/^\s*-\s*\[( |x|X)\]\s+(.+?)\s*$/gm)].map((match) => ({
    checked: match[1].toLowerCase() === "x",
    label: match[2],
  }));
  const unchecked = items.filter((item) => !item.checked);

  return {
    passed: items.length > 0 && unchecked.length === 0,
    total: items.length,
    checked: items.length - unchecked.length,
    unchecked: unchecked.map((item) => item.label),
  };
}

function isPlaceholder(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "placeholder"
    || normalized === "todo"
    || normalized === "tbd"
    || normalized.startsWith("replace-with-")
    || normalized.includes("docs/evidence-templates/")
    || normalized.endsWith(".example.json");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasReviewedReferences(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => isNonEmptyString(item) && !isPlaceholder(item));
}

function parseIsoDateOrTimestamp(value) {
  const match = isoDateOrTimestampRegex.exec(value);
  if (!match) return Number.NaN;

  const datePart = match[1];
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart) {
    return Number.NaN;
  }
  return Date.parse(value);
}

export function evaluateSecurityEvidence(value) {
  const failures = [];
  const updatedAt = typeof value?.updated_at === "string" ? value.updated_at.trim() : "";
  const updatedAtMs = parseIsoDateOrTimestamp(updatedAt);

  if (!isNonEmptyString(value?.owner)) {
    failures.push("owner required");
  } else if (isPlaceholder(value.owner)) {
    failures.push("owner cannot be a placeholder");
  }
  if (value?.checklist_path !== "docs/security-validation-checklist.md") {
    failures.push("checklist_path must be docs/security-validation-checklist.md");
  }
  if (!hasReviewedReferences(value?.source_documents)) {
    failures.push("source_documents must reference reviewed evidence");
  }
  if (!hasReviewedReferences(value?.validation_artifacts)) {
    failures.push("validation_artifacts must reference reviewed evidence");
  }
  if (Number.isNaN(updatedAtMs)) {
    failures.push("updated_at must be an ISO date or timestamp");
  } else if (updatedAtMs - Date.now() > 24 * 60 * 60 * 1000) {
    failures.push("updated_at cannot be in the future");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
