import {
  assertProceduralCandidateDecision,
  type ProceduralCandidateDecision,
} from "./procedural-evolution";
import {
  normalizeProceduralError,
  proceduralDigest,
  proceduralHash,
  proceduralIdentity,
  readProceduralRecord,
  rejectProceduralInput,
} from "./procedural-input";

/**
 * Process-local evidence authority created only after a locally admitted screening decision is bound
 * to an exact digest supplied through an already authenticated evaluator handoff. It carries opaque
 * evaluator/profile identities plus the exact rejection/disposition identity for later State /
 * Checkpoint retention without granting activation.
 */
export interface ProceduralEvaluationEvidence {
  readonly schemaVersion: "noema.procedural-evaluation-authority/v1";
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly policyVersion: string;
  readonly datasetDigest: string;
  readonly rubricDigest: string;
  readonly modelIdentityDigest: string;
  readonly toolIdentityDigest: string;
  readonly protocolDigest: string;
  readonly validationPlanDigest: string;
  readonly baselineDigest: string;
  readonly candidateDigest: string;
  readonly contextDigest: string;
  readonly baselineReceiptDigest: string;
  readonly candidateReceiptDigest: string;
  readonly rejectionKey: string;
  readonly decisionReason: ProceduralCandidateDecision["reason"];
  readonly envelopeDigest: string;
  readonly eligibleForApproval: boolean;
  readonly activationAuthorized: false;
}

interface EvaluationMetadata {
  readonly schemaVersion: "noema.procedural-evaluation-authority/v1";
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly policyVersion: string;
  readonly datasetDigest: string;
  readonly rubricDigest: string;
  readonly modelIdentityDigest: string;
  readonly toolIdentityDigest: string;
  readonly protocolDigest: string;
  readonly validationPlanDigest: string;
}

const admittedEvaluationEvidence = new WeakSet<object>();

function evaluationMetadata(input: unknown): EvaluationMetadata {
  const value = readProceduralRecord(input, [
    "schemaVersion",
    "evaluatorId",
    "evaluatorVersion",
    "policyVersion",
    "datasetDigest",
    "rubricDigest",
    "modelIdentityDigest",
    "toolIdentityDigest",
    "protocolDigest",
    "validationPlanDigest",
  ]);
  if (value.schemaVersion !== "noema.procedural-evaluation-authority/v1") {
    rejectProceduralInput("unsupported_schema");
  }
  return Object.freeze({
    schemaVersion: "noema.procedural-evaluation-authority/v1" as const,
    evaluatorId: proceduralIdentity(value.evaluatorId),
    evaluatorVersion: proceduralIdentity(value.evaluatorVersion),
    policyVersion: proceduralIdentity(value.policyVersion),
    datasetDigest: proceduralDigest(value.datasetDigest),
    rubricDigest: proceduralDigest(value.rubricDigest),
    modelIdentityDigest: proceduralDigest(value.modelIdentityDigest),
    toolIdentityDigest: proceduralDigest(value.toolIdentityDigest),
    protocolDigest: proceduralDigest(value.protocolDigest),
    validationPlanDigest: proceduralDigest(value.validationPlanDigest),
  });
}

async function evidenceDigest(
  decision: ProceduralCandidateDecision,
  metadata: EvaluationMetadata,
): Promise<string> {
  return proceduralHash([
    metadata.schemaVersion,
    decision.baselineDigest,
    decision.candidateDigest,
    decision.contextDigest,
    decision.baselineReceiptDigest,
    decision.candidateReceiptDigest,
    decision.rejectionKey,
    decision.reason,
    decision.eligibleForApproval,
    metadata.evaluatorId,
    metadata.evaluatorVersion,
    metadata.policyVersion,
    metadata.datasetDigest,
    metadata.rubricDigest,
    metadata.modelIdentityDigest,
    metadata.toolIdentityDigest,
    metadata.protocolDigest,
    metadata.validationPlanDigest,
  ]);
}

/**
 * Computes the exact local envelope identity that a trusted evaluator producer can authenticate out
 * of band. This digest is deliberately not an authentication result: callers must not treat knowing
 * or recomputing it as evaluator identity, approval, persistence, publication, or activation authority.
 * The identity includes deterministic rejection history and screening disposition so the same graph
 * and receipt tuple cannot be authenticated once and replayed with a different approval eligibility.
 * @param decision Locally admitted screening result whose exact graph, receipts, rejection key, and disposition bind the envelope.
 * @param input Exact-key evaluator/profile metadata whose opaque digests identify the registered evaluation conditions.
 * @returns Lowercase SHA-256 identity of the complete local procedural evaluation evidence envelope.
 */
export async function proceduralEvaluationEvidenceDigest(
  decision: ProceduralCandidateDecision,
  input: unknown,
): Promise<string> {
  try {
    assertProceduralCandidateDecision(decision);
    return evidenceDigest(decision, evaluationMetadata(input));
  } catch (error) {
    return normalizeProceduralError(error);
  }
}

/**
 * Admits one exact evaluation evidence envelope only when its locally recomputed identity equals the
 * digest delivered through an already authenticated evaluator handoff. This adapter verifies binding,
 * not the external authentication mechanism; Keyverse/owner trust and signer verification stay outside.
 * @param decision Locally admitted screening result to bind without reconstructing its process-local provenance.
 * @param input Exact-key evaluator, dataset, rubric, model, tool, protocol, policy, and validation-plan identities.
 * @param expectedEnvelopeDigest Exact digest obtained from the caller's separately authenticated evaluator channel.
 * @returns Frozen process-local evidence authority suitable for a later State / Checkpoint retention adapter.
 */
export async function admitProceduralEvaluationEvidence(
  decision: ProceduralCandidateDecision,
  input: unknown,
  expectedEnvelopeDigest: unknown,
): Promise<ProceduralEvaluationEvidence> {
  try {
    assertProceduralCandidateDecision(decision);
    const metadata = evaluationMetadata(input);
    const expected = proceduralDigest(expectedEnvelopeDigest);
    const observed = await evidenceDigest(decision, metadata);
    if (observed !== expected) rejectProceduralInput("evaluation_evidence_digest_mismatch");
    const authority = Object.freeze({
      ...metadata,
      baselineDigest: decision.baselineDigest,
      candidateDigest: decision.candidateDigest,
      contextDigest: decision.contextDigest,
      baselineReceiptDigest: decision.baselineReceiptDigest,
      candidateReceiptDigest: decision.candidateReceiptDigest,
      rejectionKey: decision.rejectionKey,
      decisionReason: decision.reason,
      envelopeDigest: observed,
      eligibleForApproval: decision.eligibleForApproval,
      activationAuthorized: false as const,
    });
    admittedEvaluationEvidence.add(authority);
    return authority;
  } catch (error) {
    return normalizeProceduralError(error);
  }
}

/**
 * Requires a procedural evaluation evidence object admitted by this module after exact handoff-digest
 * comparison. Structural copies, serialization round-trips, proxies, and caller-created lookalikes do
 * not acquire retention or approval authority merely by matching the public TypeScript interface.
 * @param value Unknown value proposed as locally admitted procedural evaluation evidence.
 * @returns Returns normally only for module-admitted evidence; otherwise throws a closed procedural error.
 */
export function assertProceduralEvaluationEvidence(
  value: unknown,
): asserts value is ProceduralEvaluationEvidence {
  if (value === null || typeof value !== "object" || !admittedEvaluationEvidence.has(value)) {
    rejectProceduralInput("unadmitted_evaluation_evidence");
  }
}
