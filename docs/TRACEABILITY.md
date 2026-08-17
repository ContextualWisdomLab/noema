# Noema Requirements and Evidence Traceability

## Purpose

This document maps requirements and architecture decisions to executable Noema surfaces and to the evidence that can legitimately prove them. File presence, PR prose, model output, queued checks, or predecessor results are never promoted into implementation, approval, merge, release, deployment, or acquisition authority.

Current protected-main reference for this refresh: `965939e305f5addc5bfca3001b901b9cac5863df`.

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
| Workflow/repository authority | Runtime threat model and protected Worker contract | configured exact workflow-ref and repository-owner validation plus cryptographic OIDC verification | issuer/audience/repository/ref and hostile-token tests | current central workflow/deployment binding evidence | Implemented family; do not invent a separate SHA binding that protected runtime does not expose |
| Fail-closed outbound GitHub boundary | Architecture + security docs | outbound fetch/request/response validation | origin/redirect/timeout/body/schema tests | production telemetry/incident evidence | Implemented family |
| Distributed rate/replay state | Architecture data boundary | Durable Object rate/replay state | concurrency/alarm/replay tests | deployed binding/storage evidence | Implemented family |
| Exact head + current live base | ADR-0003 | CI and evidence collectors | exact-checkout/live-base/predecessor separation tests | current PR and protected-main runs | Implemented family; each run must re-prove freshness |
| Evidence channel separation | ADR-0001 | checks/statuses/reviews/scanners/readiness scripts | collision/stale/predecessor/synthetic evidence tests | current GitHub evidence | Implemented family |
| Safe repository writes | ADR-0004/0008 | bounded conditional ref/blob/PR operations | stale/ref/lease/cleanup tests | concurrent-writer exercise | Implemented/proposed depending on surface |
| Work-conserving continuation | ADR-0002/0009 | scheduler contract and repository-owned execution policy | continuation/remediation contracts | actual multi-lane run evidence | Process contract; external scheduler state remains separate |
| Canonical documentation graph | PRD/TRD/Architecture/ADRs/UML/ERD/Test Strategy/Operability/Traceability | PR #71 | documentation architecture/fitness contracts | protected merge + protected-main discoverability | In review on #71 |
| Main governance current truth | ADR-0011 + issue #27 | `scripts/main-governance-audit.mjs`, `scripts/lib/main-governance-audit.mjs`; PR #412 | target-policy failures + observed-workflow evidence tests | actual live ruleset | Active enhancement on #412; live governance remains weaker than target |
| Machine-readable HTTP API | protected API contract | `openapi.json` | OpenAPI/documentation contract tests plus runtime route tests | deployed endpoint compatibility evidence | Implemented on protected main |
| Credential/security coverage truth | Test Strategy + issue #84 | protected `src/index.ts` and coverage contracts | exact configured 100% statement/branch/function/line gates; no broad credential/security V8-ignore contract | protected-main documentation/coverage proof after #71 | Source repaired on protected main; canonical docs in review |
| Patch-validator image supply chain | issue #66 / PR #407 | `Dockerfile.patch-validator`, image workflow and validator evidence | exact build/runtime/smoke/SBOM/vulnerability/receipt/final-head verification | terminal exact-head image workflow; later publication/signing/activation evidence | In review on #407 |
| Licensing/IP authority | licensing/IP contract | rights/evidence validators | duplicate-key/UTF-8/exact-artifact and rights-metadata tests | owner/legal grant and transfer evidence | Technical controls exist; legal authority external |
| Release/acquisition readiness | release/provenance/acquisition contracts | release verification and evidence scripts | exact-source package/SBOM/provenance/readiness tests | immutable release/deployment/customer/revenue/legal evidence | Incomplete; no readiness claim from docs alone |

## 3. Live governance traceability

During this refresh, the active Noema ruleset is organization-owned ruleset `18794436`, `CWL Noema central security scan`. It requires `.github/workflows/security-scan.yml` from the central repository on the default branch and has no bypass actor in the observed rule detail.

This observation proves only that required-workflow control. It does **not** prove the stronger target policy for pull-request requirements, independent approvals, stale-review dismissal, review-thread resolution, required named statuses, strict latest-base checks, non-fast-forward protection, or deletion protection.

