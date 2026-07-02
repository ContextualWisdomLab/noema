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
