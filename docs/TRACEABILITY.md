# Noema Requirements and Evidence Traceability

## Purpose

This document maps requirements and architecture decisions to executable Noema surfaces and to the evidence that can legitimately prove them. File presence, PR prose, model output, queued checks, or predecessor results are never promoted into implementation, approval, merge, release, deployment, or acquisition authority.

Protected-main branch-point reference for this refresh: `be7df559ca8c1d81b61f68f68c36d1526c94e7f2`. This is a snapshot anchor, not evergreen current authority; live protected `main` must be refetched before any merge, release, deployment, or acquisition claim.

Noema's execution rule is:

> **RCA → feasibility → action → proof.**

Noema's continuation rule is:

> **A blocked lane is local.** Waiting on a check, reviewer, dependency, or external control does not stop other safe work.

Noema's deliverable rule is:

> **Intermediate artifact → next executable boundary.** Documentation, RCA, tests, commits, PRs, and merges are intermediate whenever another required authority or acceptance boundary remains.

## 1. Evidence authorities

```text
protected source revision
→ exact PR/source head
→ independently resolved live base
→ workflow checkout revision
→ check/status/scanner evidence
→ formal review evidence
→ live repository governance
→ merge decision
→ protected-main operational evidence
→ release/package/SBOM/provenance evidence
→ deployment evidence
→ buyer/legal/commercial evidence
```

Each arrow is a separate authority. Success at an earlier stage cannot fabricate a later one.

## 2. Current product and control traceability

