import { isCanonicalExecutionId } from "../runtime-shared/execution-identity";

/** Immutable checkpoint identity retained by Noema's State & Checkpoint bounded context. */
export interface ExecutionCheckpoint {
  /** Stable execution identity; a retry/recovery attempt uses a different execution identity. */
  readonly executionId: string;
  /** Monotonic checkpoint sequence beginning at zero. */
  readonly sequence: number;
  /** Lowercase SHA-256 digest of the canonical checkpoint state bytes. */
  readonly stateDigest: string;
}

/** Result of admitting a candidate checkpoint against the retained execution checkpoint. */
export type CheckpointAdmission =
  | { readonly kind: "accepted"; readonly checkpoint: ExecutionCheckpoint }
  | { readonly kind: "replay"; readonly checkpoint: ExecutionCheckpoint };

/** Raised when checkpoint evidence would create ambiguous, stale, or cross-execution state authority. */
export class CheckpointAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointAdmissionError";
  }
}

const STATE_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

function validateCheckpoint(checkpoint: ExecutionCheckpoint): void {
  if (!isCanonicalExecutionId(checkpoint.executionId)) {
    throw new CheckpointAdmissionError("checkpoint execution identity is not canonical");
  }
  if (!Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 0) {
    throw new CheckpointAdmissionError("checkpoint sequence must be a non-negative safe integer");
  }
  if (typeof checkpoint.stateDigest !== "string" || !STATE_DIGEST_PATTERN.test(checkpoint.stateDigest)) {
    throw new CheckpointAdmissionError("checkpoint state digest must be lowercase SHA-256");
  }
}

function snapshotCheckpoint(checkpoint: ExecutionCheckpoint): ExecutionCheckpoint {
  return Object.freeze({
    executionId: checkpoint.executionId,
    sequence: checkpoint.sequence,
    stateDigest: checkpoint.stateDigest,
  });
}

function snapshotAdmission(
  kind: CheckpointAdmission["kind"],
  checkpoint: ExecutionCheckpoint,
): CheckpointAdmission {
  return Object.freeze({ kind, checkpoint });
}

function admitExecutionCheckpointBoundary(
  retained: ExecutionCheckpoint | null,
  candidate: ExecutionCheckpoint,
): CheckpointAdmission {
  const retainedSnapshot = retained === null ? null : snapshotCheckpoint(retained);
  const candidateSnapshot = snapshotCheckpoint(candidate);
  validateCheckpoint(candidateSnapshot);

  if (retainedSnapshot === null) {
    if (candidateSnapshot.sequence !== 0) {
      throw new CheckpointAdmissionError("initial checkpoint sequence must be zero");
    }
    return snapshotAdmission("accepted", candidateSnapshot);
  }

  validateCheckpoint(retainedSnapshot);

  if (candidateSnapshot.executionId !== retainedSnapshot.executionId) {
    throw new CheckpointAdmissionError("checkpoint execution identity changed");
  }

  if (candidateSnapshot.sequence === retainedSnapshot.sequence) {
    if (candidateSnapshot.stateDigest !== retainedSnapshot.stateDigest) {
      throw new CheckpointAdmissionError("checkpoint replay conflicts with retained state");
    }
    return snapshotAdmission("replay", retainedSnapshot);
  }

  if (candidateSnapshot.sequence < retainedSnapshot.sequence) {
    throw new CheckpointAdmissionError("checkpoint sequence is stale");
  }

  if (candidateSnapshot.sequence !== retainedSnapshot.sequence + 1) {
    throw new CheckpointAdmissionError("checkpoint sequence must advance exactly once");
  }

  return snapshotAdmission("accepted", candidateSnapshot);
}

/**
 * Admits one checkpoint without granting retry or duplicate-side-effect authority.
 *
 * Retained authority is snapshotted before any candidate accessor is evaluated. Candidate and retained
 * inputs are then validated and compared only through their detached snapshots, so a candidate getter
 * or proxy cannot mutate the retained object and redefine the history against which it is admitted.
 * The first checkpoint must be sequence zero. Exact same-sequence/same-digest input is an idempotent
 * replay; same-sequence/different-digest input is a conflict. A later checkpoint must advance exactly
 * one sequence for the same execution identity so gaps, stale writes, and cross-execution restoration
 * fail closed. Every admitted checkpoint and its returned admission envelope are frozen snapshots.
 * Null objects, revoked proxies, and throwing accessors are normalized into `CheckpointAdmissionError`
 * so hostile boundary input cannot escape as an unrelated JavaScript exception.
 *
 * @param retained Previously admitted checkpoint for this execution, or null before the first write.
 * @param candidate Untrusted next checkpoint proposed for admission at the state boundary.
 * @returns An accepted or replay result containing a frozen canonical checkpoint snapshot.
 */
export function admitExecutionCheckpoint(
  retained: ExecutionCheckpoint | null,
  candidate: ExecutionCheckpoint,
): CheckpointAdmission {
  try {
    return admitExecutionCheckpointBoundary(retained, candidate);
  } catch (error) {
    if (error instanceof CheckpointAdmissionError) throw error;
    throw new CheckpointAdmissionError("checkpoint input could not be read safely");
  }
}
