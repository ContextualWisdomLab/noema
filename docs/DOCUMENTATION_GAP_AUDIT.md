# Noema Documentation Gap Audit

- **Audit date:** 2026-08-18
- **Protected `main` observed:** `38d2b2d1c063611c87d9a610e91f88ed89ba9fa3`.
- **Canonical documentation status:** integrated on protected main.
- **Audit state:** Protected-main documentation truth; operational and external evidence remain separately revalidated.

## Baseline verdict

### Design sufficiency

**DESIGN_SUFFICIENT: PASS / protected.** The canonical graph covers product requirements, technical requirements, architecture, ADRs, UML, conceptual/logical data model, API/security boundaries, test strategy, operability, release/provenance, licensing/IP transfer, and requirement-to-evidence traceability. Additional parallel architecture documents are not required merely to increase document count.

### Protected-main operational sufficiency

**PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT: FAIL CLOSED / incomplete.** Documentation completeness does not prove live governance, reviewer eligibility, App provisioning, deployment, release, customer/revenue evidence, or legal transfer authority. Those claims require their own current evidence.

## Current protected-source truth

Protected `main` contains bounded source and documentation repairs that older versions of this audit described as active work:

- issue #84's credential-exchange coverage defect is repaired and closed: the security-critical exchange path no longer relies on broad V8-ignore regions, and exact configured statement/branch/function/line coverage remains the acceptance target;
- `openapi.json` is a protected **OpenAPI 3.1** machine-readable HTTP contract;
- the LLM-facing contract uses the `contextual-orchestrator` gateway and does not restore retired direct/sequential model candidates;
- customer-facing root README plus contributor/agent procedure relocation are protected-main truth;
- readiness/operator documentation, including the public `/ready` contract and acquisition-surveillance semantics, is protected-main truth;
- the canonical PRD/TRD/Architecture/ADR/UML/ERD/Test Strategy/Operability/licensing/traceability graph is protected-main truth rather than an active documentation PR;
- historical dependency, workflow-trust and validator-image predecessor PRs must not be treated as current solely because old PR numbers remain in history;
- current repository governance evidence must be read from live GitHub policy, not from stale prose.

The current live Noema ruleset observed during this refresh is organization-owned ruleset `18794436` (`CWL Noema central security scan`). It applies to the default branch and requires `.github/workflows/security-scan.yml@refs/heads/main` from the central repository. This is **observed current control evidence**, not proof that stronger desired pull-request/review/status/non-fast-forward/deletion policy is live. Issue #27 remains the target-governance owner.

## Current open work ownership

Only the following current work families are material to this audit. This table is intentionally small so closed work is not promoted back into current ownership.

| Workstream | Current owner | Current boundary |
| --- | --- | --- |
| Canonical architecture/documentation | protected main | PRD/TRD/Architecture/ADR/UML/ERD/Test Strategy/Operability/licensing/traceability are integrated; operational/external evidence remains separate. |
| Patch-validator image verification | issue #66 / PR #407 | Restacked onto current protected main. Standard and dedicated image workflows must pass on one unchanged exact head before integration. |
| Historical validator-image predecessor | PR #67 | Stale predecessor. Do not merge or close until #407 integrates and unique semantic preservation/supersession is proven. |

Every run must refetch these identities. This table is navigation, not immutable authority.

## Documentation family scorecard

