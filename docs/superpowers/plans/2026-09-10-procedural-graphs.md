# Procedural graph core implementation plan and verification record

Goal: make advisory procedural structure and offline candidate screening available
as testable Noema Agent Runtime ports without changing production authority.

Architecture: local immutable graph values; an execution-pinned read-only context;
independent pure evidence screening. Foreign policy, credentials, routing, and
product truth remain outside this aggregate.

Spec: [ADR-0016](../../adr/0016-procedural-graph-guidance.md).
Tracking: Noema #584; ContextualWisdomLab/.github #2067.

## Scope and interfaces

| File | Responsibility |
| --- | --- |
| `src/agent-runtime/procedural-input.ts` | Internal descriptor-safe readers, bounds, canonical hashing and fixed errors |
| `src/agent-runtime/procedural-graph.ts` | `createProceduralGraph(input)` and `startProceduralSession(graph, scope)` |
| `src/agent-runtime/procedural-evolution.ts` | `assessProceduralCandidate(input)` returns eligibility, never activation |
| `test/procedural-graph.test.mjs` | Immutable graph, scope, traversal, malformed/hostile input regressions |
| `test/procedural-evolution.test.mjs` | Paired evidence, lineage, partition, safety and rejection regressions |

No edits to package/lock files, workflows, `/exchange`, runtime trust pins,
existing execution/extension lifecycle code, AGENTS, or the active #583 baseline
lane. The input helper is an additional new path within #584's aggregate, not a
second shared-kernel owner. No sibling repository source is copied or mutated.

## Execution and test sequence

- [x] Read live protected Noema architecture, Agent Runtime code, package/test
  configuration, active PRs, and central ownership conventions.
- [x] Register the organization plan and isolated implementation lane.
- [x] Write behavior assertions before implementation. Interface-only scaffolds
  returned empty values; the first run failed on missing actual behavior.
- [x] Implement immutable graph admission and directed bounded context traversal.
- [x] Implement matched held-out screening and context-bound rejection signatures.
- [x] Add hostile thrown-proxy and actual-partition identity regressions. Both
  failed before their causal fixes, while the other behavior stayed passing.
- [x] Normalize errors by locally created-error membership instead of invoking an
  untrusted thrown object's prototype. Bind rejection identity to the actual
  case partition/minimum count as well as the evaluator's context digest.
- [x] Re-run all focused assertions and strict standalone TypeScript compilation.
- [ ] Run unchanged native repository typecheck and full Vitest coverage on the
  exact PR head using its pinned toolchain; resolve any observed failures.
- [ ] Obtain all live required checks and independent review on that same head.
- [ ] Merge through protected governance; release/shared-contract and deployed
  integration acceptance remain separate follow-on work.

## Minimal local call sequence

```ts
import {createProceduralGraph, startProceduralSession} from "../../../src/agent-runtime/procedural-graph";

const graph = await createProceduralGraph({
  schemaVersion: "noema.procedural-graph/v1",
  tenantId: "tenant-a", taskType: "pr-repair", graphId: "review-loop",
  revision: 1, parentDigest: null,
  nodes: ["Start", "review", "verify"],
  edges: [
    {from: "Start", relation: "leads_to", to: "review", condition: "",
     guidance: "Read exact-head review evidence", pitfalls: "Do not reuse stale checks"},
    {from: "review", relation: "leads_to", to: "verify", condition: "",
     guidance: "Verify the finding against source", pitfalls: "A model opinion is not proof"},
  ],
});
const session = startProceduralSession(graph, {
  tenantId: "tenant-a", taskType: "pr-repair", executionId: "run-1",
  graphDigest: graph.digest,
});
const context = session.context({lastProcedure: null, hops: 2, maxEdges: 64});
// A trusted caller may use context as advisory data; it grants no tool authority.
```

The complete executable candidate/receipt examples are the fixture and assertions
in `test/procedural-evolution.test.mjs`. They use synthetic normalized scores and
are not CWL product-performance evaluation results.

## Verification actually performed in the authoring environment

The authoring container had Node 22.16.0 and TypeScript 5.8.3; it could not resolve
GitHub/package-host DNS and did not contain Vitest or the full repository checkout.
Live repository reads/writes used the connected GitHub API. The pinned repository
toolchain observed at the branch point is Node 24.19.0 / npm 11.17.0; it was not
replaced, weakened, or installed by this change.

The three new source files compiled with strict TypeScript, ES2022 target and
CommonJS output. Test assertions were copied unchanged to a local adapter,
replacing only `vitest` with `node:test` and `.ts` source imports with compiled
`.js` paths. This ran **89 tests: 89 passed, 0 failed, 0 skipped**. Node's coverage
report for the three compiled production modules showed 100% lines, branches,
and functions. This is scoped compiled-module evidence, not native Vitest
statement/branch coverage, Cloudflare compatibility, repository-wide coverage,
security-scanner success, or hosted exact-head approval. No coverage configuration
or threshold changed.

Native commands for the exact PR checkout, under the repository-pinned toolchain:

```sh
npm ci
npm run typecheck
npm test
```

For faster diagnosis only, before the unchanged full gate:

```sh
npx --no-install vitest run test/procedural-graph.test.mjs test/procedural-evolution.test.mjs
```

A focused pass never replaces the required full gate. Subsequent PR pushes must
rerun relevant evidence; authored local measurements are not transferable to a
later head, release, deployment, or different runtime.

## Downstream acceptance work

Contract owner: release graph/context/evaluation/decision schemas with equivalent
canonicalization fixtures across languages. Graph hashes here are local, not a
published interchange guarantee.

Runtime/model integration owner: authenticate scope and artifacts, preserve graph
revision for the entire execution, call the existing orchestrator gateway, treat
all guidance text as untrusted advice, and reject tool authority inferred from it.

Evaluation owner: pre-register task-specific criteria and minimum evidence,
authenticate issuer/context/case receipts, exclude training/final-test leakage,
measure uncertainty and subgroup/control regressions independently, and do not
promote from this arithmetic screen alone.

State/Approval owner: persist scoped rejections without leaking holdout content,
require independent exact-digest approval and immutable foreign-owner evidence,
perform CAS promotion and tested rollback/revocation, and keep acknowledged history.

Product owners: demonstrate actual shadow use, per-domain controls and consumer
conformance before opt-in activation. A tracked issue is not implementation or
deployment evidence.
