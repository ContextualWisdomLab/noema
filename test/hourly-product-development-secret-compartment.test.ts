import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";
const pluginPath = ".opencode/plugins/noema-secret-compartment.js";
const agentGuidancePath = "AGENTS.md";

type SecretCompartmentHooks = {
  "tool.execute.before": (input: { tool: string }) => Promise<void>;
};

function workflowText(): string {
  return readFileSync(workflowPath, "utf8");
}

function pluginText(): string {
  return readFileSync(pluginPath, "utf8");
}

function agentGuidanceText(): string {
  return readFileSync(agentGuidancePath, "utf8");
}

async function secretCompartmentHooks(): Promise<SecretCompartmentHooks> {
  const moduleUrl = pathToFileURL(resolve(pluginPath)).href;
  const pluginModule = await import(moduleUrl) as {
    NoemaSecretCompartment: () => Promise<SecretCompartmentHooks>;
  };
  return pluginModule.NoemaSecretCompartment();
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

  it("executes the trusted hook, rejects bash, and leaves non-shell tools available", async () => {
    const hooks = await secretCompartmentHooks();

    await expect(
      hooks["tool.execute.before"]({ tool: "bash" }),
    ).rejects.toThrow("NVIDIA NIM credential compartment");
    await expect(
      hooks["tool.execute.before"]({ tool: "edit" }),
    ).resolves.toBeUndefined();
  });

  it("keeps repository-consumed guidance aligned with the credential and central scan boundaries", () => {
    const guidance = agentGuidanceText();

    expect(guidance).toContain(
      "OpenCode proposer is credential-bearing only for the NVIDIA NIM provider",
    );
    expect(guidance).toContain(
      "model-selected shell execution is denied by the trusted project plugin",
    );
    expect(guidance).not.toContain(
      "OpenCode process runs in an\nuncredentialed proposal workspace",
    );
    expect(guidance).toContain("MEDIUM/HIGH/CRITICAL");
    expect(guidance).not.toContain("CRITICAL/HIGH,\n  fixable only");
  });
});
