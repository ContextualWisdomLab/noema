import { test, vi } from "vitest";
import assert from "node:assert/strict";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import { assessProceduralCandidate } from "../src/agent-runtime/procedural-evolution.ts";
import {
  admitProceduralEvaluationEvidence,
  proceduralEvaluationEvidenceDigest,
} from "../src/agent-runtime/procedural-evaluation-authority.ts";
import {
  assertAuthenticatedProceduralEvaluationEvidence,
  verifyProceduralEvaluationHandoff,
} from "../src/agent-runtime/procedural-evaluation-handoff.ts";

const digest = (character) => character.repeat(64);

async function evaluationEvidence() {
  const baseline = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-a",
    taskType: "repair",
    graphId: "graph-a",
    revision: 1,
    parentDigest: null,
    nodes: ["Start", "check"],
    edges: [{
      from: "Start",
      relation: "requires",
      to: "check",
      condition: "",
      guidance: "Check evidence",
      pitfalls: "",
    }],
  });
  const candidate = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-a",
    taskType: "repair",
    graphId: "graph-a",
    revision: 2,
    parentDigest: baseline.digest,
    nodes: ["Start", "check"],
    edges: [{
      from: "Start",
      relation: "requires",
      to: "check",
      condition: "",
      guidance: "Check exact-head evidence",
      pitfalls: "",
    }],
  });
  const contextDigest = digest("c");
  const decision = await assessProceduralCandidate({
    baseline,
    candidate,
    plan: {
      contextDigest,
      minimumCases: 2,
      trainingCaseIds: ["train-1"],
      holdoutCaseIds: ["case-1", "case-2"],
    },
    baselineReceipt: {
      graphDigest: baseline.digest,
      contextDigest,
      observations: [
        { caseId: "case-1", score: 0.5, safetyViolations: 0 },
        { caseId: "case-2", score: 0.6, safetyViolations: 0 },
      ],
    },
    candidateReceipt: {
      graphDigest: candidate.digest,
      contextDigest,
      observations: [
        { caseId: "case-1", score: 0.7, safetyViolations: 0 },
        { caseId: "case-2", score: 0.8, safetyViolations: 0 },
      ],
    },
    rejectedKeys: [],
  });
  const metadata = {
    schemaVersion: "noema.procedural-evaluation-authority/v1",
    evaluatorId: "evaluation-owner",
    evaluatorVersion: "eval-v1",
    policyVersion: "policy-v1",
    datasetDigest: digest("1"),
    rubricDigest: digest("2"),
    modelIdentityDigest: digest("3"),
    toolIdentityDigest: digest("4"),
    protocolDigest: digest("5"),
    validationPlanDigest: digest("6"),
  };
  const expected = await proceduralEvaluationEvidenceDigest(decision, metadata);
  return admitProceduralEvaluationEvidence(decision, metadata, expected);
}

async function keyPair() {
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
}

function canonicalMessage(envelopeDigest, signerKeyId, issuedAtEpochSeconds, expiresAtEpochSeconds) {
  return new TextEncoder().encode(JSON.stringify([
    "noema.procedural-evaluation-handoff/v1",
    envelopeDigest,
    signerKeyId,
    issuedAtEpochSeconds,
    expiresAtEpochSeconds,
  ]));
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function signedHandoff(evidence, signerKeyId, privateKey, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const issuedAtEpochSeconds = overrides.issuedAtEpochSeconds ?? now - 1;
  const expiresAtEpochSeconds = overrides.expiresAtEpochSeconds ?? now + 120;
  const envelopeDigest = overrides.envelopeDigest ?? evidence.envelopeDigest;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    canonicalMessage(envelopeDigest, signerKeyId, issuedAtEpochSeconds, expiresAtEpochSeconds),
  );
  return {
    schemaVersion: "noema.procedural-evaluation-handoff/v1",
    envelopeDigest,
    signerKeyId,
    issuedAtEpochSeconds,
    expiresAtEpochSeconds,
    signature: base64Url(new Uint8Array(signature)),
  };
}

test("accepts only a signature from the separately trusted evaluator key", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const handoff = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey);

  const authenticated = await verifyProceduralEvaluationHandoff(evidence, handoff, {
    signerKeyId: "keyverse:evaluator/procedural-v1",
    verificationKey: keys.publicKey,
  });

  assert.equal(authenticated.evidence, evidence);
  assert.equal(authenticated.signerKeyId, "keyverse:evaluator/procedural-v1");
  assert.match(authenticated.handoffDigest, /^[0-9a-f]{64}$/);
  assert.equal(authenticated.activationAuthorized, false);
  assert.doesNotThrow(() => assertAuthenticatedProceduralEvaluationEvidence(authenticated));
});

test("a locally recomputed envelope digest cannot substitute for the trusted signer", async () => {
  const evidence = await evaluationEvidence();
  const trusted = await keyPair();
  const untrusted = await keyPair();
  const handoff = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", untrusted.privateKey);

  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, handoff, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: trusted.publicKey,
    }),
    /evaluation_handoff_signature_invalid/,
  );
});

test("rejects a signer identity that does not match the trusted Keyverse-selected key id", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const handoff = await signedHandoff(evidence, "keyverse:evaluator/other", keys.privateKey);

  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, handoff, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: keys.publicKey,
    }),
    /evaluation_handoff_signer_mismatch/,
  );
});

