# ADR-0005: Fail closed across untrusted materialization boundaries

- **Status:** Accepted
- **Scope:** PR source, patches, artifacts, retained evidence, model output, review publication

## Context

Noema routinely consumes bytes that an attacker or untrusted contributor can influence: pull-request source, patch files, Git trees, archives, JSON evidence, model output, PR metadata and retained workflow artifacts. A cryptographic digest or schema field is useful only if the exact bytes being verified are the bytes later executed, published or retained. Path re-open races, symbolic links, partial pagination, malformed JSON/UTF-8, stale source revisions and model-generated metadata can otherwise turn untrusted material into false trusted evidence.

## Decision

Every trust upgrade from untrusted material to trusted evidence is an explicit fail-closed boundary.

1. Bind source/evidence to an immutable identity before use: repository, exact source revision, artifact/patch digest and workflow source as applicable.
2. Validate size, type, encoding, schema, path/mode and producer identity before interpreting content.
3. Prefer descriptor-bound/no-follow reads and pre/post identity stability when local filesystem evidence is security-sensitive.
4. Treat container/model/tool output as untrusted until a trusted host independently validates bounded output and synthesizes retained evidence.
5. Keep untrusted execution away from GitHub write, reviewer, model-provider, Cloudflare, OIDC, release, deployment and Docker-socket credentials.
6. A persisted `passed`, `approved`, `completed` or similar field is metadata to cross-check, not authority.
7. Missing/malformed/truncated evidence is failure or `NOT_READY`, never implicit success.

## Consequences

- Evidence-generation pipelines are more verbose because byte identity, file identity, schema and revision provenance remain explicit.
- Some convenience paths such as host-writable final evidence mounts or path-based re-open validation are rejected.
- Buyer evidence is independently re-verifiable instead of relying on a producer's self-asserted success field.

## Verification

- acquisition data-room integrity and Git worktree-binding tests on PR #69;
- quarantined patch-validation library and descriptor-safe boundary on PR #65;
- image-owned validator/runtime evidence work on PR #67;
- three-runner product-development artifact verification contracts;
- `docs/automation-threat-model.md` T-A01/T-A11 and `docs/ERD.md` evidence-entity separation.

## Rationale

This decision generalizes the repository's existing fail-closed evidence patterns. Narrow file/Git/container implementation rationale remains in the owning doctoring records so this ADR does not duplicate mutable implementation details.
