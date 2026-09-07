import { describe, expect, it } from "vitest";

import { buildOpenCodeOrchestratorConfig } from "../scripts/lib/orchestrator-gateway.mjs";

describe("OpenCode tool capability boundary", () => {
  it("denies unknown tools by default and allows only worktree analysis/edit capabilities", () => {
    const config = buildOpenCodeOrchestratorConfig({
      apiUrl: "https://orchestrator.example/v1",
      model: "orchestrator/free",
    });

    expect(config.permission).toMatchObject({
      "*": "deny",
      read: "allow",
      edit: "allow",
      glob: "allow",
      grep: "allow",
      list: "allow",
      external_directory: "deny",
      task: "deny",
      question: "deny",
      webfetch: "deny",
      websearch: "deny",
      bash: "deny",
      skill: "deny",
      lsp: "deny",
      todowrite: "deny",
    });
  });
});