Issue #27 owns the desired governance closure. PR #412 preserves the current control identity under `observed_controls.required_workflows` while leaving missing target controls as FAIL. Fresh #412 workflow runs are queued at this observation, so they are not passing evidence.

## 4. Current open-owner map

Historical PR numbers are deliberately omitted unless they are still open and materially relevant.

| Workstream | Current owner | Evidence boundary |
| --- | --- | --- |
| Canonical architecture/documentation | PR #71 | Current owner of the canonical graph. Its application CI is failing on stale documentation-contract assertions; reviewer-ci and Security Scan success do not override that failure. |
| Governance observed-vs-target evidence | issue #27 / PR #412 | Current exact-head application/reviewer/Security workflows are queued; queued evidence is non-passing. |
| Validator image verification | issue #66 / PR #407 | Current application/reviewer/Security/image workflows are queued or pending; no current run is promoted to PASS before terminal evidence. |
| Buyer/operator root README | PR #413 | Separate Draft owner for root README/operator-facing copy; canonical architecture tests must not race it by requiring unmerged root-README wording. |
| Historical validator-image stack | PR #67 | Stale predecessor retained only until #407 integration and unique-delta preservation/supersession are proven. |

A future update must refetch open PRs/issues before changing this table. Transient queue/green states belong to observation-scoped evidence, not timeless architecture claims.

## 5. Coverage truth traceability — issue #84

The historical broad V8-exclusion gap is **superseded protected-source history**, not a current implementation gap. The durable invariant is now:

```text
owned credential/security production code
→ ordinary configured coverage collection
→ realistic public/runtime test paths
→ exact 100% statement/branch/function/line gate
→ broad V8-ignore introduction = regression
```

The bounded coverage/security slices that removed the broad exclusions are historical implementation lineage. Their predecessor checks do not become current evidence after source changes. Canonical documentation must state only the surviving invariant, not keep old active-PR ownership tables alive.

Issue #84 remains open only for canonical documentation integration and post-merge protected-main documentation/coverage proof. Source code should not be modified again merely to close a documentation checkbox unless a new executable defect is independently verified.

## 6. Patch-validator image traceability

```text
protected main
→ current #407 exact head
→ exact checkout and live-head refusal
→ static Node image build
→ runtime identity / no-network non-root smoke
→ SBOM and vulnerability evidence
→ exact image/source/receipt binding
→ final live-head refusal
→ terminal dedicated image workflow
→ protected integration
→ separate registry publication/signing/attestation/activation evidence
```

Standard CI/reviewer/Security evidence cannot skip the dedicated image-verification stages. PR #67's old checks and review state are predecessor evidence only.

## 7. Documentation maturity rules

Use only these evidence-bound labels in canonical prose:

- **Implemented on protected main** — source is on current protected main and its required source-level evidence is established;
- **Implemented on active PR / In review** — behavior exists only on a current open head;
- **Accepted architecture** — a durable decision is accepted but may not yet be implemented;
- **Planned** — no implementation claim;
- **Research only** — evidence informs design but is not product behavior;
- **Superseded** — retained for history, not current authority;
- **Out of scope** — explicitly not owned.

Never use an old SHA or closed PR as current proof merely because a historical document still names it.

## 8. Review and merge traceability

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

## 9. Failure and owner-boundary traceability

For any failed gate:

1. bind the failure to exact repository/head/base/run/job/check identity;
2. identify the first causal boundary and a falsifiable hypothesis;
3. determine the real owner;
4. if Noema owns it, write a realistic RED regression and apply the smallest causal repair;
5. if a dedicated dependency owns it, do not mutate foreign source—advance the existing owner task/PR/check path when authorized;
6. rerun/regenerate Noema evidence after the owner repair integrates;
7. rotate to another safe Noema lane while waiting.

A handoff or blocker report is not completion.

## 10. Release / deployment / acquisition traceability

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

## 11. Update rule

After every material product, governance, persistence, stack, release, or operational change:

1. refetch protected main, open PRs/issues, live rulesets, exact-head runs, reviews, and release state;
2. separate protected, active-PR, external, planned, and superseded evidence;
3. update the single canonical graph on its current owner branch;
4. remove stale owner tables and obsolete SHAs rather than accumulating them;
5. keep transient check conclusions out of timeless claims unless explicitly observation-scoped;
6. convert any newly discovered executable defect to its real source/test/API/operator owner before considering the documentation refresh complete.
