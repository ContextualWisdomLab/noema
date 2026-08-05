import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function workflowText(): string {
  return readFileSync(
    ".github/workflows/hourly-product-development.yml",
    "utf8",
  );
}

function metadataParserText(): string {
  return readFileSync("scripts/prepare-agent-pr-message.mjs", "utf8");
}

describe("hourly NVIDIA NIM OpenCode product-development workflow", () => {
  it("runs hourly without overlapping the deterministic commercial-readiness loop", () => {
    const workflow = workflowText();

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("dry_run:");
    expect(workflow).toContain('cron: "47 * * * *"');
    expect(workflow).toContain(
      "group: hourly-nim-product-development-${{ github.repository }}",
    );
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain(
      "github.repository == 'ContextualWisdomLab/noema'",
    );
    expect(workflow).not.toContain('cron: "17 * * * *"');
    expect(workflow).not.toContain("pull_request_target:");
  });

  it("separates model execution from every write-capable repository token", () => {
    const workflow = workflowText();
    const proposerIndex = workflow.indexOf("propose-product-increment:");
    const packagerIndex = workflow.indexOf("package-product-increment:");

    expect(proposerIndex).toBeGreaterThan(-1);
    expect(packagerIndex).toBeGreaterThan(proposerIndex);
    const proposer = workflow.slice(proposerIndex, packagerIndex);
    const packager = workflow.slice(packagerIndex);

    expect(proposer).toContain("permissions:\n      contents: read\n      pull-requests: read");
    expect(proposer).not.toContain("contents: write");
    expect(proposer).not.toContain("pull-requests: write");
    expect(packager).toContain("needs: propose-product-increment");
    expect(packager).toContain("contents: write");
    expect(packager).toContain("pull-requests: write");
    expect(packager).not.toContain("NVIDIA_API_KEY");
    expect(workflow).toContain(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );
    expect(workflow).toContain(
      "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
    );
    expect(workflow).toContain("retention-days: 1");
    expect(workflow).toContain("proposal.patch");
    expect(workflow).toContain("patch_sha256");
    expect(packager).toContain("sha256sum -c -");
  });

  it("fails closed before model execution when PR inventory or NIM credentials are unavailable", () => {
    const workflow = workflowText();

    expect(workflow).toContain("gh pr list");
    expect(workflow).toContain("--state open");
    expect(workflow).toContain("--limit 1");
    expect(workflow).toContain("pull_request_inventory_unavailable");
    expect(workflow).toContain("open_pull_request");
    expect(workflow).toContain("nim_api_key_unavailable");
    expect(workflow).toContain(
      "NIM_CONFIGURED: ${{ secrets.NVIDIA_NIM_API_KEY != '' }}",
    );
    expect(workflow).toContain("dispatch=false");
    expect(workflow).toContain("dispatch=true");
  });

  it("uses only the dedicated NVIDIA NIM development credential", () => {
    const workflow = workflowText();

    expect(workflow).toContain(
      "NVIDIA_API_KEY: ${{ secrets.NVIDIA_NIM_API_KEY }}",
    );
    expect(workflow).not.toContain("secrets.NVIDIA_API_KEY");
    expect(workflow).not.toContain("NOEMA_LLM_API_KEY");
    expect(workflow).not.toContain("NOEMA_GITHUB_APP_PRIVATE_KEY");
    expect(workflow.toLowerCase()).not.toContain("copilot");
    expect(workflow).not.toContain("id-token: write");
  });

  it("installs a checksum-pinned OpenCode binary and configures only NVIDIA NIM", () => {
    const workflow = workflowText();

    expect(workflow).toContain('OPENCODE_VERSION: "1.17.13"');
    expect(workflow).toContain(
      "157afa289d1a8d9372de0ce19ac726119b937a1f6b201808d46f06e4e59bb348",
    );
    expect(workflow).toContain(
      "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz",
    );
    expect(workflow).toContain("sha256sum -c -");
    expect(workflow).toContain('"share": "disabled"');
    expect(workflow).toContain('"lsp": false');
    expect(workflow).toContain('"mcp": {}');
    expect(workflow).toContain('"enabled_providers": ["nvidia-nim"]');
    expect(workflow).toContain(
      '"baseURL": "https://integrate.api.nvidia.com/v1"',
    );
    expect(workflow).toContain('"apiKey": "{env:NVIDIA_API_KEY}"');
    expect(workflow).toContain(
      "nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1.5",
    );
    expect(workflow).toContain(
      "nvidia-nim/nvidia/nemotron-3-super-120b-a12b",
    );
    expect(workflow).toContain("nvidia-nim/deepseek-ai/deepseek-v4-pro");
    expect(workflow).toContain("nvidia-nim/meta/llama-3.3-70b-instruct");
    expect(workflow).not.toContain("github-models/");
    expect(workflow).not.toContain("opencode-free/");
  });

  it("keeps GitHub credentials and runner command files out of the OpenCode subprocess", () => {
    const workflow = workflowText();

    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("env -u GH_TOKEN -u GITHUB_TOKEN");
    expect(workflow).toContain("-u REPOSITORY_TOKEN");
    expect(workflow).toContain("-u ACTIONS_ID_TOKEN_REQUEST_TOKEN");
    expect(workflow).toContain("-u ACTIONS_ID_TOKEN_REQUEST_URL");
    expect(workflow).toContain("-u GITHUB_ENV");
    expect(workflow).toContain("-u GITHUB_OUTPUT");
    expect(workflow).toContain("-u GITHUB_PATH");
    expect(workflow).toContain("-u GITHUB_STATE");
    expect(workflow).toContain("-u GITHUB_STEP_SUMMARY");
    expect(workflow).toContain('"external_directory": "deny"');
    expect(workflow).toContain('"task": "deny"');
    expect(workflow).toContain('"webfetch": "deny"');
    expect(workflow).toContain('"websearch": "deny"');
    expect(workflow).toContain('"git commit *": "deny"');
    expect(workflow).toContain('"git push *": "deny"');
    expect(workflow).toContain('"git tag *": "deny"');
    expect(workflow).toContain('"git remote *": "deny"');
    expect(workflow).toContain('"gh *": "deny"');
  });

  it("cleans failed candidates, verifies twice, and packages at most one bounded pull request", () => {
    const workflow = workflowText();

    expect(workflow).toContain("OPENCODE_RUN_TIMEOUT_SECONDS");
    expect(workflow).toContain("timeout --kill-after=30s");
    expect(workflow).toContain("git reset --hard HEAD");
    expect(workflow).toContain("git clean -fd");
    expect(workflow).toContain('MAX_CHANGED_FILES: "40"');
    expect(workflow).toContain('MAX_DIFF_BYTES: "500000"');
    expect(workflow.match(/npm run release:verify/g)?.length).toBeGreaterThanOrEqual(2);
    expect(workflow).toContain("git diff --cached --check");
    expect(workflow).toContain("mode 120000");
    expect(workflow).toContain('branch="nim-agent/product-dev-${GITHUB_RUN_ID}"');
    expect(workflow.match(/gh pr create/g)).toHaveLength(1);
    expect(workflow).toContain('--base "$DEFAULT_BRANCH"');
    expect(workflow).toContain('--head "$branch"');
    expect(workflow).toContain("PR_MESSAGE.md");
    expect(workflow).toContain("git status --porcelain");
    expect(workflow.indexOf("npm run release:verify")).toBeLessThan(
      workflow.indexOf("gh pr create"),
    );
    expect(workflow).not.toMatch(/gh pr merge|gh release create|wrangler deploy/);
  });

  it("revalidates the queue and base head before any remote proposal mutation", () => {
    const workflow = workflowText();
    const revalidationIndex = workflow.indexOf(
      "Revalidate queue and default-branch head",
    );
    const pushIndex = workflow.indexOf("git push origin");
    const createIndex = workflow.indexOf("gh pr create");

    expect(workflow).toContain("id: base");
    expect(workflow).toContain("base_sha=$(git rev-parse HEAD)");
    expect(workflow).toContain("needs.propose-product-increment.outputs.base_sha");
    expect(workflow).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/${DEFAULT_BRANCH}"',
    );
    expect(workflow).toContain("pull_request_inventory_unavailable_after_generation");
    expect(workflow).toContain("open_pull_request_after_generation");
    expect(workflow).toContain("base_branch_advanced");
    expect(revalidationIndex).toBeGreaterThan(-1);
    expect(revalidationIndex).toBeLessThan(pushIndex);
    expect(revalidationIndex).toBeLessThan(createIndex);
  });

  it("treats model-generated pull-request metadata as bounded untrusted input", () => {
    const workflow = workflowText();
    const parser = metadataParserText();

    expect(workflow).toContain('MAX_PR_TITLE_BYTES: "120"');
    expect(workflow).toContain('MAX_PR_BODY_BYTES: "20000"');
    expect(workflow).toContain("prepare-agent-pr-message.mjs");
    expect(workflow).toContain("pr-title.txt");
    expect(workflow).toContain("pr-body.md");
    expect(parser).toContain("lstatSync");
    expect(parser).toContain('TextDecoder("utf-8", { fatal: true })');
    expect(parser).toContain("PR_MESSAGE.md must be a regular non-symlink file");
    expect(parser).toContain("PR title is empty or exceeds the byte budget");
    expect(parser).toContain("PR body exceeds the byte budget");
    expect(parser).toContain("PR metadata contains unsupported control characters");
  });

  it("requires a commercial-quality, modular, test-first Noema increment", () => {
    const workflow = workflowText();

    for (const requiredText of [
      "AGENTS.md",
      "single highest-value buyer-visible",
      "test-first",
      "realistic",
      "100% production statement",
      "100% production function",
      "docstring coverage",
      "APA 7",
      "docs/doctoring",
      "contextual-orchestrator",
      "ContextualWisdomLab/.github",
      "naruon",
      "modular MSA",
      "two-word-or-longer snake_case",
      "CHANGELOG.md",
      "Semantic Versioning",
      "PR_MESSAGE.md",
      "Do not merge",
      "Do not publish",
      "Do not release",
      "Do not deploy",
      "Do not fabricate",
    ]) {
      expect(workflow).toContain(requiredText);
    }
  });

  it("documents operation, security boundaries, and review-loop ownership", () => {
    const operations = readFileSync(
      "docs/operations/hourly-product-development.md",
      "utf8",
    );
    const doctoring = readFileSync(
      "docs/doctoring/hourly-nim-opencode-development.md",
      "utf8",
    );
    const readme = readFileSync("README.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");

    for (const requiredText of [
      "hourly-product-development.yml",
      "NVIDIA_NIM_API_KEY",
      "OpenCode 1.17.13",
      "zero open pull requests",
      "credential",
      "fallback",
      "hourly-commercial-readiness",
    ]) {
      expect(operations).toContain(requiredText);
    }
    expect(doctoring).toContain("APA 7");
    expect(doctoring).toContain("OpenCode");
    expect(doctoring).toContain("NVIDIA NIM");
    expect(doctoring).toContain("GitHub Actions");
    expect(doctoring).toContain("NIST SP 800-218");
    expect(readme).toContain("hourly-product-development");
    expect(changelog).toContain("NVIDIA_NIM_API_KEY");
    expect(changelog).toContain("OpenCode");
  });
});