| Family | Canonical source | Current assessment |
| --- | --- | --- |
| Product requirements | `docs/PRD.md` | Protected canonical design; implemented/planned/external maturity must remain evidence-bound. |
| Technical requirements | `docs/TRD.md` | Protected canonical design; exact-head/live-base/authority/evidence separation remains required. |
| Architecture | `ARCHITECTURE.md` | Protected canonical architecture; later implementation still needs its own evidence. |
| ADR lifecycle | `docs/adr/` | Status-bearing decisions are canonical; Accepted/Implemented labels require protected evidence. |
| UML | `docs/UML.md` | Component, sequence, state, authority and deployment views are present. |
| Data model / ERD | `docs/ERD.md` | Conceptual/logical where Noema owns no relational evidence database; Durable Object persistence is not fabricated as SQL. |
| API/schema contracts | `openapi.json`, repository API docs and executable contracts | OpenAPI 3.1 and protected readiness/operator docs are current protected truth. |
| Security/threat model | runtime and automation threat models | Design substantial; live operational controls remain independent evidence. |
| Test strategy | `docs/TEST_STRATEGY.md` | Issue #84's repaired coverage truth is protected; broad V8 exclusion is a regression, not an open protected-source gap. |
| Operability/recovery | `docs/OPERABILITY.md` | Design baseline present; production/delegated-control proof remains external where applicable. |
| Licensing/IP | `docs/LICENSING_AND_IP_TRANSFER.md` | Authority model present; no outbound license or legal transfer right is invented by automation. |
| Traceability | `docs/TRACEABILITY.md` | Tracks current protected source and current owner set without freezing transient queued/green states into timeless prose. |
| Root README / contributor procedure | protected-main `README.md`, `CONTRIBUTING.md`, `docs/development/` | Integrated protected truth. |
| Readiness/operator documentation | protected-main API/deployment/onboarding/acquisition docs | Integrated protected truth. |

## Active residual gaps

### G-01 — Target governance stronger than the observed required workflow

Issue #27 remains open. Current live evidence proves the central Security Scan workflow requirement but does not prove stronger target pull-request/review/status/non-fast-forward/deletion controls. Missing target controls remain FAIL; observed workflow evidence must never be promoted into authority it does not carry.

### G-02 — Patch-validator image operational evidence

PR #407 preserves the unique validator-image/runtime/supply-chain work on a current-main lineage. Standard gates are not sufficient to claim image readiness: the exact-head image workflow must finish build, static-runtime identity, no-network smoke, SBOM/vulnerability/inventory/receipt verification and final stale-head proof. PR #67 remains historical until that convergence is complete.

### G-03 — Operational/environment/App/reviewer evidence

Repository code and documentation cannot fabricate external App provisioning, private-target eligibility, production environment governance, secrets, reviewer staffing, deployment or protected-main operational receipts. These remain external prerequisites only where the corresponding product path actually requires them.

### G-04 — Release/acquisition evidence

A commercial/acquisition-ready claim requires one exact integrated protected revision with applicable CI/security/coverage/documentation/package/SBOM/provenance/reproducibility/review/rollback/operational proof, followed by immutable release/deployment and buyer/legal evidence where required. No documentation file may substitute for those later evidence classes.

## Coverage truthfulness closure for issue #84

The historical statement that broad credential-exchange V8 exclusions remain on protected main is superseded. Issue #84 is closed and canonical documentation records the current invariant:

1. owned production remains subject to exact configured 100% statement/branch/function/line coverage;
2. broad V8 ignore regions in credential/security code are forbidden regressions;
3. realistic public/runtime paths are preferred over exporting private helpers for coverage;
4. unreachable branches should be removed or their contracts narrowed when proven impossible rather than hidden;
5. malformed OIDC/JWKS/GitHub material must keep fail-closed error classification while remaining measured.

The source defect itself is no longer an open implementation gap. Any future recurrence is a new executable defect, not a reason to reopen stale active-PR ownership prose.

## Update rule

After every material product, governance, persistence, stack, release or operational change:

1. refetch protected `main`, open PRs/issues, live rulesets, exact-head checks and reviews;
2. distinguish protected truth from active-PR, planned, external and superseded evidence;
3. update this single canonical graph rather than creating a parallel architecture authority;
4. remove obsolete PR numbers and stale SHAs rather than preserving them as if still current;
5. keep transient check states out of timeless assertions unless they are explicitly observation-scoped;
6. convert any concrete source/test/API/operator defect discovered here into its executable owner lane before treating documentation work as complete.