| Requirement family | Canonical decision / boundary | Protected or active implementation surface | Executable proof | Residual evidence | Maturity |
| --- | --- | --- | --- | --- | --- |
| Credential exchange and readiness | Architecture, runtime threat model | `src/index.ts`, runtime entrypoints, OIDC/replay/rate-limit modules | runtime/API/security tests and exact configured coverage | deployed protected-main smoke where applicable | Implemented on protected main; operational evidence remains separate |
| Inbound `/exchange` body deadline | TRD §2.1 + `docs/api-spec.md` | active `src/entrypoint.ts` deadline enforcement plus `scripts/smoke-readiness.sh` stalled-body deployment smoke | realistic stalled-stream regression, smoke script contract tests, OpenAPI/docs contract tests; 8,192-byte body cap and 10,000 ms absolute deadline remain distinct controls | exact-head CI/security/image evidence, then protected deployment observation of the stalled-body 408 path | Implemented on active PR / In review; protected-main maturity follows integration |
| Workflow/repository authority | Runtime threat model and Worker trust contract | exact workflow-ref, repository identity and cryptographic OIDC verification plus immutable configured `ALLOWED_WORKFLOW_SHA` binding to `job_workflow_sha` / `workflow_sha`; the current revision also treats configured workflow-ref/SHA values as canonical operator bytes | issuer/audience/repository/ref hostile-token tests, source-SHA mismatch/missing/configuration regressions, signed non-canonical-config regressions | current central workflow identity, exact-head CI/security evidence for any active delta, protected deployment-binding evidence | Immutable source binding is implemented on protected main; additional revision-local hardening becomes protected only when that revision integrates |
| Fail-closed outbound GitHub boundary | Architecture + security docs | outbound fetch/request/response validation | origin/redirect/timeout/body/schema tests | production telemetry/incident evidence | Implemented family |
| Delegated GitHub credential capability | AGENTS secret policy + closed issue #111 | `scripts/lib/delegated-github-token.mjs`, maintainer/reviewer workflow ingress | token-capability and workflow-ingress tests covering `NOEMA_MAINTAINER_TOKEN_PATH`, owner-only `0600`, symlink/race/size/content rejection, minimal child env | live App installation/key-custody/rotation/permission evidence under #29/#227 | Capability-file policy alignment is protected; external identity evidence remains separate |
| Distributed rate/replay state | Architecture data boundary | Durable Object rate/replay state | concurrency/alarm/replay tests | deployed binding/storage evidence | Implemented family |
| Exact head + current live base | ADR-0003 | CI and evidence collectors | exact-checkout/live-base/predecessor separation tests | current PR and protected-main runs | Implemented family; each run must re-prove freshness |
| Evidence channel separation | ADR-0001 | checks/statuses/reviews/scanners/readiness scripts | collision/stale/predecessor/synthetic evidence tests | current GitHub evidence | Implemented family |
| Safe repository writes | ADR-0004/0008 | bounded conditional ref/blob/PR operations | stale/ref/lease/cleanup tests | concurrent-writer exercise | Implemented/proposed depending on surface |
| Work-conserving continuation | ADR-0002/0009 | scheduler contract and repository-owned execution policy | continuation/remediation contracts | actual multi-lane run evidence | Process contract; external scheduler state remains separate |
| Canonical documentation graph | this repository revision | PRD/TRD/Architecture/ADRs/UML/ERD/Test Strategy/Operability/Traceability | documentation architecture/fitness contracts | protected-main operational evidence remains separate by family | Code-current by revision; protected authority depends on whether the revision is integrated |
| Main governance current truth | ADR-0011 + issue #27 | `scripts/main-governance-audit.mjs`, `scripts/lib/main-governance-audit.mjs` | target-policy failures + observed-workflow evidence tests | actual live ruleset | Implementation exists; target governance remains an external/live authority |
| Machine-readable HTTP API | protected API contract | `openapi.json` | OpenAPI/documentation contract tests plus runtime route tests | deployed endpoint compatibility evidence | Implemented on protected main |
| Credential/security coverage truth | protected main | protected `src/index.ts`, `docs/TEST_STRATEGY.md` and coverage contracts | exact configured 100% statement/branch/function/line gates; no broad credential/security V8-ignore contract | current protected-main CI remains observation-scoped | Implemented on protected main |
| Patch-validator image supply chain | issue #66 + protected implementation | `Dockerfile.patch-validator`, image workflow, validator runtime/profile, SBOM/scanner/receipt validators | exact build/runtime/smoke/SBOM/vulnerability/receipt/final-head verification | protected-main operational receipt and later publication/signing/activation evidence | Source/runtime/supply-chain implementation is integrated on protected main; later operational/publication authority remains separate |
| Licensing/IP authority | licensing/IP contract | rights/evidence validators | duplicate-key/UTF-8/exact-artifact and rights-metadata tests | owner/legal grant and transfer evidence | Technical controls exist; legal authority external |
| Release/acquisition readiness | release/provenance/acquisition contracts | release verification and evidence scripts, digest-bound revenue/transfer source documents | exact-source package/SBOM/provenance/readiness and retained-source byte-integrity tests | immutable release/deployment/customer/revenue/legal authority | Technical byte binding implemented; commercial/legal authenticity remains external |
| External Claude plugin admission | ADR 0015 + issue #545 + FR-022 | `src/tool-capability/external-extension-admission.ts` local fail-closed port/ACL | external-extension suites covering mutable source, catalog mismatch, forged receipts, independent Policy / Approval, pilot ceiling, activation provenance, activation→invocation chronology, expiry/rollback, catalog drift, replay, instruction promotion, product-runtime wrappers, and secret/product/reasoning receipts | immutable `context-graph-contracts` artifact contract, AppGuardrail successor evidence, isolation/egress operation, measured pilots | Implemented on protected main as admission boundary; later shared-contract/pilot evidence remains separate |
| External-extension lifecycle State / Checkpoint evidence | ADR 0015 + issue #561 | protected `src/tool-capability/external-extension-lifecycle-store.ts`, lifecycle evidence/runtime binding and private operability projection; foreign owners remain reference/digest authorities | hostile lifecycle suites covering legal edges, exact replay/conflict, expected-version/head CAS, restart/audit integrity, >128 retention, projection-tail integrity, transaction replay races, activation evidence races, Policy / Approval/effective-scope drift and storage projection validation | actual Durable Object p95/contention/storage-growth/recovery; immutable owner-issued activation authority; immutable release/deployment/pilot evidence | Implemented on protected main; ADR remains Proposed and operational evidence is not inferred from source/unit tests |
| Procedural graph advisory runtime | Proposed ADR 0017 + issue #584 | protected graph/session/screening/lifecycle surfaces, `procedural-evaluation-authority.ts`, `procedural-evaluation-handoff.ts`, and State / Checkpoint bounded evaluation/rejection history | hostile schema/accessor/proxy/resource-limit tests; graph/session provenance; paired holdout and exact receipt identities; evaluation-envelope binding; P-256 signed-handoff verification; canonical signature transport; expiry-at-consumption; stable signed-claim handoff identity; history CAS/replay/digest-chain/restart/capacity evidence; `activationAuthorized: false` | live owner/Keyverse trust selection and credential custody; non-workflow current-lifecycle/revocation authority; Policy / Approval CAS; deployed history/workflow-state compatibility and p95; immutable released cross-service contract; graph publication, canary/rollback and production outcome evidence | Implemented on protected main with bounded durable evaluation/rejection history; graph activation remains explicitly unauthorized |

