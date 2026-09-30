import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function text(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const requiredDocs = [
  "README.md",
  "CHANGELOG.md",
  "docs/api-spec.md",
  "docs/api-stability-contract.md",
  "docs/PRD.md",
  "docs/TRD.md",
  "docs/threat-model.md",
  "docs/runbook.md",
  "docs/product-technical-gap-baseline.md",
] as const;

describe("continuation dispatch publication contracts", () => {
  it("publishes a closed, credential-free OpenAPI operation", () => {
    const document = JSON.parse(text("openapi.json")) as {
      paths?: Record<string, { post?: Record<string, unknown> }>;
      components?: { schemas?: Record<string, unknown> };
    };
    const operation = document.paths?.["/v1/continuation-dispatches"]?.post;
    expect(operation).toMatchObject({
      operationId: "createContinuationDispatch",
      security: [{ githubActionsOidc: [] }],
      "x-request-body-limit-bytes": 8192,
    });
    expect(JSON.stringify(operation)).toContain("noema.continuation-dispatch.v1");
    expect(JSON.stringify(operation)).toContain("ERR_DISPATCH_REPLAY_CONFLICT");
    expect(JSON.stringify(operation)).not.toMatch(/installation[_ -]?token|access[_ -]?token/i);
    expect(document.components?.schemas).toHaveProperty("ContinuationDispatchRequest");
    expect(document.components?.schemas).toHaveProperty("SignedContinuationReceipt");
    expect(document.components?.schemas?.SignedContinuationReceipt).toMatchObject({
      properties: {
        receipt_version: { const: "noema.continuation-dispatch-receipt.v1" },
      },
    });
  });

  it("publishes the endpoint and all six stable dispatch errors across buyer contracts", () => {
    const api = text("docs/api-spec.md");
    const stability = text("docs/api-stability-contract.md");
    for (const code of [
      "ERR_DISPATCH_REQUEST_INVALID",
      "ERR_DISPATCH_IDENTITY_DENIED",
      "ERR_DISPATCH_LIVE_STATE_STALE",
      "ERR_DISPATCH_REPLAY_CONFLICT",
      "ERR_GITHUB_DISPATCH_AUTHORIZATION",
      "ERR_GITHUB_DISPATCH_UPSTREAM",
    ]) {
      expect(api).toContain(code);
      expect(stability).toContain(code);
    }
    for (const path of requiredDocs) {
      expect(text(path), path).toContain("/v1/continuation-dispatches");
    }
  });

  it("documents every required runtime binding without publishing secret values", () => {
    const runbook = text("docs/runbook.md");
    for (const binding of [
      "CONTINUATION_DISPATCH_GITHUB_APP_ID",
      "CONTINUATION_DISPATCH_GITHUB_APP_PRIVATE_KEY_PEM",
      "CONTINUATION_DISPATCH_GITHUB_APP_INSTALLATION_ID",
      "CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM",
      "CONTINUATION_RECEIPT_SIGNING_KEY_ID",
      "NOEMA_CONTINUATION_DISPATCH_STATE",
    ]) {
      expect(runbook).toContain(binding);
    }
    expect(runbook).toContain("secret value");
  });

  it("keeps ADR 0019 Proposed and release-before-consumer order explicit", () => {
    const adr = text("docs/adr/0019-continuation-dispatch-broker.md");
    expect(adr).toMatch(/Status:\s*Proposed/u);
    expect(adr).toContain("ContextualWisdomLab/.github#2540");
    expect(adr).toMatch(/immutable Noema release[\s\S]*ContextualWisdomLab\/.github#2540/u);
    expect(text("docs/adr/README.md")).toContain("0019-continuation-dispatch-broker.md");
  });

  it("states that receipts contain no GitHub credential or bearer", () => {
    const api = text("docs/api-spec.md");
    expect(api).toMatch(/receipt[\s\S]{0,500}(?:no token|no GitHub credential|credential-free)/iu);
    expect(api).toContain("Ed25519");
    expect(api).toContain("RFC 8785");
    expect(api).toMatch(/immutable release[\s\S]{0,300}key_id[\s\S]{0,300}SPKI/iu);
    expect(api).toMatch(/Draft[\s\S]{0,300}offline verification[\s\S]{0,200}(?:not|않)/iu);
  });
});
