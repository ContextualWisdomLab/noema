import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GitHub credential capability ingress", () => {
  it("keeps real GitHub bearer tokens out of Node process environment reads", () => {
    const governance = readFileSync("scripts/main-governance-audit.mjs", "utf8");
    const commercialLoop = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");

    for (const script of [governance, commercialLoop]) {
      expect(script).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
      expect(script).toContain("readDelegatedGithubToken");
      expect(script).not.toContain("process.env.GH_TOKEN");
    }
  });

  it("bootstraps the short-lived Maintainer App token into a mode-0600 capability file", () => {
    for (const workflowPath of [
      ".github/workflows/hourly-commercial-readiness.yml",
      ".github/workflows/maintainer-app-readiness.yml",
    ]) {
      const workflow = readFileSync(workflowPath, "utf8");

      expect(workflow).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
      expect(workflow).toContain("umask 077");
      expect(workflow).toContain("trap 'rm -f \"$token_path\"' EXIT");
      expect(workflow).not.toContain("GH_TOKEN: ${{ steps.maintainer_app.outputs.token }}");
    }
  });
});