## 3. Live governance traceability

The repository has previously observed organization-owned ruleset `18794436`, `CWL Noema central security scan`, requiring the central `.github/workflows/security-scan.yml` on the default branch. That observation is not evergreen authority: live ruleset state and the central workflow revision must be refetched before merge classification.

Even when the required workflow is observed, it proves only that required-workflow control. It does **not** prove stronger target policy for pull-request requirements, independent approvals, stale-review dismissal, review-thread resolution, required named statuses, strict latest-base checks, non-fast-forward protection, or deletion protection.

Issue #27 owns desired governance closure. Repository source can encode audit logic and historical observations, but it cannot promote desired governance into live authority.

## 4. Current open-owner map

Historical or integrated PR numbers are deliberately omitted from current ownership. Active PR identity belongs to live GitHub state and must be refetched rather than frozen into canonical prose.

| Workstream | Current owner | Evidence boundary |
| --- | --- | --- |
| Main governance closure | issue #27 | Live ruleset / repository governance evidence; source audit logic is not the policy itself. |
| External Maintainer/Reviewer App identity | issues #29 / #227 | Installation, key custody/rotation, permissions, reviewer eligibility, and publication identity require current external evidence. |
| Patch-validator operational/publication proof | issue #66 | Source/image verification is integrated; protected-main operational receipt and later publication/signing/attestation/activation remain distinct authorities. |
| Authentic production KPI evidence | issue #3 | Requires real production-window data; repository fixtures or synthetic evidence cannot satisfy it. |
| Acquisition coordination | issue #5 | Coordinates evidence families without promoting earlier evidence into buyer/legal/commercial authority. |
| External Claude plugin admission | issue #545 | Local fail-closed Tool / Capability port only; marketplace installation, Anthropic review, isolation runtime, and shared-contract GA remain separate authorities. |
| External-extension lifecycle persistence | issue #561 | Noema owns lifecycle State / Checkpoint / Recovery evidence; Policy / Approval plus AppGuardrail/quarantine/Egress/identity/model-routing authorities remain separate and are retained only as immutable references/digests. |
| Procedural graph advisory runtime | issue #584 | Noema owns bounded execution-local advisory graph/session mechanics, deterministic candidate screening, exact evaluation-envelope/authenticated handoff binding, and bounded durable evaluation/rejection history under State / Checkpoint. Released wire contracts, live signer trust/key custody, enterprise adoption, model routing, non-workflow current lifecycle/revocation, Policy / Approval, graph-domain truth and canary/rollback evidence remain with their canonical owners. |

Canonical architecture/documentation is code-current by revision and is not owned by a historical documentation PR. Transient queue/green states belong to observation-scoped evidence, not timeless architecture claims.

## 5. Coverage truth traceability — issue #84

The historical broad V8-exclusion gap is **superseded protected-source history**, not a current implementation gap. Issue #84 is closed; the durable invariant remains:

```text
owned credential/security production code
→ ordinary configured coverage collection
→ realistic public/runtime test paths
→ exact 100% statement/branch/function/line gate
→ broad V8-ignore introduction = regression
```

The bounded coverage/security slices that removed the broad exclusions are historical implementation lineage. Their predecessor checks do not become current evidence after source changes. Canonical documentation records the surviving invariant rather than retaining obsolete active-PR ownership.

