# Noema Product Requirements Document

## Status

**Proposed canonical PRD rebuilt on protected `main` `382c78f2e9eeac4f24b3a825f192b34943e30c9a`.** Until this branch is merged and protected-main acceptance completes, this document is not protected-main authority. Source, current workflow evidence and live governance take precedence over prose. Active PRs/issues are explicitly marked proposed or incomplete.

## Product definition

Noema is ContextualWisdomLab's independent GitHub Actions OIDC-to-GitHub-App capability broker and an evidence-oriented control plane for LLM review, repository maintenance, release/deployment verification and commercial-readiness due diligence.

The product must solve two problems simultaneously:

1. issue narrowly scoped GitHub capability only after exact, cryptographically verified workflow identity and target authorization; and
2. keep source, CI, scanner, formal review, model, merge, release, deployment and acquisition evidence separate so one green signal cannot impersonate another authority.

Noema is standalone first. Central `.github`, `contextual-orchestrator`, `naruon`, and other repositories are interoperable dependencies through explicit contracts, not Noema-owned state or implicit write surfaces.

## Users and stakeholders

- **Repository maintainer:** needs exact-head/live-base evidence and safe merge decisions without stale-state substitution.
- **Security/platform operator:** provisions GitHub Apps, OIDC trust, Cloudflare bindings, production environment, deployment and rollback.
- **Independent reviewer:** produces formal GitHub review evidence distinct from model judgement.
- **CWL service owner:** consumes Noema's API/OIDC/evidence contracts without importing internal implementation.
- **Acquisition/due-diligence reviewer:** needs reconstructable technical, operational, release, legal and commercial evidence.
- **Developer or coding agent:** needs explicit invariants, tests and status-bearing design documentation before changing credential or evidence boundaries.

## Product principles

1. **Least privilege.** Capability is scoped by repository, role, lifetime and operation.
2. **Exact identity before authority.** A moving branch name is never enough where a full commit SHA is available.
3. **Evidence is not authority.** Check, status, scanner, model, formal review, merge, release, deployment and commercial evidence are non-substitutable.
4. **Fail closed.** Missing, malformed, stale, predecessor, pending, skipped, neutral, cancelled, failed, rate-limited or ambiguous evidence is non-passing.
5. **Work conserving.** A blocked lane blocks only itself while another safe lane proceeds.
6. **No self-repair privilege escalation.** Repair/self-modifying workflows, force pushes, synthetic approvals and protection weakening are not acceptable operating mechanisms.
7. **Commercial claims require real evidence.** Repository fixtures and documentation cannot manufacture production, revenue, legal-rights or transfer facts.
8. **Current code beats stale documentation.** Protected source and live external governance are the final technical authority.

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Expose `/health` for liveness, `/ready` for credential-exchange readiness, and POST-only `/exchange` for credential exchange. |
| FR-002 | Verify GitHub Actions OIDC issuer, audience, organization/repository ownership, trusted workflow ref and immutable workflow SHA before privileged exchange. |
| FR-003 | Validate `target_repository` independently and authorize it before GitHub App installation-token creation. |
| FR-004 | Coordinate pre-auth rate limiting and OIDC replay state across Worker isolates using Durable Objects; unavailable/malformed distributed decisions fail closed. |
| FR-005 | Restrict credential-bearing egress to reviewed HTTPS destinations, request shapes, sizes, timeouts and redirect policy. |
| FR-006 | Keep inbound/issued credentials and App private material out of logs, artifacts and model context. |
| FR-007 | Resolve exact PR head and live base independently before merge or mutation decisions; revalidate immediately before writes. |
| FR-008 | Keep application checks, security scans, commit statuses, formal reviews, inline threads, model verdicts and operational evidence separate. |
| FR-009 | Collect all material pagination pages or explicitly classify evidence incomplete. |
| FR-010 | Merge only an unchanged exact head that satisfies actual live governance, applicable CI/security/package/provenance gates and zero valid unresolved findings. |
| FR-011 | Require independent non-author approval only when live policy actually requires it; never self-approve or synthesize approval. |
| FR-012 | Model-backed product development uses `NVIDIA_NIM_API_KEY`, preferably through `contextual-orchestrator`, and never `COPILOT_GITHUB_TOKEN`. |
| FR-013 | Separate model runner, uncredentialed verifier and credential-bearing publisher trust domains. |
| FR-014 | Retain bounded evidence for release, deployment, KPI, security and acquisition verification without promoting missing external facts to PASS. |
| FR-015 | Bind strict KPI provenance to exact retained bytes and fail closed on malformed/ambiguous/tampered retained evidence. |
| FR-016 | Bind release/deployment evidence to one exact source and immutable artifact identity, with rollback/recovery evidence distinct from CI. |
| FR-017 | Maintain one discoverable canonical documentation graph covering PRD/TRD/Architecture/ADR/UML/data model/API/security/testing/operability/release/licensing/traceability. |
| FR-018 | Continue the safe executable queue after a single lane blocks, including after generic scheduler/control-plane failures. |
| FR-019 | Treat inventory, RCA, tests, docs, commits, PRs and merges as intermediate artifacts whenever another safe source/review/operational action remains. |

## Non-functional requirements

### Security and privacy

- No raw bearer tokens, App private keys or provider credentials in logs/evidence.
- Untrusted JSON, UTF-8, paths, symlinks, redirects, network destinations and model material are bounded and fail closed.
- GitHub Actions are pinned to immutable revisions.
- Checkout credentials are non-persistent on evidence-only paths.
- Dependency lifecycle-script authority is explicit and fail closed.
- Retained evidence validators bind semantics to exact retained bytes when integrity matters.

