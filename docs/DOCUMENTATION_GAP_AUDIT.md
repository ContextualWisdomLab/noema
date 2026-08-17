# Noema Documentation Gap Audit

- **Audit date:** 2026-08-17
- **Protected `main` observed:** `965939e305f5addc5bfca3001b901b9cac5863df`.
- **Canonical documentation owner:** PR #71.
- **Audit state:** In review. This document is not protected-main truth until #71 integrates.

## Baseline verdict

### Design sufficiency

**DESIGN_SUFFICIENT: PASS / In review.** The canonical graph covers product requirements, technical requirements, architecture, ADRs, UML, conceptual/logical data model, API/security boundaries, test strategy, operability, release/provenance, licensing/IP transfer, and requirement-to-evidence traceability. Additional parallel architecture documents are not required merely to increase document count.

### Protected-main operational sufficiency

**PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT: FAIL CLOSED / incomplete.** Documentation completeness does not prove live governance, reviewer eligibility, App provisioning, deployment, release, customer/revenue evidence, or legal transfer authority. Those claims require their own current evidence.

## Current protected-source truth

Protected `main` already contains bounded source and contract repairs that older versions of this audit described as active PR work. In particular:

- issue #84's credential-exchange coverage defect is repaired in protected source: `src/index.ts` no longer relies on broad V8 ignore regions for the security-critical exchange path, and exact configured statement/branch/function/line coverage remains the acceptance target;
- `openapi.json` is a protected **OpenAPI 3.1** machine-readable HTTP contract rather than an active-PR-only proposal;
- the protected LLM-facing documentation now locks the post-cutover `contextual-orchestrator` gateway contract and rejects reintroduction of retired direct/sequential model candidates through #414;
- historical dependency and replay/source-repair stacks must not be treated as current merely because old PR numbers still appear in predecessor documentation;
- current repository governance evidence must be read from live GitHub policy, not from stale prose.

The current live Noema ruleset observed during this refresh is organization-owned ruleset `18794436` (`CWL Noema central security scan`). It applies to the default branch and requires `.github/workflows/security-scan.yml@refs/heads/main` from the central repository. This is **observed current control evidence**, not proof that the stronger desired pull-request/review/status/non-fast-forward/deletion policy is live. Issue #27 remains the target-governance owner; PR #412 is the current Noema source line that records observed required-workflow identity separately from missing target controls.

## Current open work ownership

Only the following open PR families were observed during this refresh; this table is intentionally small so historical closed work is not promoted back into current ownership.

| Workstream | Current owner | Current boundary |
| --- | --- | --- |
| Canonical documentation graph | PR #71 | Current owner of PRD/TRD/Architecture/ADR/UML/ERD/Test Strategy/Operability/licensing/traceability. Exact-head application CI currently fails on stale documentation-contract assertions that still encode historical non-owned protected files; those assertions must be repaired on this branch. |
| Main-governance evidence truth | issue #27 / PR #412 | Records the exact live required-workflow identity while retaining FAIL for stronger target controls that are not live. Fresh exact-head workflows are queued and therefore non-passing. |
| Patch-validator image verification | issue #66 / PR #407 | Restacked onto current main. Fresh application/reviewer/Security/image workflows are queued or pending; none of that current evidence is promoted to PASS until terminal. |
| Buyer/operator root README | PR #413 | Separate Draft owner for root README/operator-facing copy. PR #71 must not race it or make canonical architecture tests depend on its unmerged root-README wording. |
| Historical validator-image predecessor | PR #67 | Stale predecessor. Do not merge or close until #407 integrates and unique semantic preservation/supersession is proven. |

Every run must refetch these identities. This table is navigation, not immutable authority.

## Documentation family scorecard

