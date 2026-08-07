import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const dockerfilePath = resolve(import.meta.dirname, "..", "Dockerfile.patch-validator");

describe("patch-validator package note identity", () => {
  it("does not embed a generic package URL in the static Node package note", () => {
    const dockerfile = readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).not.toContain("pkg:generic/");
    expect(dockerfile).toContain(
      '"cpe":"cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*"',
    );
  });
});