## 6. Delegated credential capability traceability — closed issue #111

Protected maintenance workflows mint short-lived GitHub App credentials late, then write the credential to an owner-only capability file and expose only its path, such as `NOEMA_MAINTAINER_TOKEN_PATH`, to credential-bearing scripts. The delegated-token helper requires a regular file owned by the current UID with exact `0600` permissions, rejects symlinks and file-identity races, bounds and validates token content, and constructs the minimal child environment containing `GH_TOKEN`/`GITHUB_TOKEN` only at the final GitHub client boundary.

The executable contract is covered by `test/github-credential-capability-ingress.test.ts`, `test/hourly-commercial-readiness-credential-ingress.test.ts`, `test/maintainer-app-token-capability.test.ts`, `test/actions-runner-assignment-token-capability.test.ts`, and `test/production-environment-governance-token-capability.test.ts`. Script credential sources do not inherit ambient parent-process secrets. External App installation, key custody, rotation, and live repository permission evidence remain separate operational authority.

**Issue #111 is closed.** Protected #421 reconciled `AGENTS.md` with the already-shipped narrow bootstrap contract: a pinned GitHub App token action may use one short-lived installation token as bootstrap transport into a fresh owner-only capability file, after which the secret environment value is unset and runtime scripts receive only the capability path. This does not authorize long-lived provider keys, App private keys, PATs, model credentials, or arbitrary environment-secret reads. Remaining live identity/configuration evidence belongs to #29 and #227 and must not be inferred from source.

## 7. Patch-validator image traceability

```text
protected source containing patch-validator implementation
→ exact protected/source revision
→ exact checkout and live-head refusal
→ static Node image build
→ runtime identity / no-network non-root smoke
→ SBOM and vulnerability evidence
→ exact image/source/receipt binding
→ final live-head refusal
→ terminal dedicated image workflow
→ protected-main operational receipt
→ separate registry publication/signing/attestation/activation evidence
```

The patch-validator image/runtime/supply-chain source family is integrated. Standard CI/reviewer/Security evidence still cannot substitute for the dedicated image-verification stages on a revision that changes that family, and integrated source does not fabricate later registry/publication or operational evidence.

## 8. Documentation maturity rules

Use only these evidence-bound labels in canonical prose:

- **Implemented on protected main** — source is on current protected main and its required source-level evidence is established;
- **Implemented on active PR / In review** — behavior exists only on a current open head;
- **Accepted architecture** — a durable decision is accepted but may not yet be implemented;
- **Planned** — no implementation claim;
- **External evidence** — authority is observed outside Noema source and must be revalidated from the owning live system before use;
- **Research only** — evidence informs design but is not product behavior;
- **Superseded** — retained for history, not current authority;
- **Out of scope** — explicitly not owned.

Never use an old SHA or closed PR as current proof merely because a historical document still names it.

## 9. Review and merge traceability

```text
pull_request_snapshot
→ exact source_revision
→ current live_base_revision
→ check_evidence / status_evidence / security_evidence
→ review_evidence
→ live governance
→ merge authority
```

`COMMENTED`, model output, status/check text, author activity, dismissed/stale review, or predecessor-head approval is not qualifying independent approval by inference. Conversely, if live policy does not require counted approval, documentation must not invent a stricter merge gate.

## 10. Failure and owner-boundary traceability

For any failed gate:

1. bind the failure to exact repository/head/base/run/job/check identity;
2. identify the first causal boundary and a falsifiable hypothesis;
3. determine the real owner;
4. if Noema owns it, write a realistic RED regression and apply the smallest causal repair;
5. if a dedicated dependency owns it, do not mutate foreign source—advance the existing owner task/PR/check path when authorized;
6. rerun/regenerate Noema evidence after the owner repair integrates;
7. rotate to another safe Noema lane while waiting.

A handoff or blocker report is not completion.

## 11. Release / deployment / acquisition traceability

```text
exact protected source
→ release verification
→ package + SBOM + provenance + reproducibility
→ owner/legal licensing decision and exact rights evidence
→ immutable release publication
→ protected deployment / rollback / recovery evidence
→ production smoke and service evidence
→ customer/revenue/transfer evidence where material
→ acquisition audit
```

