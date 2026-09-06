import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";

/** Resolve the platform temp root to its physical directory for security-sensitive fixtures. */
export function canonicalTempRoot(root = tmpdir()) {
  return realpathSync(root);
}