test("rejects a valid signature if it binds another evaluation envelope", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const handoff = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey, {
    envelopeDigest: digest("f"),
  });

  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, handoff, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: keys.publicKey,
    }),
    /evaluation_handoff_envelope_mismatch/,
  );
});

test("rejects expired or excessively future-dated handoffs", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const now = Math.floor(Date.now() / 1000);
  const expired = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey, {
    issuedAtEpochSeconds: now - 120,
    expiresAtEpochSeconds: now - 1,
  });
  const future = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey, {
    issuedAtEpochSeconds: now + 120,
    expiresAtEpochSeconds: now + 240,
  });

  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, expired, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: keys.publicKey,
    }),
    /evaluation_handoff_expired/,
  );
  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, future, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: keys.publicKey,
    }),
    /evaluation_handoff_time_invalid/,
  );
});

test("rejects reversed and overlong handoff validity intervals", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const now = Math.floor(Date.now() / 1000);
  const reversed = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey, {
    issuedAtEpochSeconds: now + 10,
    expiresAtEpochSeconds: now + 5,
  });
  const overlong = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey, {
    issuedAtEpochSeconds: now - 1,
    expiresAtEpochSeconds: now + 300,
  });

  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, reversed, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: keys.publicKey,
    }),
    /evaluation_handoff_time_invalid/,
  );
  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, overlong, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: keys.publicKey,
    }),
    /evaluation_handoff_time_invalid/,
  );
});

test("rejects unsupported schema and malformed signature shapes before verification", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const handoff = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey);
  const trust = { signerKeyId: "keyverse:evaluator/procedural-v1", verificationKey: keys.publicKey };

  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, { ...handoff, schemaVersion: "noema.procedural-evaluation-handoff/v2" }, trust),
    /unsupported_schema/,
  );
  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, { ...handoff, signature: 7 }, trust),
    /evaluation_handoff_signature_invalid/,
  );
  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, { ...handoff, signature: "short" }, trust),
    /evaluation_handoff_signature_invalid/,
  );
  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, { ...handoff, signature: "!".repeat(86) }, trust),
    /evaluation_handoff_signature_invalid/,
  );
});

test("fails closed when decoded signature bytes or base64 decoding are invalid", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const handoff = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey);
  const trust = { signerKeyId: "keyverse:evaluator/procedural-v1", verificationKey: keys.publicKey };

  const shortDecode = vi.spyOn(globalThis, "atob").mockReturnValue("x");
  try {
    await assert.rejects(
      verifyProceduralEvaluationHandoff(evidence, { ...handoff, signature: "A".repeat(86) }, trust),
      /evaluation_handoff_signature_invalid/,
    );
  } finally {
    shortDecode.mockRestore();
  }

  const throwingDecode = vi.spyOn(globalThis, "atob").mockImplementation(() => { throw new Error("decode failed"); });
  try {
    await assert.rejects(
      verifyProceduralEvaluationHandoff(evidence, { ...handoff, signature: "A".repeat(86) }, trust),
      /evaluation_handoff_signature_invalid/,
    );
  } finally {
    throwingDecode.mockRestore();
  }
});

test("rejects invalid trust key shapes and verification-key algorithm failures", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const handoff = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey);

  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, handoff, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: null,
    }),
    /evaluation_handoff_signature_invalid/,
  );
  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, handoff, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: "not-a-key",
    }),
    /evaluation_handoff_signature_invalid/,
  );
  await assert.rejects(
    verifyProceduralEvaluationHandoff(evidence, handoff, {
      signerKeyId: "keyverse:evaluator/procedural-v1",
      verificationKey: {},
    }),
    /evaluation_handoff_signature_invalid/,
  );
});

test("structural copies of authenticated handoff evidence do not retain process-local authority", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const handoff = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey);
  const authenticated = await verifyProceduralEvaluationHandoff(evidence, handoff, {
    signerKeyId: "keyverse:evaluator/procedural-v1",
    verificationKey: keys.publicKey,
  });

  assert.throws(
    () => assertAuthenticatedProceduralEvaluationEvidence({ ...authenticated }),
    /unadmitted_authenticated_evaluation/,
  );
  assert.throws(
    () => assertAuthenticatedProceduralEvaluationEvidence(null),
    /unadmitted_authenticated_evaluation/,
  );
  assert.throws(
    () => assertAuthenticatedProceduralEvaluationEvidence("not-evidence"),
    /unadmitted_authenticated_evaluation/,
  );
});

test("authenticated handoff evidence stops being authority when the signed interval expires", async () => {
  const evidence = await evaluationEvidence();
  const keys = await keyPair();
  const now = Math.floor(Date.now() / 1000);
  const handoff = await signedHandoff(evidence, "keyverse:evaluator/procedural-v1", keys.privateKey, {
    issuedAtEpochSeconds: now - 1,
    expiresAtEpochSeconds: now + 1,
  });
  const authenticated = await verifyProceduralEvaluationHandoff(evidence, handoff, {
    signerKeyId: "keyverse:evaluator/procedural-v1",
    verificationKey: keys.publicKey,
  });

  const clock = vi.spyOn(Date, "now").mockReturnValue((now + 2) * 1000);
  try {
    assert.throws(
      () => assertAuthenticatedProceduralEvaluationEvidence(authenticated),
      /evaluation_handoff_expired/,
    );
  } finally {
    clock.mockRestore();
  }
});