Noema must fail closed rather than invent any absent later-stage evidence.

## 12. External-extension lifecycle traceability

```text
exact admitted source/artifact identity
→ Noema Policy / Approval + effective-scope identity
→ immutable AppGuardrail / quarantine / isolation / Egress references
→ legal lifecycle edge
→ request/event digest
→ expected-version + state + prior-head CAS
→ append-only event + compact current projection
→ O(1) current-tail verification
→ complete audit/recovery prefix verification
→ protected source integration
→ actual Durable Object latency/contention/growth/recovery evidence
→ immutable release/deployment/pilot evidence
```

The compact projection is latency-oriented Noema State / Checkpoint authority; it does not replace the audit log. The full audit path proves retained prefix continuity and catches truncation/reordering/tamper. A genuinely new `active` append must re-read current Policy / Approval and owner evidence. An exact transition already committed is historical evidence and may replay after later authority drift only when its stored request/event/head/tail bindings verify. A replay or projection result never grants AppGuardrail scanner truth, quarantine execution truth, Egress policy truth, Keyverse secret identity, contextual-orchestrator provider routing, or consumer-product domain truth to Noema.

## 13. Procedural graph advisory traceability

```text
strict tenant/task/graph input
→ canonical immutable graph + local structure/content digest
→ module-admitted execution-pinned session
→ caller acquires fresh authenticated same-execution lifecycle snapshot
→ running-only bounded directed neighborhood or explicit suppression/abstention
→ paired held-out baseline/candidate/context evidence
→ leakage/completeness/score/safety/non-regression screening
→ process-local admitted candidate decision, activationAuthorized: false
→ exact evaluation-receipt identities + canonical evaluation envelope
→ separately trusted P-256 signed evaluator handoff verification
→ stable signed-claim handoff identity + expiry-at-consumption
→ bounded durable evaluation/rejection history under State / Checkpoint
→ Policy / Approval boundary; no source-level activation grant
→ later live trust selection + current-lifecycle revocation + graph publication/canary/rollback evidence
→ immutable released-contract and production outcome evidence owned by their canonical owners
```

Protected signed-handoff verification authenticates the supplied evaluator assertion against the public key and signer key id selected by the composition root, binds it to the exact evaluation envelope and bounded validity interval, rejects noncanonical signature transport, and re-checks expiry when process-local evidence is consumed. The stable handoff identity is derived from the signed claim semantics rather than the ECDSA signature instance. Protected #597 then retains bounded durable evaluation/rejection history under State / Checkpoint, binding admitted graph/evaluation/authenticated signed-claim identities and minimized rejection evidence with monotonic CAS, exact replay, digest-chain integrity, duplicate-handoff refusal, restart reconstruction, and fail-closed bounded capacity.

Neither the verified handoff nor the retained history establishes live signer trust, graph publication, Policy / Approval, or activation. Noema still does not discover or custody Keyverse credentials, prove that a caller-cached lifecycle snapshot is current, grant tools, publish a cross-language contract, or own product-domain outcome truth. `context-graph-contracts` owns any released cross-service schema; `enterprise-architecture-core` owns enterprise adoption/decision records; `contextual-orchestrator` owns model discovery/routing; Keyverse/owner composition owns identity/key custody and live signer selection; the consuming product owns graph content and outcome truth. Any future activation path must add current-lifecycle/revocation and Policy / Approval authorities explicitly rather than inferring them from `eligibleForApproval`, a graph/evaluation digest, a verified handoff, retained history, or a supplied `running` snapshot.

## 14. Update rule

After every material product, governance, persistence, stack, release, or operational change:

1. refetch protected main, open PRs/issues, live rulesets, exact-head runs, reviews, and release state;
2. separate protected, active-PR, external, planned, and superseded evidence;
3. update the single canonical graph on its current owner branch;
4. remove stale owner tables and obsolete SHAs rather than accumulating them;
5. keep transient check conclusions out of timeless claims unless explicitly observation-scoped;
6. convert any newly discovered executable defect to its real source/test/API/operator owner before considering the documentation refresh complete.
