import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDeploymentEvidence,
  normalizeDeployments,
  parseWranglerOutput,
} from "../scripts/deployment-evidence.mjs";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);
const oldVersionId = "v1-old123";
const newVersionId = "v1-abc123";

function validInput() {
  return {
    identity: {
      repository,
      releaseTag: "v0.1.0",
      commitSha,
      environment: "production",
      workflowRunUrl: `${repository}/actions/runs/123`,
      generatedAt: "2026-08-04T00:00:00.000Z",
    },
    releaseView: {
      isImmutable: true,
      tagName: "v0.1.0",
      url: `https://github.com/${repository}/releases/tag/v0.1.0`,
    },
    releaseEvidence: {
      schemaVersion: 1,
      source: {
        repository,
        commitSha,
        ref: "refs/tags/v0.1.0",
        version: "0.1.0",
      },
    },
    wranglerOutput: [
      {
        type: "wrangler-session",
        version: 1,
        timestamp: "2026-08-03T23:59:58.000Z",
      },
      {
        type: "deploy",
        version: 1,
        worker_name: "noema",
        version_id: newVersionId,
        targets: ["https://noema.example.workers.dev"],
        wrangler_environment: "production",
        timestamp: "2026-08-04T00:00:01.000Z",
      },
    ],
    beforeDeployments: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        created_on: "2026-08-03T20:00:00.000Z",
        versions: [{ version_id: oldVersionId, percentage: 100 }],
      },
    ],
    afterDeployments: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        created_on: "2026-08-04T00:00:02.000Z",
        versions: [{ version_id: newVersionId, percentage: 100 }],
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        created_on: "2026-08-03T20:00:00.000Z",
        versions: [{ version_id: oldVersionId, percentage: 100 }],
      },
    ],
    smokeEvidence: {
      passed: true,
      timestamp: "2026-08-04T00:00:04Z",
      noema_exchange_url: "https://noema.example.workers.dev/exchange",
      checks: [{ name: "health-status", status: "PASS", message: "ok" }],
    },
    kpiEvidence: {
      status: "PASS",
      strict: true,
      requireWindowDays: 30,
      executedAt: "2026-08-03T23:59:50.000Z",
      steps: [],
    },
    digests: {
      releaseEvidenceSha256: "1".repeat(64),
      smokeEvidenceSha256: "2".repeat(64),
      kpiEvidenceSha256: "3".repeat(64),
    },
  };
}

describe("deployment evidence", () => {
  it("parses Wrangler structured NDJSON and rejects command failures", () => {
    const parsed = parseWranglerOutput([
      JSON.stringify({ type: "wrangler-session", timestamp: "2026-08-04T00:00:00Z" }),
      JSON.stringify({
        type: "deploy",
        worker_name: "noema",
        version_id: newVersionId,
        targets: ["https://noema.example.workers.dev"],
        timestamp: "2026-08-04T00:00:01Z",
      }),
    ].join("\n"));

    expect(parsed.at(-1)?.type).toBe("deploy");
    expect(() => parseWranglerOutput(JSON.stringify({ type: "command-failed", message: "denied" })))
      .toThrow("Wrangler reported command-failed");
  });

  it("rejects duplicate decoded Wrangler JSON keys before deployment classification", () => {
    const ambiguousRecord = [
      '{"type":"command-failed","t\\u0079pe":"deploy","message":"denied",',
      `"worker_name":"noema","version_id":"${newVersionId}",`,
      '"targets":["https://noema.example.workers.dev"],"timestamp":"2026-08-04T00:00:01Z"}',
    ].join("");

    expect(() => parseWranglerOutput(ambiguousRecord))
      .toThrow("duplicate decoded JSON key");
  });

  it("normalizes documented deployment response shapes", () => {
    const deployments = validInput().afterDeployments;
    expect(normalizeDeployments(deployments)).toEqual(deployments);
    expect(normalizeDeployments({ deployments })).toEqual(deployments);
    expect(normalizeDeployments({ result: deployments })).toEqual(deployments);
  });

  it("builds a release-bound production receipt with deterministic rollback identity", () => {
    const evidence = buildDeploymentEvidence(validInput());

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      source: {
        repository,
        releaseTag: "v0.1.0",
        commitSha,
        version: "0.1.0",
      },
      deployment: {
        environment: "production",
        workerName: "noema",
        workerVersionId: newVersionId,
        deploymentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        trafficPercentage: 100,
      },
      rollback: {
        previousDeploymentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        previousWorkerVersionId: oldVersionId,
      },
      validation: {
        immutableRelease: true,
        strictKpi: true,
        smokePassed: true,
      },
    });
  });

  it.each([
    ["mutable release", (input: ReturnType<typeof validInput>) => { input.releaseView.isImmutable = false; }, "immutable"],
    ["moved release tag", (input: ReturnType<typeof validInput>) => { input.releaseEvidence.source.commitSha = "b".repeat(40); }, "commit SHA"],
    ["uppercase deployment commit SHA", (input: ReturnType<typeof validInput>) => {
      const uppercaseSha = input.identity.commitSha.toUpperCase();
      input.identity.commitSha = uppercaseSha;
      input.releaseEvidence.source.commitSha = uppercaseSha;
    }, "lowercase"],
    ["failed KPI", (input: ReturnType<typeof validInput>) => { input.kpiEvidence.status = "FAIL"; }, "KPI evidence"],
    ["failed smoke", (input: ReturnType<typeof validInput>) => { input.smokeEvidence.passed = false; }, "smoke evidence"],
    ["traffic split", (input: ReturnType<typeof validInput>) => { input.afterDeployments[0].versions[0].percentage = 50; }, "100%"],
    ["wrong active version", (input: ReturnType<typeof validInput>) => { input.afterDeployments[0].versions[0].version_id = oldVersionId; }, "active deployment"],
    ["unsafe Worker version ID", (input: ReturnType<typeof validInput>) => { input.wranglerOutput[1].version_id = "bad version/id"; }, "bounded opaque identifier"],
  ])("fails closed for %s", (_label, mutate, message) => {
    const input = validInput();
    mutate(input);
    expect(() => buildDeploymentEvidence(input)).toThrow(message);
  });

  it("enforces exact-tag production deployment and signed 365-day evidence in CD", () => {
    const workflow = readFileSync(".github/workflows/cd.yml", "utf8");

    expect(workflow).toContain("repository_dispatch:");
    expect(workflow).toContain("types: [noema-production-deploy]");
    expect(workflow).toContain("github.event.client_payload.release_tag");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).not.toContain("- staging");
    expect(workflow).toContain("ref: ${{ steps.release.outputs.tag }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("gh release view");
    expect(workflow).toContain("isImmutable");
    expect(workflow).toContain("release-evidence.json");
    expect(workflow).toContain("WRANGLER_OUTPUT_FILE_PATH");
    expect(workflow).toContain("wrangler deployments status --json");
    expect(workflow).toContain("node scripts/deployment-evidence.mjs");
    expect(workflow).toContain("actions/attest@59d89421af93a897026c735860bf21b6eb4f7b26");
    expect(workflow).toContain("https://contextualwisdomlab.org/attestations/noema-deployment/v1");
    expect(workflow).toContain("gh attestation verify");
    expect(workflow).toContain("retention-days: 365");
    expect(workflow).not.toContain("run: wrangler deploy\n");
  });
});
