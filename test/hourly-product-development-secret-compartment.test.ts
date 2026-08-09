import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";
const pluginPath = ".opencode/plugins/noema-secret-compartment.js";

function workflowText(): string {
  return readFileSync(workflowPath, "utf8");
}

function pluginText(): string {
  return readFileSync(pluginPath, "utf8");
}

describe("hourly product-development model secret compartment", () => {
  it("keeps the provider secret in the OpenCode process while denying model shell subprocesses", () => {
    const workflow = workflowText();
    const plugin = pluginText();

    expect(workflow).toContain(
      "NVIDIA_API_KEY: ${{ secrets.NVIDIA_NIM_API_KEY }}",
    );
    expect(workflow).toContain('"external_directory": "deny"');
    expect(workflow).toContain('"task": "deny"');
    expect(workflow).toContain('"webfetch": "deny"');
    expect(workflow).toContain('"websearch": "deny"');
    expect(workflow).not.toContain("opencode run --pure");

    expect(plugin).toContain('input.tool === "bash"');
    expect(plugin).toContain("throw new Error");
    expect(plugin).toContain("NVIDIA NIM credential compartment");
    expect(plugin).not.toContain("process.env");
  });
});