### Reliability and operability

- Liveness and readiness remain distinct.
- Pending/provider/runner latency is a lane defer, not global completion.
- A workflow being assigned a runner does not prove its checks passed.
- Production deployment, rollback, smoke and KPI acceptance are retained separately from PR checks.
- Operational evidence must identify exact protected source and workflow/run identity.

### Quality and accessibility

- Owned production statements, branches, functions and lines must remain exactly 100% covered under the repository's configured gate.
- Coverage must be truthful: broad V8 ignore regions around security-critical production code are not an acceptable substitute for realistic tests. Issue #84 remains the explicit gap until safely implemented on stabilized source.
- Public TypeScript/API surfaces require meaningful documentation and deterministic inventory; stale Draft #86 remains proposed until its dependency chain is rebuilt.
- Tests prefer real `Request`/`Response`, WebCrypto, GitHub/Cloudflare contracts and adversarial fixtures over no-op mocks.

### Supply chain and reproducibility

Protected source already includes deterministic Node/npm identity, strict lifecycle-script authority and lockfile change-control lineage integrated through PR #91. Remaining GitHub Actions runtime debt is tracked separately: issue #255 requires migration of remaining immutable `actions/upload-artifact` v4.6.2 pins away from deprecated Node 20 to a reviewed Node-24-compatible immutable revision while preserving artifact semantics.

## Current protected-main truth

At protected `main` `382c78f2e9eeac4f24b3a825f192b34943e30c9a`, repository-owned truth includes:

- Cloudflare Worker OIDC/GitHub App exchange with rate-limit and replay Durable Object families;
- central review and repository maintenance/evidence workflows;
- immutable/exact package-manager and install-script control lineage integrated through PR #91;
- malformed UTF-8/path/descriptor deployment-evidence integrity integrated through PR #121;
- strict KPI exact-byte/provenance integrity integrated through PR #250;
- maintainer-readiness binding to live governance integrated through PR #254;
- exact configured 100% owned production statement/branch/function/line coverage on the latest verified protected-main CI;
- daily/scheduled readiness and acquisition audits that retain NOT_READY evidence rather than falsely claiming success when production/commercial evidence is absent.

This list is descriptive, not a substitute for a fresh source/check read.

## Active proposed/incomplete work

- **PR #252:** runner-assignment audit successor. Draft/proposed until exact-head validation and integration; not protected truth.
- **PR #253:** KPI child-environment least-authority tests. Active/proposed; not protected truth.
- **Issue #255:** remaining `upload-artifact` Node-20-runtime migration.
- **PR #71 successor work:** canonical documentation graph convergence onto current main; this branch is part of that convergence and old #71 evidence does not transfer.
- **PR #83 / issue #81:** verified replay claim before privileged token mint. Stale feature-stack lineage; rebuild only after canonical/shared-source ownership stabilizes.
- **Issue #84:** remove broad V8 coverage exclusions from credential-exchange security code after shared-source convergence.
- **PR #69 / issue #68:** acquisition-manifest/exact-release rights integrity requires a clean current-main rebuild rather than reuse of stale divergent ancestry.
- **Issue #155:** isolate dependency lifecycle execution from release attestation authority.
- **Issue #226:** workflow-registry/orphaned workflow identities; resolution requires available authoritative workflow-disable capability, not a competing repair workflow.

## External evidence that remains NOT_READY

Repository code cannot manufacture these facts:

- real >=30-day production `/exchange` KPI data and authenticated upstream provenance;
- protected production environment and deployment/change-review governance;
- immutable production release/deployment/attestation/rollback evidence;
- independent production security-validation evidence;
- customer/pilot, revenue/LOI/pipeline and support-ownership evidence;
- owner/legal outbound-license decision, contributor/IP rights and transfer evidence.

Missing items remain fail closed in acquisition/readiness classification. No outbound license is selected by this PRD or automation.

## Evidence-stage model

A capability or claim progresses through independent stages:

1. bounded implementation exists on an active branch;
2. exact-head application/security/review evidence exists;
3. protected merge completes under live governance;
4. protected-main operational acceptance succeeds;
5. immutable release evidence exists;
6. production deployment/environment evidence exists;
7. commercial/legal/acquisition evidence exists.

An earlier stage never proves a later one.

## Product acceptance

Noema reaches defensible commercial/acquisition readiness only when all of the following are simultaneously true and current:

- canonical docs match protected source and active planned work;
- exact-head/live-base/check/scanner/review/governance semantics are executable and fail closed;
- exact 100% owned coverage remains truthful after broad unjustified exclusions are removed;
- security/privacy/package/SBOM/provenance gates pass without waiver;
- Maintainer/Reviewer/model/deployment identities are separated and operationally proven;
- protected-main acceptance follows protected merges;
- immutable release and production deployment evidence bind one exact source;
- production KPI and observability evidence meet the required window/provenance contract;
- customer/revenue/legal/IP/transfer evidence exists independently of repository assertions.

## Related canonical authority

- `ARCHITECTURE.md`
- `docs/TRD.md`
- `docs/UML.md`
- `docs/ERD.md`
- `docs/adr/`
- `SECURITY.md`, `docs/threat-model.md`, `docs/automation-threat-model.md`
- `docs/TEST_STRATEGY.md`
- `docs/OPERABILITY.md`
- release/deployment/provenance documentation
- `docs/LICENSING_AND_IP_TRANSFER.md`
- `docs/TRACEABILITY.md`
- `README.md`, `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`
