import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  readJobSlice,
  readSingleOrchestratorRunStep,
  readSingleRunBudget,
} from "./helpers/hourly-workflow";

const workflowPath = ".github/workflows/hourly-product-development.yml";

function workflowText(): string {
  return readFileSync(workflowPath, "utf8");
}

function metadataParserText(): string {
  return readFileSync("scripts/prepare-agent-pr-message.mjs", "utf8");
}

describe("hourly contextual-orchestrator OpenCode product-development workflow", () => {
  it("runs hourly without overlapping deterministic commercial-readiness governance", () => {
    const workflow = workflowText();

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("dry_run:");
    expect(workflow).toContain('cron: "47 * * * *"');
    expect(workflow).toContain(
      "group: hourly-orchestrator-product-development-${{ github.repository }}",
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
    const proposer = readJobSlice(
      workflow,
      "propose_product_increment",
      "package_product_increment",
    );
    const verifier = readJobSlice(
      workflow,
      "package_product_increment",
      "publish_product_increment",
    );
    const publisher = readJobSlice(workflow, "publish_product_increment");

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
    expect(verifier).not.toContain("NOEMA_LLM_API_KEY");
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
    expect(publisher).not.toContain("NOEMA_LLM_API_KEY");
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

  it("fails closed before model execution when PR inventory or the orchestrator gateway is unavailable", () => {
    const workflow = workflowText();

    expect(workflow).toContain("gh pr list");
    expect(workflow).toContain("--state open");
    expect(workflow).toContain("--limit 1");
    expect(workflow).toContain("pull_request_inventory_unavailable");
    expect(workflow).toContain("open_pull_request");
    expect(workflow).toContain("orchestrator_gateway_unavailable");
    expect(workflow).toContain(
      "ORCHESTRATOR_KEY_CONFIGURED: ${{ secrets.NOEMA_LLM_API_KEY != '' }}",
    );
    expect(workflow).toContain(
      "ORCHESTRATOR_URL_CONFIGURED: ${{ vars.NOEMA_LLM_API_URL != '' }}",
    );
    expect(workflow).toContain("dispatch=false");
    expect(workflow).toContain("dispatch=true");
    expect(workflow).not.toContain("nim_api_key_unavailable");
    expect(workflow).not.toContain("NVIDIA_NIM_API_KEY");
  });

  it("uses the same dedicated orchestrator gateway contract as review", () => {
    const workflow = workflowText();
    const review = readFileSync(".github/workflows/central-review.yml", "utf8");

    expect(workflow).toContain(
      "NOEMA_LLM_API_KEY: ${{ secrets.NOEMA_LLM_API_KEY }}",
    );
    expect(workflow).toContain(
      "NOEMA_LLM_API_URL: ${{ vars.NOEMA_LLM_API_URL }}",
    );
    expect(workflow).toContain(
      "NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}",
    );
    expect(workflow).toContain("node scripts/verify-orchestrator-gateway.mjs");
    expect(review).toContain("node scripts/verify-orchestrator-gateway.mjs");
    expect(workflow).not.toContain("secrets.NVIDIA_API_KEY");
    expect(workflow).not.toContain("NVIDIA_API_KEY");
    expect(workflow).not.toContain("OPENAI_API_KEY");
    expect(workflow).not.toContain("OPENROUTER_API_KEY");
    expect(workflow).not.toContain("BYTEZ_API_KEY");
    expect(workflow).not.toContain("NOEMA_FALLBACK");
    expect(workflow).not.toContain("NOEMA_GITHUB_APP_PRIVATE_KEY");
    expect(workflow.toLowerCase()).not.toContain("copilot");
    expect(workflow).not.toContain("id-token: write");
  });

  it("installs checksum-pinned OpenCode and configures the orchestrator gateway only", () => {
    const workflow = workflowText();

    expect(workflow).toContain('OPENCODE_VERSION: "1.17.13"');
    expect(workflow).toContain(
      "157afa289d1a8d9372de0ce19ac726119b937a1f6b201808d46f06e4e59bb348",
    );
    expect(workflow).toContain(
      "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz",
    );
    expect(workflow).toContain("--write-opencode-config");
    expect(workflow).not.toContain('"enabled_providers": ["nvidia-nim"]');
    expect(workflow).not.toContain("https://integrate.api.nvidia.com/v1");
    expect(workflow).not.toContain("nvidia-nim/");
    expect(workflow).not.toContain("OPENCODE_MODEL_CANDIDATES");
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
    expect(readFileSync("scripts/lib/orchestrator-gateway.mjs", "utf8"))
      .toContain('bash: "deny"');
    expect(workflow).not.toContain('"bash": {');
  });

  it("fits one gateway-backed session, termination grace, and diagnostics inside the proposal-job budget", () => {
    const workflow = workflowText();
    const budget = readSingleRunBudget(workflow);
    const runStep = readSingleOrchestratorRunStep(workflow);

    expect(budget.totalSeconds).toBeLessThanOrEqual(budget.jobSeconds);
    expect(workflow).toContain(
      'timeout --kill-after="${OPENCODE_KILL_GRACE_SECONDS}s" "${OPENCODE_RUN_TIMEOUT_SECONDS}s"',
    );
    expect(runStep).toContain("opencode run \"$prompt\" --agent build");
    expect(runStep).not.toContain("OPENCODE_MODEL_CANDIDATES");
    expect(runStep).not.toContain("model_candidates");
    expect(runStep).not.toContain("candidate_index");
    expect(runStep).not.toContain("git reset --hard HEAD");
    expect(runStep).not.toContain("npm ci --ignore-scripts");
    expect(workflow).not.toContain("Every NVIDIA NIM candidate failed");
    expect(workflow).not.toContain("Run bounded NVIDIA NIM model fallback");
  });

  it("verifies twice and packages at most one bounded pull request", () => {
    const workflow = workflowText();
    const pullRequestCreate =
      'gh api --method POST "repos/${GITHUB_REPOSITORY}/pulls" --input "$pr_request_file"';

    expect(workflow).toContain('MAX_CHANGED_FILES: "40"');
    expect(workflow).toContain('MAX_DIFF_BYTES: "500000"');
    expect(workflow.match(/npm run release:verify/g)?.length).toBeGreaterThanOrEqual(1);
    expect(workflow).toContain("git diff --cached --check");
    expect(workflow).toContain(
      'branch="orchestrator-agent/product-dev-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
    );
    expect(workflow.match(/gh api --method POST "repos\/\$\{GITHUB_REPOSITORY\}\/pulls"/g)).toHaveLength(1);
    expect(workflow).toContain('--arg base "$DEFAULT_BRANCH"');
    expect(workflow).toContain('--arg head "$branch"');
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
      workflow.indexOf(pullRequestCreate),
    );
    expect(workflow).not.toMatch(/gh pr merge|gh release create|wrangler deploy/);
  });

  it("revalidates queue and base head before remote proposal mutation", () => {
    const workflow = workflowText();
    const publisher = readJobSlice(workflow, "publish_product_increment");
    const revalidationIndex = publisher.indexOf(
      "Revalidate queue and default-branch head",
    );
    const pushIndex = publisher.indexOf(
      'git push --force-with-lease="refs/heads/${branch}:" origin "HEAD:refs/heads/${branch}"',
    );
    const createIndex = publisher.indexOf(
      'gh api --method POST "repos/${GITHUB_REPOSITORY}/pulls" --input "$pr_request_file"',
    );

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
    expect(workflow).toContain("proposal_branch_create_lease_rejected");
    expect(revalidationIndex).toBeGreaterThan(-1);
    expect(pushIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(-1);
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
      "NOEMA_LLM_API_KEY",
      "contextual-orchestrator",
      "OpenCode 1.17.13",
      "열린 PR 0개",
      "자격 증명",
      "hourly-commercial-readiness",
      "proposal.patch",
      "세 번째 새 게시 runner",
      "Maintainer App",
    ]) {
      expect(operations).toContain(requiredText);
    }
    expect(operations).not.toContain("후보별 900초");
    expect(operations).toContain("오케스트레이터 KV");
    expect(workflowText()).not.toContain("NVIDIA_NIM_API_KEY");
    expect(doctoring).toContain("APA 7");
    expect(doctoring).toContain("OpenCode");
    expect(doctoring).toContain("contextual-orchestrator");
    expect(doctoring).toContain("GitHub Actions");
    expect(doctoring).toContain("NIST SP 800-218");
    expect(doctoring).toContain("write-capable runner");
    expect(doctoring).toContain("Maintainer App");
    expect(doctoring).not.toContain("900 seconds");
    expect(readme).toContain("hourly-product-development");
    expect(changelog).toContain("contextual-orchestrator");
    expect(changelog).toContain("OpenCode");
  });
});
