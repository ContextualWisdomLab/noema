# Noema Traceability

## Status

**Proposed canonical traceability on protected-main lineage `382c78f2e9eeac4f24b3a825f192b34943e30c9a`.** Protected source and fresh external evidence override stale document claims.

## Authority rule

Each requirement is traced independently to source/test/evidence. A check, scanner, review, model verdict, merge, release, deployment, KPI result or legal/commercial record never substitutes for another evidence class.

## Core traceability matrix

| Requirement | Protected/current implementation evidence | Validation/evidence owner | Current status |
| --- | --- | --- | --- |
| Exact GitHub Actions OIDC identity before capability exchange | Worker/runtime source plus `wrangler.toml` trust configuration | application CI + runtime tests | Protected implementation |
| Distributed rate-limit state | `NoemaRateLimiter` Durable Object | rate-limit/unit/runtime tests | Protected implementation |
| Distributed replay coordination | `NoemaOidcReplayGuard` Durable Object | replay tests | Protected implementation; stricter pre-token ordering under #81/#83 is Proposed |
| Exact target/head identity before review publication | repository `central-review` workflow/control code | application/workflow tests + exact run evidence | Protected implementation |
| Separate model vs formal-review authority | review workflow + governance evaluators/docs | reviewer evidence + live rules | Protected implementation/operational evidence required |
| Deterministic Node/npm identity | package/workflow controls integrated through #91 | CI/package control tests | Protected implementation |
| Unreviewed lifecycle script fail-closed | install-script control integrated through #91 | package-manager regression | Protected implementation; issue #79 closure still requires protected acceptance bookkeeping |
| Lockfile change control | controls integrated through #91 | package-manager/lockfile tests | Protected implementation; issue #77 targeted rehearsal remains open |
| Deployment retained-byte/path integrity | implementation integrated through #121 | application CI | Protected implementation; #120 closed after protected verification |
| Strict KPI exact-byte/provenance integrity | implementation integrated through #250 | KPI regressions + protected CI | Protected implementation; real production evidence remains #3 |
| Maintainer preflight binds fresh live governance | implementation integrated through #254 | CI + future protected operational run | Protected implementation; #116 operational proof remains open |
| Central Security Scan required workflow | live org ruleset `18794436` | live ruleset + central `.github` workflow revision | Live enforced current policy; refetch before merge |
| Independent PR approval | target policy under #27/#29 | live GitHub control plane | Not currently observed as enforced; never invent requirement |
| Exact configured owned production coverage = 100% statements/branches/functions/lines | current CI coverage configuration | exact-head CI | Protected numerical gate; broad V8 exclusion truthfulness remains #84 |
| Artifact uploader uses current supported runtime | remaining v4.6.2 immutable pins | #255 test-first migration + protected workflow proof | Gap / not complete |
| Release attestation isolated from lifecycle execution | current release workflow still shares authority | #155 | Gap / not complete |
| Exact-source patch quarantine | active #93 line | exact-head CI/security/review + protected operational acceptance | Active successor; not protected truth until merged |
| Runner-assignment diagnostic | active #252 line | exact-head CI/security + protected operational exercise | Active Draft; not protected truth |
| KPI child environment least authority | active #253 line | test-first CI/security | Active Draft; not protected truth |
| Canonical architecture/data model | current-main successor branch containing Architecture/PRD/UML/ERD | fresh PR checks after graph completion | In review / incomplete until integrated |
| Private vulnerability reporting setting and exercise | #73 | live administrator/reporter evidence | External gap |
| Protected production environment | #40 | live environment governance evidence | External gap |
| >=30-day production KPI provenance | #3 | authenticated production source | External gap |
| Customer/revenue/acquisition evidence | #5 | contracts/accounting/customer records | External gap |
| Owner/legal license and IP-transfer authority | #5 / acquisition rights work | owner/legal + contributor evidence | External gap; automation chooses no license |

## Canonical document traceability

| Document | Purpose | Current-main successor state |
| --- | --- | --- |
| `ARCHITECTURE.md` | runtime/topology/trust and authority planes | Added on clean current-main successor |
| `docs/PRD.md` | product requirements/current-vs-proposed truth | Added on clean current-main successor |
| `docs/TRD.md` | technical requirements | Still required on current-main successor |
| `docs/UML.md` | component/sequence/state/deployment views | Added on clean current-main successor |
| `docs/ERD.md` | conceptual/logical persistence/evidence model | Added; explicitly no invented physical DB |
| `docs/TEST_STRATEGY.md` | realistic validation/coverage policy | Still required on current-main successor |
| `docs/OPERABILITY.md` | activation/incident/recovery/evidence | Still required on current-main successor |
| `docs/LICENSING_AND_IP_TRANSFER.md` | legal authority/NOTICE/transfer boundary | Still required; no outbound license decision |
| `docs/adr/` | status-bearing durable decisions | Existing stale lineage must be selectively converged, not copied wholesale |
| `SECURITY.md` + threat models | runtime/automation/security boundaries | Protected existing docs; canonical reconciliation still required |
| `README.md` / `CLAUDE.md` / `AGENTS.md` / `CHANGELOG.md` | operator/developer/current change surfaces | Protected existing files; update only after bounded current-main reconciliation |

## Evidence-stage traceability

Every feature or claim follows these separate stages:

1. source implementation on an exact branch head;
2. exact-head application/security/review evidence;
3. protected merge under live governance;
4. protected-main operational acceptance;
5. immutable release evidence;
6. production deployment/environment evidence;
7. production/commercial/legal/acquisition evidence.

An earlier stage must never be cited as proof of a later stage.

## Current protected-main verification snapshot

For protected `main` `382c78f2e9eeac4f24b3a825f192b34943e30c9a`, the latest verified CI evidence observed during this convergence passed the complete repository suite and exact configured 100% owned coverage with zero package-audit findings. Scheduled readiness/acquisition audits execute successfully as monitors while intentionally retaining `NOT_READY` for missing external production/commercial evidence. This snapshot is historical as soon as main moves and must then be re-fetched.

## Traceability update rule

After a protected merge or material architecture change:

1. refetch protected source and live governance;
2. update only rows whose implementation/evidence owner actually changed;
3. keep active PR/planned truth explicitly separate;
4. retain external gaps as non-passing until independently observed;
5. never update a status merely to make the graph appear complete.
