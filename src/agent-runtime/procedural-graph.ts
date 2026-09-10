import {
  normalizeProceduralError, proceduralDigest, proceduralHash, proceduralIdentity,
  proceduralInteger, proceduralText, readProceduralArray, readProceduralRecord, rejectProceduralInput,
} from "./procedural-input";

/** One directed advisory relationship between two named procedures; its text never grants execution, policy, credential, or approval authority. */
export interface ProceduralEdge {
  readonly from: string;
  readonly relation: "leads_to" | "requires" | "enables";
  readonly to: string;
  readonly condition: string;
  readonly guidance: string;
  readonly pitfalls: string;
}

/** Immutable tenant/task-scoped procedural knowledge snapshot with explicit revision lineage and local content identities for exact execution pinning. */
export interface ProceduralGraph {
  readonly schemaVersion: "noema.procedural-graph/v1";
  readonly tenantId: string;
  readonly taskType: string;
  readonly graphId: string;
  readonly revision: number;
  readonly parentDigest: string | null;
  readonly nodes: readonly string[];
  readonly edges: readonly ProceduralEdge[];
  readonly digest: string;
  readonly structureDigest: string;
}

/** Bounded execution-local view of one admitted graph; all returned relationships are advisory data and an abstention carries no hidden full-graph fallback. */
export interface ProceduralContext {
  readonly authority: "advisory_only";
  readonly mode: "localized" | "abstain";
  readonly reason: "matched" | "unknown_procedure" | "context_budget_exceeded";
  readonly executionId: string;
  readonly tenantId: string;
  readonly taskType: string;
  readonly graphId: string;
  readonly graphRevision: number;
  readonly graphDigest: string;
  readonly nodes: readonly string[];
  readonly edges: readonly ProceduralEdge[];
}

/** Execution-pinned capability that can retrieve bounded advisory context from one exact graph digest but cannot mutate lifecycle state or invoke tools. */
export interface ProceduralSession {
  readonly executionId: string;
  readonly graphDigest: string;
  context(request: unknown): ProceduralContext;
}

const admittedGraphs = new WeakSet<object>();
const admittedSessions = new WeakSet<object>();

/**
 * Requires a graph object that was constructed and hashed by this module in the current process;
 * deserialized or forged lookalikes must be reconstructed through the admission function first.
 * @param value Unknown object proposed for use as a trusted local procedural graph snapshot.
 * @returns Returns normally only when `value` is a locally admitted `ProceduralGraph`; otherwise throws.
 */
export function assertProceduralGraph(value: unknown): asserts value is ProceduralGraph {
  if (value === null || typeof value !== "object" || !admittedGraphs.has(value)) rejectProceduralInput("unadmitted_graph");
}

/**
 * Requires an execution-pinned session created by this module in the current process so structural
 * lookalikes cannot inject advisory graph content at a later Agent Runtime integration boundary.
 * @param value Unknown object proposed for use as an admitted execution-pinned procedural session.
 * @returns Returns normally only when `value` carries this module's runtime session brand; otherwise throws.
 */
export function assertProceduralSession(value: unknown): asserts value is ProceduralSession {
  if (value === null || typeof value !== "object" || !admittedSessions.has(value)) rejectProceduralInput("unadmitted_session");
}

/**
 * Builds a canonical deep-frozen advisory graph after strict schema, identity, edge, and byte-budget
 * validation. Canonical ordering removes caller array-order differences from local content identity;
 * this digest is not a signature or cross-language interchange guarantee.
 * @param input Exact-key untrusted graph record using the local `noema.procedural-graph/v1` schema.
 * @returns Promise resolving to an immutable locally admitted graph with content and structure digests.
 */
