import { assertProceduralGraph } from "./procedural-graph";
import {
  normalizeProceduralError, proceduralDigest, proceduralHash, proceduralIdentity, proceduralInteger,
  readProceduralArray, readProceduralRecord, rejectProceduralInput,
} from "./procedural-input";

/** Deterministic screening result for one exact graph candidate; eligibility means only that supplied evidence may proceed to an independent approval boundary. */
export interface ProceduralCandidateDecision {
  readonly eligibleForApproval: boolean;
  readonly activationAuthorized: false;
  readonly reason: "unchanged_graph" | "previously_rejected" | "safety_violation" | "score_regression" | "validation_non_regression";
  readonly baselineDigest: string;
  readonly candidateDigest: string;
  readonly contextDigest: string;
  readonly baselineReceiptDigest: string;
  readonly candidateReceiptDigest: string;
  readonly rejectionKey: string;
  readonly baselineMean: number;
  readonly candidateMean: number;
}

interface Observation { readonly score: number; readonly safetyViolations: number; }
const admittedCandidateDecisions = new WeakSet<object>();

/**
 * Requires a candidate decision produced by this module in the current process after all graph-lineage,
 * held-out evidence, safety, and score checks completed. A frozen structural copy is still untrusted;
 * later State / Checkpoint and Policy / Approval boundaries must call this before retaining or acting
 * on screening output so caller-created objects cannot mint eligibility or rejection-history authority.
 * @param value Unknown value proposed as a locally screened procedural candidate decision.
 * @returns Returns normally only for a decision emitted by `assessProceduralCandidate`; otherwise throws.
 */
export function assertProceduralCandidateDecision(
  value: unknown,
): asserts value is ProceduralCandidateDecision {
  if (value === null || typeof value !== "object" || !admittedCandidateDecisions.has(value)) {
    rejectProceduralInput("unadmitted_decision");
  }
}

function caseIds(input: unknown, minimum: number): string[] {
  const ids = readProceduralArray(input, minimum, 10_000).map(proceduralIdentity);
  if (new Set(ids).size !== ids.length) rejectProceduralInput("duplicate_case");
  return ids.sort();
}

function observations(input: unknown, graphDigest: string, contextDigest: string, holdout: readonly string[]): Observation[] {
  const receipt = readProceduralRecord(input, ["graphDigest", "contextDigest", "observations"]);
  if (proceduralDigest(receipt.graphDigest) !== graphDigest || proceduralDigest(receipt.contextDigest) !== contextDigest) rejectProceduralInput("receipt_mismatch");
  const rows = readProceduralArray(receipt.observations, 0, 10_000);
  if (rows.length !== holdout.length) rejectProceduralInput("case_set_mismatch");
  const byId = new Map<string, Observation>();
  const expectedIds = new Set(holdout);
  for (const row of rows) {
    const value = readProceduralRecord(row, ["caseId", "score", "safetyViolations"]);
    const id = proceduralIdentity(value.caseId);
    if (byId.has(id)) rejectProceduralInput("duplicate_case");
    if (!expectedIds.has(id)) rejectProceduralInput("case_set_mismatch");
    const score = value.score;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) rejectProceduralInput("invalid_score");
    byId.set(id, {score, safetyViolations: proceduralInteger(value.safetyViolations, 0, Number.MAX_SAFE_INTEGER)});
  }
  return holdout.map(id => byId.get(id)!);
}

async function evaluationReceiptDigest(
  graphDigest: string,
  contextDigest: string,
  holdout: readonly string[],
  rows: readonly Observation[],
): Promise<string> {
  return proceduralHash([
    "noema.procedural-evaluation-receipt/v1",
    graphDigest,
    contextDigest,
    holdout.map((caseId, index) => [caseId, rows[index].score, rows[index].safetyViolations]),
  ]);
}

/**
 * Screens supplied paired held-out evidence for a direct child graph while keeping activation and
 * publication outside this pure port. The validator owner must authenticate receipts and pre-register
 * the evaluation context; this function checks exact identities, complete paired cases, leakage,
 * finite normalized scores, reported safety violations, mean non-regression, and contextual rejection.
 * Returned receipt digests bind the exact validated paired evidence semantics for later authentication
 * and durable retention, but a digest alone does not authenticate its producer or authorize approval.
 * @param input Exact-key baseline, candidate, evaluation plan, paired receipts, and prior rejection keys.
 * @returns Promise resolving to a frozen non-authoritative screening decision with activation always false.
 */
export async function assessProceduralCandidate(input: unknown): Promise<ProceduralCandidateDecision> {
  try {
    const value = readProceduralRecord(input, ["baseline", "candidate", "plan", "baselineReceipt", "candidateReceipt", "rejectedKeys"]);
    const baseline = value.baseline, candidate = value.candidate;
    assertProceduralGraph(baseline); assertProceduralGraph(candidate);
    if (candidate.tenantId !== baseline.tenantId || candidate.taskType !== baseline.taskType || candidate.graphId !== baseline.graphId || candidate.parentDigest !== baseline.digest || candidate.revision !== baseline.revision + 1) rejectProceduralInput("candidate_lineage_mismatch");
    const plan = readProceduralRecord(value.plan, ["contextDigest", "minimumCases", "trainingCaseIds", "holdoutCaseIds"]);
    const contextDigest = proceduralDigest(plan.contextDigest);
    const minimumCases = proceduralInteger(plan.minimumCases, 1, 10_000);
    const training = new Set(caseIds(plan.trainingCaseIds, 0));
    const holdout = caseIds(plan.holdoutCaseIds, 1);
    if (holdout.length < minimumCases) rejectProceduralInput("insufficient_cases");
    if (holdout.some(id => training.has(id))) rejectProceduralInput("holdout_leakage");
    const oldRows = observations(value.baselineReceipt, baseline.digest, contextDigest, holdout);
    const newRows = observations(value.candidateReceipt, candidate.digest, contextDigest, holdout);
    const baselineReceiptDigest = await evaluationReceiptDigest(baseline.digest, contextDigest, holdout, oldRows);
    const candidateReceiptDigest = await evaluationReceiptDigest(candidate.digest, contextDigest, holdout, newRows);
    const rejectedKeys = new Set(readProceduralArray(value.rejectedKeys, 0, 10_000).map(proceduralDigest));
    const baselineMean = oldRows.reduce((total, row) => total + row.score, 0) / holdout.length;
    const candidateMean = newRows.reduce((total, row) => total + row.score, 0) / holdout.length;
    const rejectionKey = await proceduralHash(["noema.procedural-rejection/v1", baseline.digest, candidate.structureDigest, contextDigest, minimumCases, [...training], holdout]);
    let reason: ProceduralCandidateDecision["reason"];
    if (candidate.structureDigest === baseline.structureDigest) reason = "unchanged_graph";
    else if (rejectedKeys.has(rejectionKey)) reason = "previously_rejected";
    else if (newRows.some(row => row.safetyViolations > 0)) reason = "safety_violation";
    else if (candidateMean < baselineMean) reason = "score_regression";
    else reason = "validation_non_regression";
    const decision = Object.freeze({eligibleForApproval: reason === "validation_non_regression", activationAuthorized: false as const, reason, baselineDigest: baseline.digest, candidateDigest: candidate.digest, contextDigest, baselineReceiptDigest, candidateReceiptDigest, rejectionKey, baselineMean, candidateMean});
    admittedCandidateDecisions.add(decision);
    return decision;
  } catch (error) { return normalizeProceduralError(error); }
}
