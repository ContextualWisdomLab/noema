# ADR 0015: Fail-closed admission for external Claude community plugins

Status: Proposed

## Context

CWL products can discover curated plugins through `anthropics/claude-plugins-community`, but wholesale marketplace installation would turn third-party prompts, hooks, MCP servers, shell commands, and network access into implicit runtime authority. Anthropic review of that catalog is useful upstream evidence, not CWL admission authority. Issue #545 assigns the Tool / Capability Boundary the job of versioned external-extension descriptors, least-authority activation, expiry, rollback, and invocation receipts.

`context-graph-contracts` does not yet publish an immutable shared artifact contract for this descriptor. AppGuardrail, quarantine-sandbox-runtime, EgressWeave, and Keyverse remain the owners of scanning, isolation, egress, and secret handles. Waiting for those foreign GA releases would stall an independently verifiable Noema port.

## Decision

Noema keeps a local fail-closed Tool / Capability port in `src/tool-capability/external-extension-admission.ts`:

- Admission binds exact `upstream_repository`, lowercase commit SHA, relative path, artifact digest, and marketplace-entry digest.
- Mutable branches, tags, `latest` versions, absolute paths, and parent-segment paths are rejected.
- Marketplace metadata that disagrees with an independently pinned catalog is rejected.
- AppGuardrail and quarantine receipts must be pinned separately and must match the artifact and isolation policy.
- `developer_assist` admits no filesystem, network, process, secret, or MCP capabilities. Provider keys and broad GitHub authority are forbidden.
- Product-scoped activation cannot use another product's approval. `approved_for_pilot` is not invocation authority.
- Expired, suspended, superseded, rejected, or rollback-marked extensions cannot be invoked.
- Catalog drift after admission cannot silently update an active extension.
- Duplicate activation and invocation events are idempotent replay; conflicting retained events fail closed.
- Plugin instructions cannot promote observed content into trusted policy or new capability.
- Product-runtime mode cannot execute a Claude plugin wrapper.
- Invocation receipts contain only identity fields and must not carry secrets, raw product data, or hidden reasoning.

This port is a test double and Anti-Corruption Layer until an immutable `context-graph-contracts` release exists. Noema does not copy plugin source, install the marketplace, or treat Anthropic review as CWL trust.

The decision follows least privilege and complete mediation (Saltzer & Schroeder, 1975) and fail-closed verification of untrusted software components (National Institute of Standards and Technology, 2022).

## Consequences

Operators can reject hostile plugin metadata deterministically without waiting for foreign GA. The cost is a local descriptor that must later be replaced by a released shared contract without changing the fail-closed invariants. AppGuardrail and quarantine receipts remain pins, not proof that those owners have completed their own product work.

## Rejected alternatives

- **Wholesale marketplace installation:** rejected because unreviewed connectors would inherit runtime authority.
- **Trust Anthropic catalog review as CWL admission:** rejected because upstream review is not this organization's authority.
- **Copy plugin source into Noema or product repositories:** rejected because it creates a mutable foreign system of record.
- **Wait for `context-graph-contracts` GA before any Noema port:** rejected because a local fail-closed ACL is independently verifiable and can later consume the released contract.
- **Allow product-runtime Claude plugin wrappers:** rejected because product execution must use product-owned protocol/API ports, not community plugin packaging.

## Acceptance

This ADR remains `Proposed` until the local port is protected source, exact-head CI/security/review evidence is terminal clean, and later slices bind trusted research/execution producers, immutable shared-contract consumption, AppGuardrail successor evidence, and measured pilot activation. Source tests do not prove live plugin installation, isolation runtime operation, or buyer completion of issue #545.

## References

National Institute of Standards and Technology. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). https://doi.org/10.6028/NIST.SP.800-218

Saltzer, J. H., & Schroeder, M. D. (1975). The protection of information in computer systems. *Proceedings of the IEEE, 63*(9), 1278–1308. https://doi.org/10.1109/PROC.1975.9939
