import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";

function workflowText(): string {
  return readFileSync(workflowPath, "utf8");
}

function metadataParserText(): string {
  return readFileSync("scripts/prepare-agent-pr-message.mjs", "utf8");
}

function jobSlice(
  workflow: string,
  jobName: string,
  nextJobName?: string,
): string {
  const start = workflow.indexOf(`  ${jobName}:`);
  expect(start).toBeGreaterThan(-1);
  const end = nextJobName === undefined
    ? workflow.length
    : workflow.indexOf(`  ${nextJobName}:`, start + 1);
  if (nextJobName !== undefined) expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("hourly NVIDIA NIM OpenCode product-development workflow", () => {
  it("runs hourly without overlapping deterministic commercial-readiness governance", () => {
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

  it("separates model execution, untrusted verification, and publication authority by job", () => {
    const workflow = workflowText();
    const proposer = jobSlice(
      workflow,
      "propose_product_increment",
      "package_product_increment",
    );
    const verifier = jobSlice(
      workflow,
      "package_product_increment",
      "publish_product_increment",
    );
    const publisher = jobSlice(workflow, "publish_product_increment");

    expect(proposer).toContain(
      "permissions:\n      contents: read\n      pull-requests: read",
    );
    expect(proposer).not.toContain("contents: write");
    expect(proposer).not.toContain("pull-requests: write");
    expect(proposer).not.toContain("actions/create-github-app-token");

    expect(verifier).toContain("needs: propose_product_increment");
    expect(verifier).toContain(
      "permissions:\n      actions: read\n      contents: read\n      pull-requests: read",
    );
    expect(verifier).toContain("Re-run complete release verification");
    expect(verifier).not.toContain("NVIDIA_API_KEY");
    expect(verifier).not.toContain("NOEMA_MAINTAINER_APP_CLIENT_ID");
    expect(verifier).not.toContain("NOEMA_MAINTAINER_APP_PRIVATE_KEY");
    expect(verifier).not.toContain("actions/create-github-app-token");
    expect(verifier).not.toContain("git push origin");
    expect(verifier).not.toContain("gh pr create");

    expect(publisher).toContain("- propose_product_increment");
    expect(publisher).toContain("- package_product_increment");
    expect(publisher).toContain(
      "permissions:\n      actions: read\n      contents: read\n      pull-requests: read",
    );
    expect(publisher).not.toContain("NVIDIA_API_KEY");
    expect(publisher).toContain(
      "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1",
    );
    expect(publisher).toContain(
      "client-id: ${{ vars.NOEMA_MAINTAINER_APP_CLIENT_ID }}",
    );
    expect(publisher).toContain(
      "private-key: ${{ secrets.NOEMA_MAINTAINER_APP_PRIVATE_KEY }}",
    );
    expect(publisher).toContain("permission-contents: write");
    expect(publisher).toContain("permission-pull-requests: write");
    expect(publisher).toContain(
      "GH_TOKEN: ${{ steps.maintainer_app.outputs.token }}",
    );

    const metadataIndex = publisher.indexOf(
      "Parse bounded untrusted pull-request metadata",
    );
    const tokenIndex = publisher.indexOf(
      "Mint dedicated maintainer App token only for publication",
    );
    const revalidationIndex = publisher.indexOf(
      "Revalidate queue and default-branch head",
    );
    expect(metadataIndex).toBeGreaterThan(-1);
    expect(tokenIndex).toBeGreaterThan(metadataIndex);
    expect(tokenIndex).toBeLessThan(revalidationIndex);

    expect(workflow).toContain(
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
    );
    expect(workflow).toContain(
      "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
    );
    expect(workflow).toContain("retention-days: 1");
    expect(workflow).toContain("proposal.patch");
    expect(workflow).toContain("patch_sha256");
    expect(verifier).toContain("sha256sum -c -");
    expect(publisher).toContain("sha256sum -c -");
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

  it("installs checksum-pinned OpenCode and configures NVIDIA NIM only", () => {
    const workflow = workflowText();

    expect(workflow).toContain('OPENCODE_VERSION: "1.17.13"');
    expect(workflow).toContain(
      "157afa289d1a8d9372de0ce19ac726119b937a1f6b201808d46f06e4e59bb348",
    );
    expect(workflow).toContain(
      "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz",
    );
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

  it("keeps GitHub credentials and runner command files out of untrusted subprocesses", () => {
    const workflow = workflowText();

    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("env -u GH_TOKEN -u GITHUB_TOKEN");
    for (const variable of [
      "REPOSITORY_TOKEN",
      "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
      "ACTIONS_ID_TOKEN_REQUEST_URL",
      "ACTIONS_RUNTIME_TOKEN",
      "ACTIONS_RUNTIME_URL",
      "ACTIONS_RESULTS_URL",
      "ACTIONS_CACHE_URL",
      "GITHUB_ENV",
      "GITHUB_OUTPUT",
      "GITHUB_PATH",
      "GITHUB_STATE",
      "GITHUB_STEP_SUMMARY",
    ]) {
      expect(workflow).toContain(`-u ${variable}`);
    }
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

  it("fits every candidate, termination grace, cleanup, and final diagnostic inside the proposal-job budget", () => {
    const workflow = workflowText();
    const proposer = jobSlice(
      workflow,
      "propose_product_increment",
      "package_product_increment",
    );
    const candidateTimeoutMatch = workflow.match(
      /OPENCODE_RUN_TIMEOUT_SECONDS: "(\d+)"/,
    );
    const candidateGraceMatch = workflow.match(
      /OPENCODE_KILL_GRACE_SECONDS: "(\d+)"/,
    );
    const reinstallTimeoutMatch = workflow.match(
      /DEPENDENCY_REINSTALL_TIMEOUT_SECONDS: "(\d+)"/,
    );
    const reinstallGraceMatch = workflow.match(
      /DEPENDENCY_REINSTALL_KILL_GRACE_SECONDS: "(\d+)"/,
    );
    const jobTimeoutMatch = proposer.match(/timeout-minutes: (\d+)/);
    const candidateCount = workflow.match(/^    nvidia-nim\/.+$/gm)?.length ?? 0;

    expect(candidateTimeoutMatch).not.toBeNull();
    expect(candidateGraceMatch).not.toBeNull();
    expect(reinstallTimeoutMatch).not.toBeNull();
    expect(reinstallGraceMatch).not.toBeNull();
    expect(jobTimeoutMatch).not.toBeNull();
    expect(candidateCount).toBe(3);
    const candidateSeconds = Number(candidateTimeoutMatch?.[1]);
    const candidateGraceSeconds = Number(candidateGraceMatch?.[1]);
    const reinstallSeconds = Number(reinstallTimeoutMatch?.[1]);
    const reinstallGraceSeconds = Number(reinstallGraceMatch?.[1]);
    const jobSeconds = Number(jobTimeoutMatch?.[1]) * 60;
    const boundedSetupAndDiagnosticReserve = 300;

    const interCandidateCleanupCount = Math.max(candidateCount - 1, 0);

    expect(interCandidateCleanupCount).toBe(2);
    expect(
      candidateCount * (candidateSeconds + candidateGraceSeconds)
      + interCandidateCleanupCount * (
        reinstallSeconds + reinstallGraceSeconds
      )
      + boundedSetupAndDiagnosticReserve,
    ).toBeLessThanOrEqual(jobSeconds);
    expect(workflow).toContain(
      'timeout --kill-after="${DEPENDENCY_REINSTALL_KILL_GRACE_SECONDS}s" "${DEPENDENCY_REINSTALL_TIMEOUT_SECONDS}s" npm ci --ignore-scripts',
    );
    expect(workflow).toContain(
      "cleanup dependency reinstall failed or timed out",
    );
    expect(workflow).toContain("Every NVIDIA NIM candidate failed");

    const fallbackStart = proposer.indexOf(
      "- name: Run bounded NVIDIA NIM model fallback",
    );
    const fallback = proposer.slice(fallbackStart);
    const candidateListIndex = fallback.indexOf(
      'read -r -a model_candidates <<<"$OPENCODE_MODEL_CANDIDATES"',
    );
    const candidateLoopIndex = fallback.indexOf(
      "for ((candidate_index = 0; candidate_index < candidate_count; candidate_index++)); do",
    );
    const finalCandidateGuardIndex = fallback.indexOf(
      'if [ "$candidate_index" -eq $((candidate_count - 1)) ]; then',
    );
    const resetIndex = fallback.indexOf(
      'git -C "$GITHUB_WORKSPACE" reset --hard HEAD',
    );
    const reinstallIndex = fallback.indexOf(
      'timeout --kill-after="${DEPENDENCY_REINSTALL_KILL_GRACE_SECONDS}s" "${DEPENDENCY_REINSTALL_TIMEOUT_SECONDS}s" npm ci --ignore-scripts',
    );

    expect(fallbackStart).toBeGreaterThan(-1);
    expect(
      candidateListIndex,
      "fallback must materialize indexed model candidates",
    ).toBeGreaterThan(-1);
    expect(candidateLoopIndex).toBeGreaterThan(candidateListIndex);
    expect(finalCandidateGuardIndex).toBeGreaterThan(candidateLoopIndex);
    expect(finalCandidateGuardIndex).toBeLessThan(resetIndex);
    expect(resetIndex).toBeLessThan(reinstallIndex);
  });

  it("cleans failed candidates, verifies twice, and packages at most one bounded pull request", () => {
    const workflow = workflowText();

    expect(workflow).toContain(
      'timeout --kill-after="${OPENCODE_KILL_GRACE_SECONDS}s" "${OPENCODE_RUN_TIMEOUT_SECONDS}s"',
    );
    expect(workflow).toContain(
      'timeout --kill-after="${DEPENDENCY_REINSTALL_KILL_GRACE_SECONDS}s" "${DEPENDENCY_REINSTALL_TIMEOUT_SECONDS}s" npm ci --ignore-scripts',
    );
    expect(workflow).toMatch(/git -C "\$GITHUB_WORKSPACE" reset --hard HEAD/);
    expect(workflow).toMatch(/git -C "\$GITHUB_WORKSPACE" clean -fdx/);
    expect(workflow).toContain('MAX_CHANGED_FILES: "40"');
    expect(workflow).toContain('MAX_DIFF_BYTES: "500000"');
    expect(workflow.match(/npm run release:verify/g)?.length).toBeGreaterThanOrEqual(2);
    expect(workflow).toContain("git diff --cached --check");
    expect(workflow).toContain(
      'branch="nim-agent/product-dev-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
    );
    expect(workflow.match(/gh pr create/g)).toHaveLength(1);
    expect(workflow).toContain('--base "$DEFAULT_BRANCH"');
    expect(workflow).toContain('--head "$branch"');
    expect(workflow).toContain("PR_MESSAGE.md");
    expect(workflow).toContain("git status --porcelain");
    expect(workflow).toContain(
      "Verification mutated tracked or untracked proposal files",
    );
    expect(workflow).toContain(
      "Proposal changed during fresh-runner verification",
    );
    expect(workflow).toContain("core.hooksPath=/dev/null");
    expect(workflow).toContain("cleanup_remote_branch");
    expect(workflow.indexOf("npm run release:verify")).toBeLessThan(
      workflow.indexOf("gh pr create"),
    );
    expect(workflow).not.toMatch(/gh pr merge|gh release create|wrangler deploy/);
  });

  it("revalidates queue and base head before remote proposal mutation", () => {
    const workflow = workflowText();
    const publisher = jobSlice(workflow, "publish_product_increment");
    const revalidationIndex = publisher.indexOf(
      "Revalidate queue and default-branch head",
    );
    const pushIndex = publisher.indexOf("git push origin");
    const createIndex = publisher.indexOf("gh pr create");

    expect(workflow).toContain("id: base");
    expect(workflow).toContain("base_sha=$(git rev-parse HEAD)");
    expect(workflow).toContain(
      "needs.propose_product_increment.outputs.base_sha",
    );
    expect(workflow).toContain(
      '"repos/${GITHUB_REPOSITORY}/git/ref/heads/${DEFAULT_BRANCH}"',
    );
    expect(workflow).toContain(
      "pull_request_inventory_unavailable_after_generation",
    );
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
    expect(parser).toContain(
      "PR_MESSAGE.md must be a regular non-symlink file",
    );
    expect(parser).toContain("PR title is empty or exceeds the byte budget");
    expect(parser).toContain("PR body exceeds the byte budget");
    expect(parser).toContain(
      "PR metadata contains unsupported control characters",
    );
  });

  it("requires a commercial-quality modular test-first Noema increment", () => {
    const workflow = workflowText();

    for (const requiredPattern of [
      /AGENTS\.md/,
      /single highest-value buyer-visible/,
      /test-first/,
      /realistic/,
      /100% production\s+statement/,
      /100% production function/,
      /docstring coverage/,
      /APA 7/,
      /docs\/doctoring/,
      /contextual-orchestrator/,
      /ContextualWisdomLab\/\.github/,
      /naruon/,
      /modular MSA/,
      /two-word-or-longer snake_case/,
      /CHANGELOG\.md/,
      /Semantic Versioning/,
      /PR_MESSAGE\.md/,
      /Do not merge/,
      /Do not publish/,
      /Do not release/,
      /Do not deploy/,
      /Do not fabricate/,
    ]) {
      expect(workflow).toMatch(requiredPattern);
    }
  });

  it("documents Korean operations, security boundaries, and review-loop ownership", () => {
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

    expect(operations.match(/[가-힣]/g)?.length ?? 0).toBeGreaterThan(1000);
    for (const requiredText of [
      "hourly-product-development.yml",
      "NVIDIA_NIM_API_KEY",
      "OpenCode 1.17.13",
      "열린 PR 0개",
      "자격 증명",
      "폴백",
      "hourly-commercial-readiness",
      "proposal.patch",
      "세 번째 새 게시 runner",
      "Maintainer App",
      "후보별 900초",
    ]) {
      expect(operations).toContain(requiredText);
    }
    expect(doctoring).toContain("APA 7");
    expect(doctoring).toContain("OpenCode");
    expect(doctoring).toContain("NVIDIA NIM");
    expect(doctoring).toContain("GitHub Actions");
    expect(doctoring).toContain("NIST SP 800-218");
    expect(doctoring).toContain("write-capable runner");
    expect(doctoring).toContain("Maintainer App");
    expect(doctoring).toContain("900 seconds");
    expect(readme).toContain("hourly-product-development");
    expect(changelog).toContain("NVIDIA_NIM_API_KEY");
    expect(changelog).toContain("OpenCode");
  });
});
