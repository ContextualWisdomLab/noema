# Noema Documentation Gap Audit

- **Audit refresh:** 2026-08-24.
- **Protected `main` branch-point observed:** `270b66e592330c4f1c7d3b726779b1a6c599c70c`; this is a snapshot anchor, not evergreen authority.
- **Canonical documentation status:** code-current for the repository revision containing this file; protected authority depends on whether that revision is on protected `main`.
- **Audit state:** design/documentation truth is separated from operational, governance, deployment, buyer, and legal evidence, all of which require their own current authority.

## Baseline verdict

### Design sufficiency

**DESIGN_SUFFICIENT: PASS / code-current.** The canonical graph covers product requirements, technical requirements, architecture, ADRs, UML, conceptual/logical data model, API/security boundaries, test strategy, operability, release/provenance, licensing/IP transfer, and requirement-to-evidence traceability. Additional parallel architecture documents are not required merely to increase document count.

### Protected-main operational sufficiency

**PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT: FAIL CLOSED / incomplete.** Documentation completeness does not prove live governance, reviewer eligibility, App provisioning, deployment, release, customer/revenue evidence, legal transfer authority, or external App installation/rotation/permission evidence. Those claims require their own current evidence.

## Current protected-source truth at the branch point

The observed protected branch point contains bounded source and documentation repairs that older versions of this audit described as active work:

- issue #84's credential-exchange coverage defect is repaired and closed: the security-critical exchange path no longer relies on broad V8-ignore regions, and exact configured statement/branch/function/line coverage remains the acceptance target;
- `openapi.json` is a protected **OpenAPI 3.1** machine-readable HTTP contract;
- the LLM-facing contract uses the `contextual-orchestrator` gateway and does not restore retired direct/sequential model candidates;
- customer-facing root README plus contributor/agent procedure relocation are protected-main truth;
- readiness/operator documentation, including the public `/ready` contract and acquisition-surveillance semantics, is protected-main truth;
- immutable GitHub Actions workflow-source SHA trust is protected source truth and `wrangler.toml` pins `ALLOWED_WORKFLOW_SHA` to a reviewed central `.github` commit; the central repository remains read-only from the Noema writer;
- the patch-validator image/runtime/supply-chain implementation is integrated on protected main; historical predecessor PR state is not current ownership;
- issue #111 is closed: protected #421 reconciles the short-lived GitHub App bootstrap environment with the owner-only capability-file policy; live Maintainer/Reviewer App identity, installation, rotation, and permission evidence remains external under #29/#227;
- current repository governance evidence must be read from live GitHub policy, not from stale prose.

The active revision containing this audit additionally hardens workflow trust configuration so operator-provided workflow-ref/SHA authority is not whitespace-normalized before validation. If this file is read on an unmerged PR head, that delta is candidate truth; if read on protected `main` after integration, it is protected truth.

A previously observed organization-owned ruleset `18794436` (`CWL Noema central security scan`) required the central Security Scan workflow on the default branch. Historical observation is not evergreen authority. Live ruleset state and the current central workflow revision must be refetched before merge classification. Issue #27 remains the target-governance owner.

## Current open work ownership

Only durable issue-family owners are kept here so integrated or superseded PR numbers do not become false current authority.

| Workstream | Current owner | Current boundary |
| --- | --- | --- |
| Canonical architecture/documentation | current repository revision | PRD/TRD/Architecture/ADR/UML/ERD/Test Strategy/Operability/licensing/traceability are one code-current graph; protected status follows revision placement. |
| Main governance closure | issue #27 | Live ruleset/repository policy is the authority; source audit logic cannot fabricate policy. |
| External Maintainer/Reviewer App identity | issues #29 / #227 | Installation, key custody/rotation, permissions, reviewer eligibility, and publication identity require live external evidence. |
| Patch-validator operational/publication proof | issue #66 | Source/image verification implementation is integrated; protected-main operational receipts and later publication/signing/attestation/activation are separate evidence classes. |
| Authentic production KPI evidence | issue #3 | Requires real production-window evidence; fixtures or synthetic data cannot satisfy it. |
| Acquisition coordination | issue #5 | Coordinates remaining evidence families without promoting source/docs into buyer/legal authority. |

Every run must refetch these identities. This table is navigation, not immutable authority.

## Documentation family scorecard

| Family | Canonical source | Current assessment |
| --- | --- | --- |
| Product requirements | `docs/PRD.md` | Canonical design; implemented/planned/external maturity must remain evidence-bound. |
| Technical requirements | `docs/TRD.md` | Canonical design; exact-head/live-base/authority/evidence separation remains required. |
| Architecture | `ARCHITECTURE.md` | Code-current architecture; protected authority follows revision placement. |
| ADR lifecycle | `docs/adr/` | Status-bearing decisions are canonical; Accepted/Implemented labels require appropriate evidence. |
| UML | `docs/UML.md` | Component, sequence, state, authority and deployment views are present. |
| Data model / ERD | `docs/ERD.md` | Conceptual/logical where Noema owns no relational evidence database; Durable Object persistence is not fabricated as SQL. |
| API/schema contracts | `openapi.json`, repository API docs and executable contracts | OpenAPI 3.1 and readiness/operator contracts are present; deployed compatibility remains separate evidence. |
| Security/threat model | runtime and automation threat models | Design substantial; live operational controls remain independent evidence. |
| Test strategy | `docs/TEST_STRATEGY.md` | Issue #84's repaired coverage invariant is protected; broad V8 exclusion is a regression, not an open protected-source gap. |
| Operability/recovery | `docs/OPERABILITY.md` | Design baseline present; production/delegated-control proof remains external where applicable. |
| Licensing/IP | `docs/LICENSING_AND_IP_TRANSFER.md` | Authority model present; no outbound license or legal transfer right is invented by automation. |
| Traceability | `docs/TRACEABILITY.md` | Tracks current evidence classes and durable owner families without freezing integrated PRs or transient check states into timeless prose. |
| Root README / contributor procedure | `README.md`, `CONTRIBUTING.md`, `docs/development/` | Integrated source truth at the observed branch point; separate active writer ownership must be respected when present. |
| Readiness/operator documentation | API/deployment/onboarding/acquisition docs | Integrated design/source truth; operational authority remains separate. |

## Active residual gaps

### G-01 — Target governance stronger than previously observed required workflow

Issue #27 remains open. A required central Security Scan workflow, when live, does not prove stronger target pull-request/review/status/non-fast-forward/deletion controls. Missing target controls remain FAIL; historical workflow evidence must never be promoted into authority it does not carry.

### G-02 — Patch-validator operational/publication evidence

The patch-validator image/runtime/supply-chain source family is integrated on protected main. The residual gap is no longer source integration or historical PR convergence. Issue #66 owns current protected-main operational receipt and later registry publication/signing/attestation/activation evidence. Standard CI/reviewer/Security success cannot fabricate those later evidence classes.

### G-03 — External Maintainer/Reviewer App and publication identity evidence

Issue #111 is closed and the repository-owned credential-source policy is reconciled. Remaining uncertainty is not a source-policy defect: #29/#227 own live Maintainer/Reviewer App installation, key custody/rotation, repository permission, reviewer eligibility, and publication identity evidence. A protected capability-file contract cannot fabricate those external facts, and their absence must not be restated as an open #111 policy gap.

### G-04 — Operational/environment/reviewer evidence

Repository code and documentation cannot fabricate production environment governance, secrets, reviewer staffing, deployment, protected-main operational receipts, or other live controls. These remain external prerequisites only where the corresponding product path actually requires them.

### G-05 — Release/acquisition evidence

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