export async function createProceduralGraph(input: unknown): Promise<ProceduralGraph> {
  try {
    const value = readProceduralRecord(input, ["schemaVersion", "tenantId", "taskType", "graphId", "revision", "parentDigest", "nodes", "edges"]);
    if (value.schemaVersion !== "noema.procedural-graph/v1") rejectProceduralInput("unsupported_schema");
    const tenantId = proceduralIdentity(value.tenantId);
    const taskType = proceduralIdentity(value.taskType);
    const graphId = proceduralIdentity(value.graphId);
    const revision = proceduralInteger(value.revision, 1, Number.MAX_SAFE_INTEGER);
    const parentDigest = value.parentDigest === null ? null : proceduralDigest(value.parentDigest);
    const nodes = readProceduralArray(value.nodes, 1, 256).map(proceduralIdentity).sort();
    if (new Set(nodes).size !== nodes.length) rejectProceduralInput("duplicate_node");
    if (!nodes.includes("Start")) rejectProceduralInput("missing_start");
    const seen = new Set<string>();
    const keyedEdges = readProceduralArray(value.edges, 0, 512).map(item => {
      const edge = readProceduralRecord(item, ["from", "relation", "to", "condition", "guidance", "pitfalls"]);
      const from = proceduralIdentity(edge.from);
      const to = proceduralIdentity(edge.to);
      const relation = edge.relation;
      if (relation !== "leads_to" && relation !== "requires" && relation !== "enables") rejectProceduralInput("invalid_relation");
      if (!nodes.includes(from) || !nodes.includes(to)) rejectProceduralInput("dangling_edge");
      const key = JSON.stringify([from, relation, to]);
      if (seen.has(key)) rejectProceduralInput("duplicate_edge");
      seen.add(key);
      return {key, edge: Object.freeze({from, relation, to, condition: proceduralText(edge.condition), guidance: proceduralText(edge.guidance), pitfalls: proceduralText(edge.pitfalls)})};
    });
    keyedEdges.sort((a, b) => a.key < b.key ? -1 : 1);
    const core = {
      schemaVersion: "noema.procedural-graph/v1" as const, tenantId, taskType, graphId,
      nodes: Object.freeze(nodes), edges: Object.freeze(keyedEdges.map(item => item.edge)),
    };
    // All caller-owned fields have been read and copied before either await.
    const structureDigest = await proceduralHash(core);
    const digest = await proceduralHash({...core, revision, parentDigest});
    const graph = Object.freeze({...core, revision, parentDigest, digest, structureDigest});
    admittedGraphs.add(graph);
    return graph;
  } catch (error) { return normalizeProceduralError(error); }
}

/**
 * Pins one admitted graph in a closure for a caller-supplied execution identity after exact tenant,
 * task, and graph-digest comparison. The caller still owns authentication, lifecycle, cancellation,
 * policy, tool admission, and authorization; this session only returns bounded advisory graph data.
 * @param graph Locally admitted immutable procedural graph to pin for the execution.
 * @param input Exact-key tenant, task, execution identity, and expected graph digest claim.
 * @returns Frozen `ProceduralSession` whose context function remains bound to the exact admitted graph.
 */
export function startProceduralSession(graph: ProceduralGraph, input: unknown): ProceduralSession {
  try {
    assertProceduralGraph(graph);
    const scope = readProceduralRecord(input, ["tenantId", "taskType", "executionId", "graphDigest"]);
    const tenantId = proceduralIdentity(scope.tenantId);
    const taskType = proceduralIdentity(scope.taskType);
    const executionId = proceduralIdentity(scope.executionId);
    const graphDigest = proceduralDigest(scope.graphDigest);
    if (tenantId !== graph.tenantId || taskType !== graph.taskType || graphDigest !== graph.digest) rejectProceduralInput("scope_mismatch");
    const identity = {authority: "advisory_only" as const, executionId, tenantId, taskType, graphId: graph.graphId, graphRevision: graph.revision, graphDigest};
    const abstain = (reason: "unknown_procedure" | "context_budget_exceeded"): ProceduralContext =>
      Object.freeze({...identity, mode: "abstain" as const, reason, nodes: Object.freeze([]), edges: Object.freeze([])});
    const session = Object.freeze({executionId, graphDigest, context(request: unknown): ProceduralContext {
      try {
        const value = readProceduralRecord(request, ["lastProcedure", "hops", "maxEdges"]);
        const active = value.lastProcedure === null ? "Start" : proceduralIdentity(value.lastProcedure);
        const hops = proceduralInteger(value.hops, 1, 4);
        const maxEdges = proceduralInteger(value.maxEdges, 1, 512);
        if (!graph.nodes.includes(active)) return abstain("unknown_procedure");
        const visited = new Set([active]);
        let frontier = new Set([active]);
        const selected: ProceduralEdge[] = [];
        for (let depth = 0; depth < hops && frontier.size > 0; depth++) {
          const next = new Set<string>();
          for (const edge of graph.edges) {
            if (!frontier.has(edge.from)) continue;
            selected.push(edge);
            if (selected.length > maxEdges) return abstain("context_budget_exceeded");
            if (!visited.has(edge.to)) { visited.add(edge.to); next.add(edge.to); }
          }
          frontier = next;
        }
        return Object.freeze({...identity, mode: "localized" as const, reason: "matched" as const, nodes: Object.freeze([...visited].sort()), edges: Object.freeze(selected)});
      } catch (error) { return normalizeProceduralError(error); }
    }});
    admittedSessions.add(session);
    return session;
  } catch (error) { return normalizeProceduralError(error); }
}
