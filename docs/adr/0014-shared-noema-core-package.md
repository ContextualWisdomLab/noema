# ADR-0014: Minimal `noema-core` Shared Kernel for Agent construction

- **Status:** Proposed
- **Decision owner:** Noema repository governance
- **Scope:** `ContextualWisdomLab/noema` reviewer self-consumption and future versioned consumers

## Problem

Noema has multiple bounded-context consumers that need the same PydanticAI `Agent(...)` construction semantics, but those consumers do not share domain authority. Repeating the framework construction call in each consumer creates drift; centralizing model discovery, provider SDKs, credentials, fallback, verdict schemas, tools, tenant state, or security policy would instead violate the repository's DDD boundary and duplicate canonical owners.

The previous branch-local ADR used number `0012`, which now belongs on protected `main` to the runtime bounded-context decision. ADR identity is immutable repository architecture authority, so this decision is renumbered to `0014` rather than retaining two different ADR-0012 documents.

## Constraints

- `contextual-orchestrator` owns provider/model discovery, routing, test-time compute, failover, provider credentials and provider-specific transport policy.
- Noema owns Agent Runtime and its bounded contexts, not foreign product truth.
- Reviewer verdict schema, deterministic gates, GitHub evidence policy and reviewer publication remain reviewer-owned.
- Tenant/application tool authority and domain state stay in their owning product.
- Security isolation, quarantine and outbound-policy authority stay with their canonical owners.
- Mutable branch refs and copied source are not acceptable cross-repository dependencies.
- External adoption requires an immutable versioned publication with exact source identity and compatibility evidence.

## Alternatives

### A. Duplicate the construction in every consumer

Rejected. It preserves local autonomy but guarantees repeated framework wiring and version drift without adding a useful bounded-context distinction.

### B. Put provider discovery and transport in `noema-core`

Rejected. That would recreate `contextual-orchestrator` inside Noema and would let a Shared Kernel become an ambient provider-authority boundary.

### C. Build an always-on Noema service for every consumer

Rejected for this phase. A service would add deployment, network, authorization and recovery semantics that are not required to remove the verified same-language construction duplication. Cross-language consumers can be handled through released service/API contracts when a real caller requires them.

### D. Minimal package with caller-supplied model

Chosen. `packages/noema-core` owns only a role-neutral Noema persona fragment and a factory that accepts an already-constructed PydanticAI `Model` and calls `Agent(...)` with caller-owned prompt, output and deps types.

## Decision

Create `packages/noema-core` as a minimal Shared Kernel with:

- `NOEMA_PERSONA = "You are Noema"` as a role-neutral identity prefix;
- `build_agent(model, *, system_prompt, output_type=str, deps_type=None, retries=3)`;
- rejection of string model identifiers so PydanticAI's implicit provider/model inference cannot move discovery into the Shared Kernel.

`noema-core` deliberately does **not** own:

- provider SDK construction or endpoint selection;
- credentials, key discovery, model groups or fallback;
- reviewer verdicts, gates or merge authority;
- tool/dependency authorization;
- tenant isolation, domain persistence or foreign truth;
- quarantine, egress or malware/security verdict authority.

The current PR's only production consumer is `reviewer/noema_reviewer`. Reviewer packaging stages the canonical `packages/noema-core/src/noema_core` source into wheel/sdist builds so the installed reviewer contains the exact shared module without copying a second source tree. Editable installs and CI use the same canonical path. This is a transitional monorepo packaging arrangement, not permission for external repositories to consume the mutable branch.

## Verification contract

Before this decision can become `Accepted`, the exact candidate head must prove:

1. `packages/noema-core` line and branch coverage are 100% and public docstring coverage is 100%.
2. The reviewer retains its existing coverage/docstring gates and behavior.
3. Installed reviewer wheel and sdist-to-wheel smoke tests import both `noema_reviewer` and `noema_core` outside the checkout and prove the installed shared `agent.py` bytes match the canonical source.
4. Evidence-only reviewer imports remain lazy and do not require model construction.
5. String model identifiers fail closed at the Shared Kernel boundary.
6. Central review execution receives the canonical package path without moving provider routing authority into Noema.
7. No cross-repository consumer adopts `noema-core` until immutable publication exists.

## Publication boundary

A merge of this PR establishes protected source, not an external dependency. External consumption requires the repository's selected immutable publication mechanism to provide all applicable evidence together:

- semantic version and immutable source commit;
- artifact digest/integrity;
- package/install smoke tests;
- SBOM and provenance;
- licensing/NOTICE compatibility;
- compatibility/migration and rollback guidance.

After such a release exists, consumers must pin the released version through their own ACL/adapter and regenerate their exact-head acceptance evidence. A mutable Git branch, local path, copied module, or open PR head is never the production dependency.

## Consequences

The shared surface stays intentionally small, so framework construction drift is removed without turning Noema into an LLM gateway or a domain super-service. The cost is a transitional reviewer build backend until `noema-core` has its own immutable package publication. That transitional backend must remain bounded, deterministic and covered by installed-artifact tests.

A future need for cross-language access is a separate architecture decision. It should begin from a real consumer and released contract rather than expanding this package pre-emptively.

## Follow-up

- Merge the reviewer self-consumption only after current-head CI, security, reviewer, package and provenance gates pass.
- Publish `noema-core` through the repository-approved immutable mechanism when release evidence is ready.
- Replace transitional monorepo bundling with a normal released dependency after publication.
- Update any future consumer only after verifying its canonical owner boundary and exact released artifact identity.