| Family | Canonical source | Current assessment |
| --- | --- | --- |
| Product requirements | `docs/PRD.md` | Adequate design; implemented/planned/external maturity must remain evidence-bound. |
| Technical requirements | `docs/TRD.md` | Adequate design; exact-head/live-base/authority/evidence separation remains required. |
| Architecture | `ARCHITECTURE.md` | Canonical proposed architecture on #71 until protected merge. |
| ADR lifecycle | `docs/adr/` | Status-bearing decisions are canonical; Accepted/Implemented labels require protected evidence. |
| UML | `docs/UML.md` | Component, sequence, state, authority and deployment views are present. |
| Data model / ERD | `docs/ERD.md` | Correctly conceptual/logical where Noema owns no relational evidence database; Durable Object persistence is not fabricated as SQL. |
| API/schema contracts | `openapi.json`, repository API docs and executable contracts | OpenAPI 3.1 is protected-source truth; prose contracts must reflect protected runtime exactly. |
| Security/threat model | runtime and automation threat models | Design substantial; live operational controls remain independent evidence. |
| Test strategy | `docs/TEST_STRATEGY.md` | Updated for issue #84's repaired coverage truth; broad V8 exclusion is a regression, not an open protected-source gap. |
| Operability/recovery | `docs/OPERABILITY.md` | Design baseline present; production/delegated-control proof remains external where applicable. |
| Licensing/IP | `docs/LICENSING_AND_IP_TRANSFER.md` | Authority model present; no outbound license or legal transfer right is invented by automation. |
| Traceability | `docs/TRACEABILITY.md` | Must track current protected source and current owner set without freezing transient queued/green states into timeless prose. |
| Root README / CLAUDE / CHANGELOG | protected-main files or separately owned active PRs | Operational context only; PR #71 does not reintroduce historical versions merely to satisfy stale tests. |

## Active residual gaps

### G-01 — Target governance stronger than the observed required workflow

Issue #27 remains open. Current live evidence proves the central Security Scan workflow requirement but does not prove the stronger target pull-request/review/status/non-fast-forward/deletion controls. PR #412 makes this distinction machine-readable. Missing target controls remain FAIL; observed workflow evidence must never be promoted into authority it does not carry.

### G-02 — Canonical documentation integration

PR #71 is the surviving canonical documentation owner. It was converged non-destructively without reintroducing stale historical runtime/workflow/package/root-README/CLAUDE/CHANGELOG content. Its current application-CI failure is repository-owned: documentation-contract tests still assert obsolete protected SHAs, closed PR ownership, and historical non-owned file wording. Repair those tests against the canonical graph rather than regressing protected source or racing separate owners. Fresh exact-head CI/reviewer/Security evidence, protected merge, and post-merge discoverability remain required.

### G-03 — Patch-validator image operational evidence

PR #407 preserves the unique validator-image/runtime/supply-chain work on a current-main lineage. Standard gates are not sufficient to claim image readiness: the exact-head image workflow must finish build, static-runtime identity, no-network smoke, SBOM/vulnerability/inventory/receipt verification, and final stale-head proof. PR #67 remains historical until that convergence is complete.

### G-04 — Operational/environment/App/reviewer evidence

Repository code and documentation cannot fabricate external App provisioning, private-target eligibility, production environment governance, secrets, reviewer staffing, deployment or protected-main operational receipts. These remain external prerequisites only where the corresponding product path actually requires them.

### G-05 — Release/acquisition evidence

A commercial/acquisition-ready claim requires one exact integrated protected revision with applicable CI/security/coverage/documentation/package/SBOM/provenance/reproducibility/review/rollback/operational proof, followed by immutable release/deployment and buyer/legal evidence where required. No documentation file may substitute for those later evidence classes.

## Coverage truthfulness closure for issue #84

The historical statement that broad credential-exchange V8 exclusions remain on protected main is superseded. Canonical documentation now records the opposite current invariant:

1. owned production remains subject to exact configured 100% statement/branch/function/line coverage;
2. broad V8 ignore regions in credential/security code are forbidden regressions;
3. realistic public/runtime paths are preferred over exporting private helpers for coverage;
4. unreachable branches should be removed or their contracts narrowed when proven impossible rather than hidden;
5. malformed OIDC/JWKS/GitHub material must keep fail-closed error classification while remaining measured.

Issue #84 should remain open until #71 integrates and the protected-main documentation/coverage contract proves this canonical invariant from protected source. The source defect itself is no longer an open implementation gap.

## Update rule

After every material product, governance, persistence, stack, release or operational change:

1. refetch protected `main`, open PRs/issues, live rulesets, exact-head checks and reviews;
2. distinguish protected truth from active-PR, planned, external and superseded evidence;
3. update this single canonical graph rather than creating a parallel architecture authority;
4. remove obsolete PR numbers and stale SHAs rather than preserving them as if still current;
5. keep transient check states out of timeless assertions unless they are explicitly observation-scoped;
6. convert any concrete source/test/API/operator defect discovered here into its executable owner lane before treating documentation work as complete.
