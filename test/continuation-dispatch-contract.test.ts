import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalContinuationIdentity,
  canonicalContinuationRequest,
  continuationDispatchIdentity,
  continuationRequestDigest,
  dispatchMapping,
  parseContinuationDispatchRequest,
  type ContinuationDispatchRequest,
} from "../src/continuation-dispatch/contract";

const validRequest = {
  contract_version: "noema.continuation-dispatch.v1",
  dispatch_action: "noema_review_continuation",
  central_repository: "ContextualWisdomLab/.github",
  source_repository: "ContextualWisdomLab/example-product",
  pull_request_number: 42,
  expected_head_sha: "a".repeat(40),
  expected_base_sha: "b".repeat(40),
  expected_base_ref: "main",
  transport_retry_attempt: 1,
} as const;

const workflowIdentity = { workflow_sha: "c".repeat(40) } as const;

function parseValue(value: unknown): ContinuationDispatchRequest {
  return parseContinuationDispatchRequest(JSON.stringify(value));
}

describe("continuation dispatch request contract", () => {
  it("accepts exactly the released closed request", () => {
    const parsed = parseValue(validRequest);

    expect(parsed).toEqual(validRequest);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("accepts JSON grammar whitespace between a decoded member name and its colon", () => {
    const raw = JSON.stringify(validRequest).replace('"contract_version":', '"contract_version" \n :');

    expect(parseContinuationDispatchRequest(raw)).toEqual(validRequest);
  });

  it("accepts both released actions and the inherited second continuation attempt", () => {
    const parsed = parseValue({
      ...validRequest,
      dispatch_action: "strix_scan_continuation",
      transport_retry_attempt: 2,
    });

    expect(parsed.dispatch_action).toBe("strix_scan_continuation");
    expect(parsed.transport_retry_attempt).toBe(2);
  });

  it.each([
    ["unknown member", { ...validRequest, event_type: "noema-review" }],
    ["unknown nested member", { ...validRequest, arbitrary: { nested: "member" } }],
    ["array root", [validRequest]],
    ["null root", null],
    ["string root", "request"],
  ])("rejects %s", (_label, value) => {
    expect(() => parseValue(value)).toThrow(/continuation dispatch request/i);
  });

  it.each([
    ["direct duplicate", `{"contract_version":"ignored","contract_version":"${validRequest.contract_version}","dispatch_action":"${validRequest.dispatch_action}","central_repository":"${validRequest.central_repository}","source_repository":"${validRequest.source_repository}","pull_request_number":42,"expected_head_sha":"${validRequest.expected_head_sha}","expected_base_sha":"${validRequest.expected_base_sha}","expected_base_ref":"main","transport_retry_attempt":1}`],
    ["escape-equivalent duplicate", `{"contract_version":"${validRequest.contract_version}","dispatch_action":"ignored","dispatch_acti\\u006fn":"${validRequest.dispatch_action}","central_repository":"${validRequest.central_repository}","source_repository":"${validRequest.source_repository}","pull_request_number":42,"expected_head_sha":"${validRequest.expected_head_sha}","expected_base_sha":"${validRequest.expected_base_sha}","expected_base_ref":"main","transport_retry_attempt":1}`],
  ])("rejects %s decoded keys before last-key-wins parsing", (_label, raw) => {
    expect(() => parseContinuationDispatchRequest(raw)).toThrow(/duplicate/i);
  });

  it.each([
    ["contract version", { ...validRequest, contract_version: 1 }],
    ["action", { ...validRequest, dispatch_action: [validRequest.dispatch_action] }],
    ["central repository", { ...validRequest, central_repository: null }],
    ["source repository", { ...validRequest, source_repository: {} }],
    ["pull request number", { ...validRequest, pull_request_number: "42" }],
    ["head SHA", { ...validRequest, expected_head_sha: true }],
    ["base SHA", { ...validRequest, expected_base_sha: [] }],
    ["base ref", { ...validRequest, expected_base_ref: 7 }],
    ["retry attempt", { ...validRequest, transport_retry_attempt: "1" }],
  ])("rejects typed lookalike for %s", (_label, value) => {
    expect(() => parseValue(value)).toThrow(/continuation dispatch request/i);
  });

  it.each([
    " ContextualWisdomLab/example-product",
    "ContextualWisdomLab/example-product ",
    "OtherOrganization/example-product",
    "ContextualWisdomLab",
    "ContextualWisdomLab/",
    "ContextualWisdomLab/.",
    "ContextualWisdomLab/..",
    "ContextualWisdomLab/first/second",
    "ContextualWisdomLab/example product",
  ])("rejects non-canonical source repository %j", (source_repository) => {
    expect(() => parseValue({ ...validRequest, source_repository })).toThrow(/source_repository/i);
  });

  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects non-positive-safe pull request number %j", (pull_request_number) => {
    expect(() => parseValue({ ...validRequest, pull_request_number })).toThrow(/pull_request_number/i);
  });

  it.each([
    "A".repeat(40),
    "a".repeat(39),
    "g".repeat(40),
  ])("rejects non-canonical head SHA %j", (expected_head_sha) => {
    expect(() => parseValue({ ...validRequest, expected_head_sha })).toThrow(/expected_head_sha/i);
  });

  it.each([
    "B".repeat(40),
    "b".repeat(39),
    "z".repeat(40),
  ])("rejects non-canonical base SHA %j", (expected_base_sha) => {
    expect(() => parseValue({ ...validRequest, expected_base_sha })).toThrow(/expected_base_sha/i);
  });

  it.each([
    "",
    "@",
    "/main",
    " main",
    "main ",
    "main.",
    "feature..branch",
    "feature.lock",
    "feature@{branch",
    "feature//branch",
    "feature\\branch",
    "feature~branch",
    "feature^branch",
    "feature:branch",
    "feature?branch",
    "feature*branch",
    "feature[branch",
    "-main",
    ".hidden",
    "feature/\ud800",
    "feature/\udc00",
    "feature/",
  ])("rejects base ref outside git check-ref-format --branch %j", (expected_base_ref) => {
    expect(() => parseValue({ ...validRequest, expected_base_ref })).toThrow(/expected_base_ref/i);
  });

  it("accepts a canonical slash-delimited base ref", () => {
    expect(parseValue({ ...validRequest, expected_base_ref: "release/next" }).expected_base_ref)
      .toBe("release/next");
    expect(parseValue({ ...validRequest, expected_base_ref: "release/🚀" }).expected_base_ref)
      .toBe("release/🚀");
  });

  it("rejects every non-canonical target", () => {
    for (const central_repository of [
      "ContextualWisdomLab/contextual-orchestrator",
      " ContextualWisdomLab/.github",
      "ContextualWisdomLab/.github ",
    ]) {
      expect(() => parseValue({ ...validRequest, central_repository })).toThrow(/central_repository/i);
    }
  });

  it("rejects arbitrary actions", () => {
    expect(() => parseValue({ ...validRequest, dispatch_action: "repository_dispatch" }))
      .toThrow(/dispatch_action/i);
  });

  it.each([0, 3, 1.5, true, null])("rejects retry attempt %j", (transport_retry_attempt) => {
    expect(() => parseValue({ ...validRequest, transport_retry_attempt })).toThrow(/transport_retry_attempt/i);
  });

  it.each([
    "",
    "{} {}",
    `${JSON.stringify(validRequest)} null`,
    "{",
  ])("rejects malformed or additional JSON values %j", (raw) => {
    expect(() => parseContinuationDispatchRequest(raw)).toThrow(/continuation dispatch request/i);
  });

  it("rejects a non-string runtime argument before JSON parsing", () => {
    const parseRuntimeValue = parseContinuationDispatchRequest as (value: unknown) => ContinuationDispatchRequest;

    expect(() => parseRuntimeValue(null)).toThrow(/JSON text/i);
  });
});

