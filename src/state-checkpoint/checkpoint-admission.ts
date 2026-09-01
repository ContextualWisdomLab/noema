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
const EXECUTION_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;

function validateCheckpoint(checkpoint: ExecutionCheckpoint): void {
  if (!EXECUTION_ID_PATTERN.test(checkpoint.executionId)) {
    throw new CheckpointAdmissionError("checkpoint execution identity is not canonical");
  }
  if (!Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 0) {
    throw new CheckpointAdmissionError("checkpoint sequence must be a non-negative safe integer");
  }
  if (!STATE_DIGEST_PATTERN.test(checkpoint.stateDigest)) {
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

/**
 * Admits one checkpoint without granting retry or duplicate-side-effect authority.
 *
 * The first checkpoint must be sequence zero. Exact same-sequence/same-digest input is an idempotent
 * replay; same-sequence/different-digest input is a conflict. A later checkpoint must advance exactly
 * one sequence for the same execution identity so gaps, stale writes, and cross-execution restoration
 * fail closed. Every admitted checkpoint is copied into a frozen snapshot so a caller-owned alias
 * cannot mutate retained authority after validation.
 */
export function admitExecutionCheckpoint(
  retained: ExecutionCheckpoint | null,
  candidate: ExecutionCheckpoint,
): CheckpointAdmission {
  validateCheckpoint(candidate);

  if (retained === null) {
    if (candidate.sequence !== 0) {
      throw new CheckpointAdmissionError("initial checkpoint sequence must be zero");
    }
    return { kind: "accepted", checkpoint: snapshotCheckpoint(candidate) };
  }

  validateCheckpoint(retained);

  if (candidate.executionId !== retained.executionId) {
    throw new CheckpointAdmissionError("checkpoint execution identity changed");
  }

  if (candidate.sequence === retained.sequence) {
    if (candidate.stateDigest !== retained.stateDigest) {
      throw new CheckpointAdmissionError("checkpoint replay conflicts with retained state");
    }
    return { kind: "replay", checkpoint: snapshotCheckpoint(retained) };
  }

  if (candidate.sequence < retained.sequence) {
    throw new CheckpointAdmissionError("checkpoint sequence is stale");
  }

  if (candidate.sequence !== retained.sequence + 1) {
    throw new CheckpointAdmissionError("checkpoint sequence must advance exactly once");
  }

  return { kind: "accepted", checkpoint: snapshotCheckpoint(candidate) };
}
