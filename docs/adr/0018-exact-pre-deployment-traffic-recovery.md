# ADR-0018: Exact pre-deployment traffic recovery authority

- Status: Proposed
- Date: 2026-09-11
- Owners: Noema Release / Recovery bounded context
- Related: #611, #612, #614, `scripts/deployment-evidence.mjs`, `docs/deployment-provenance.md`

## Problem

The deployment receipt historically reduced the pre-mutation Cloudflare deployment to `previousDeploymentId` and the first `versions[]` entry. Cloudflare deployments may contain one version at 100% or two versions with explicit traffic percentages. Therefore `versions[0]` is not a valid recovery decision when a deployment is split: array order becomes accidental authority and the original distribution is lost.

Cloudflare's rollback operation also has different semantics from exact previous-state restoration. A rollback selects one previous version and creates a deployment that routes 100% of traffic to it. It does not restore a prior two-version distribution.

Cloudflare deployment/version identities are UUIDs. RFC 9562 permits uppercase, lowercase, or mixed-case hexadecimal UUID text, so hexadecimal letter casing is not a second provider identity. RFC 9911's UUID type uses lowercase as the canonical representation. Retaining or comparing valid UUID text without one canonical representation can therefore let the same deployment or Worker version appear distinct at an authorization boundary.

## Constraints

- Cloudflare remains provider authority for Worker deployment/version identity and traffic percentages.
- Noema owns its deployment receipt, recovery preconditions and fail-closed evidence admission.
- Recovery evidence must be captured before mutation; post-failure reconstruction from an unordered version array is not sufficient.
- UUID textual aliases must collapse to one semantic identity before equality, duplicate detection, ordering and recovery mutation planning.
- A source-level receipt cannot be promoted to proof that a real rollback/recovery rehearsal succeeded.
- Existing immutable-release, production Environment, KPI, smoke, Sigstore and acquisition controls remain independent gates.

## Considered options

### A. Keep `versions[0]` as the rollback target

Rejected. It is deterministic only in the superficial sense that the same array position is selected. It does not preserve the provider's traffic authority and silently loses split state.

### B. Always use Cloudflare rollback to one previous version

Rejected as the canonical recovery objective. It is valid only when product policy deliberately chooses a single known-good version. It cannot restore a pre-deployment 60/40 or other two-version distribution.

### C. Preserve the complete pre-mutation deployment distribution

Selected. Before mutation, record the provider deployment UUID, observation time, deployment creation time, every active Worker version UUID and its percentage. Canonicalize accepted UUID text to lowercase identity before comparison and canonicalize the retained version list by that identity so neither hexadecimal casing nor provider array ordering becomes authority. The percentages must be finite, positive and total exactly 100; IDs must satisfy the current Cloudflare UUID contract.

The recovery objective is `restore_exact_pre_deployment_distribution`. For a single 100% previous version, `previousWorkerVersionId` remains as a compatibility field because the target is unambiguous. For a split deployment it must be `null`; recovery consumes the full retained distribution instead.

## First-deployment semantics

An empty pre-deployment list is a legitimate first deployment, not malformed evidence. The receipt records `previousDeployment: null`, `previousDeploymentId: null`, and `previousWorkerVersionId: null`. Missing observation time, malformed deployment/version identity, missing versions, duplicate versions including case-aliased UUID duplicates, impossible percentage totals, case-aliased pre/post deployment identity reuse, or temporally inconsistent observations remain fail-closed errors.

## Consequences

The direct status client emits an observation timestamp together with Cloudflare's deployment list. Receipt construction binds the pre-mutation snapshot before accepting the post-deployment state. Valid provider UUIDs are normalized to one lowercase identity at the Noema evidence/recovery boundary; recovery planning emits the same canonical IDs. Acquisition auditing separately validates the retained recovery authority rather than trusting an attested digest whose internal recovery semantics were never checked.

The operator runbook must distinguish two actions:

1. exact-state restoration: create a deployment using the retained version/percentage distribution;
2. deliberate single-version rollback: select a reviewed known-good version and route 100% to it.

Neither action is considered operationally proven until a controlled production recovery rehearsal produces immutable evidence and post-recovery smoke/KPI acceptance.

## Evidence and traceability

Primary provider and standards references reviewed 2026-09-11:

- Cloudflare, *Workers Rollbacks*: https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
- Cloudflare, *Versions & deployments*: https://developers.cloudflare.com/workers/versions-and-deployments/
- Cloudflare API, *Create Deployment*: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/
- Davis, K., Peabody, B., & Leach, P. (2024). *Universally Unique IDentifiers (UUIDs)* (RFC 9562). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc9562.html
- Schönwälder, J., Björklund, M., & Bierman, A. (2025). *Common YANG Data Types* (RFC 9911). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc9911.html

Executable acceptance is owned by `test/deployment-evidence-rollback-traffic-authority.test.ts`, `test/cloudflare-worker-recovery.test.ts`, and the acquisition deployment-evidence audit. This ADR stays **Proposed** until the source contract is protected and a real controlled recovery rehearsal demonstrates the chosen semantics against production Cloudflare state.
