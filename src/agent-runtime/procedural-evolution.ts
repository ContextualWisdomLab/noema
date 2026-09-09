import { assertProceduralGraph } from "./procedural-graph";
import {
  normalizeProceduralError, proceduralDigest, proceduralHash, proceduralIdentity, proceduralInteger,
  readProceduralArray, readProceduralRecord, rejectProceduralInput,
} from "./procedural-input";

export interface ProceduralCandidateDecision {
  readonly eligibleForApproval: boolean;
  readonly activationAuthorized: false;
  readonly reason: "unchanged_graph" | "previously_rejected" | "safety_violation" | "score_regression" | "validation_non_regression";
  readonly baselineDigest: string;
  readonly candidateDigest: string;
  readonly contextDigest: string;
  readonly rejectionKey: string;
  readonly baselineMean: number;
  readonly candidateMean: number;
}

interface Observation { readonly score: number; readonly safetyViolations: number; }

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

/**
 * Screens supplied paired evidence; the owning validator must authenticate receipts and
 * pre-register the evaluation context before calling this pure port. This is neither a
 * statistical significance test nor a signed approval, publication, or activation gate.
 * Rejection keys include the exact retained base, evaluation context, and case partition, preventing a
 * failed candidate from being mistaken for the next baseline or globally blacklisted.
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
    return Object.freeze({eligibleForApproval: reason === "validation_non_regression", activationAuthorized: false, reason, baselineDigest: baseline.digest, candidateDigest: candidate.digest, contextDigest, rejectionKey, baselineMean, candidateMean});
  } catch (error) { return normalizeProceduralError(error); }
}