describe("continuation dispatch canonical identity", () => {
  it("maps only released actions to fixed event types", () => {
    expect(dispatchMapping("noema_review_continuation")).toEqual({ eventType: "noema-review" });
    expect(dispatchMapping("strix_scan_continuation")).toEqual({ eventType: "strix-scan" });
    expect(() => dispatchMapping("arbitrary" as never)).toThrow(/dispatch action/i);
  });

  it("serializes the named identity in RFC 8785 lexicographic key order", () => {
    const canonical = canonicalContinuationRequest(parseValue(validRequest), workflowIdentity);

    expect(canonical).toBe(
      `{"central_repository":"ContextualWisdomLab/.github","contract_version":"noema.continuation-dispatch.v1","dispatch_action":"noema_review_continuation","expected_base_ref":"main","expected_base_sha":"${"b".repeat(40)}","expected_head_sha":"${"a".repeat(40)}","pull_request_number":42,"source_repository":"ContextualWisdomLab/example-product","transport_retry_attempt":1,"workflow_sha":"${"c".repeat(40)}"}`,
    );
  });

  it("produces the exact lowercase SHA-256 digest of the canonical bytes", async () => {
    const request = parseValue(validRequest);
    const canonical = canonicalContinuationRequest(request, workflowIdentity);
    const expected = createHash("sha256").update(canonical, "utf8").digest("hex");

    await expect(continuationRequestDigest(request, workflowIdentity)).resolves.toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("serializes retry attempts through one logical identity while retaining distinct request digests", async () => {
    const first = parseValue(validRequest);
    const second = parseValue({ ...validRequest, transport_retry_attempt: 2 });
    const canonicalIdentity = canonicalContinuationIdentity(first, workflowIdentity);

    expect(canonicalIdentity).not.toContain("transport_retry_attempt");
    await expect(continuationDispatchIdentity(first, workflowIdentity)).resolves.toBe(
      await continuationDispatchIdentity(second, workflowIdentity),
    );
    await expect(continuationRequestDigest(first, workflowIdentity)).resolves.not.toBe(
      await continuationRequestDigest(second, workflowIdentity),
    );
  });

  it("fails closed when runtime workflow identity is not a lowercase full commit SHA", async () => {
    const request = parseValue(validRequest);

    expect(() => canonicalContinuationRequest(request, { workflow_sha: "C".repeat(40) }))
      .toThrow(/workflow_sha/i);
    await expect(continuationRequestDigest(request, { workflow_sha: "c".repeat(39) }))
      .rejects.toThrow(/workflow_sha/i);
  });

  it("rejects non-object and open workflow identities", () => {
    const request = parseValue(validRequest);
    const canonicalRuntimeIdentity = canonicalContinuationRequest as (
      candidateRequest: ContinuationDispatchRequest,
      candidateIdentity: unknown,
    ) => string;

    expect(() => canonicalRuntimeIdentity(request, null)).toThrow(/workflow_sha/i);
    expect(() => canonicalRuntimeIdentity(request, {
      workflow_sha: workflowIdentity.workflow_sha,
      mutable_ref: "main",
    })).toThrow(/workflow_sha/i);
  });
});
