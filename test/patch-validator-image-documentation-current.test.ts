import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("patch-validator image documentation", () => {
  it("describes the current static runtime and embedded dependency evidence", () => {
    const changelog = read("CHANGELOG.md");
    const publicDoc = read("docs/patch-validator-image.md");
    const doctoring = read("docs/doctoring/patch-validator-image.md");
    const assessmentDoctoring = read(
      "docs/doctoring/patch-validator-embedded-scan-assessment.md",
    );

    const imageEntry = changelog
      .split("\n")
      .find((line) => line.startsWith("- repository-owned patch-validator image"));

    expect(imageEntry).toBeDefined();
    expect(imageEntry).toContain("Node.js 24.19.0");
    expect(imageEntry).toContain("`scratch`");
    expect(imageEntry).toContain("`process.versions`");
    expect(imageEntry).not.toContain("Distroless runtime digest");

    expect(publicDoc).toContain("`process.versions`");
    expect(publicDoc).toContain("embedded-runtime-inventory.json");
    expect(publicDoc).toContain("embedded-runtime-vulnerability-scan.json");
    expect(publicDoc).toContain("`modules` and `napi`");

    expect(doctoring).toContain("`process.versions`");
    expect(doctoring).toContain("one result per bundled dependency");
    expect(doctoring).not.toContain(
      "statically linked third-party code that is not independently surfaced as a separate package",
    );

    expect(assessmentDoctoring).toContain("reviewed identity catalog");
    expect(assessmentDoctoring).toMatch(/raw Grype/i);
    expect(assessmentDoctoring).toMatch(
      /same vulnerability database|shared vulnerability database/i,
    );
    expect(assessmentDoctoring).not.toMatch(
      /assessment\.status\s*=\s*["'`]completed/i,
    );
    expect(assessmentDoctoring).not.toMatch(/positive assessment record/i);
    expect(assessmentDoctoring).toContain("National Vulnerability Database");
    expect(assessmentDoctoring).toContain("Supported scan targets");
  });
});
