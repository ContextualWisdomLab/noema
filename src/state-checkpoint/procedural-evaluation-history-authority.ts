import type { ProceduralGraph } from "../agent-runtime/procedural-graph";
import {
  DurableProceduralEvaluationHistoryRepository,
  ProceduralEvaluationHistoryConflictError,
  type ProceduralEvaluationHistorySnapshot,
} from "./procedural-evaluation-history";

const admittedHistorySnapshots = new WeakSet<object>();

/**
 * State / Checkpoint read authority for downstream consumers that need a freshly verified durable
 * procedural-evaluation snapshot. The adapter adds no storage or policy truth: it delegates the read
 * to the canonical history repository and marks only that verified immutable result as locally admitted.
 */
export class ProceduralEvaluationHistoryAuthority {
  constructor(private readonly repository: DurableProceduralEvaluationHistoryRepository) {}

  /**
   * Reads current durable history through the canonical repository and admits only the verified result.
   * Missing history remains null and cannot be promoted into downstream authority.
   * @param candidate Locally admitted procedural graph selecting the canonical State / Checkpoint stream.
   * @returns A freshly verified locally admitted snapshot, or null when no history exists.
   */
  async read(candidate: ProceduralGraph): Promise<ProceduralEvaluationHistorySnapshot | null> {
    const snapshot = await this.repository.read(candidate);
    if (snapshot === null) return null;
    admittedHistorySnapshots.add(snapshot);
    return snapshot;
  }
}

/**
 * Requires process-local provenance from `ProceduralEvaluationHistoryAuthority.read`. Structural clones,
 * deserialized lookalikes, append-return snapshots, and caller-created objects are not fresh read authority.
 * This assertion is intended for a later Policy / Approval anti-corruption boundary; it grants no approval.
 * @param value Candidate durable history snapshot proposed as current State / Checkpoint evidence.
 */
export function assertProceduralEvaluationHistorySnapshot(
  value: unknown,
): asserts value is ProceduralEvaluationHistorySnapshot {
  if (value === null || typeof value !== "object" || !admittedHistorySnapshots.has(value)) {
    throw new ProceduralEvaluationHistoryConflictError(
      "unadmitted durable procedural history snapshot",
    );
  }
}
