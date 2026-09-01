---
title: Noema
---

# Noema

Noema is an evidence-producing credential and maintenance control plane for governed GitHub automation. It gives repository automation short-lived, repository-scoped capability without turning model output, CI status, or long-lived secrets into authority.

## Start here

For local development and verification, follow the [README](https://github.com/ContextualWisdomLab/noema#readme). The deployed product is the Cloudflare Worker and its HTTP/evidence contracts; the repository package itself is private.

## Product responsibility

Noema owns GitHub Actions OIDC trust verification, GitHub App capability exchange, exact-revision maintenance controls, bounded review evidence, and the operational evidence needed to keep automation fail-closed and least-privilege.

Model discovery and provider routing belong to [contextual-orchestrator](https://github.com/ContextualWisdomLab/contextual-orchestrator). Noema keeps checks, reviews, merge authority, releases, deployments, and commercial/legal evidence as separate trust domains rather than promoting one signal into another.

## Documentation and operations

- [README](https://github.com/ContextualWisdomLab/noema#readme) — product value, quick start, architecture, and security posture.
- [Product requirements](https://github.com/ContextualWisdomLab/noema/blob/main/docs/PRD.md) — product responsibility, users, jobs, and non-goals.
- [Architecture](https://github.com/ContextualWisdomLab/noema/blob/main/ARCHITECTURE.md) — canonical architecture and trust boundaries.
- [API specification](https://github.com/ContextualWisdomLab/noema/blob/main/docs/api-spec.md) and [OpenAPI](https://github.com/ContextualWisdomLab/noema/blob/main/openapi.json) — public HTTP contract.
- [Deployment guide](https://github.com/ContextualWisdomLab/noema/blob/main/docs/deployment-guide.md) — deployment procedure.
- [Operations runbook](https://github.com/ContextualWisdomLab/noema/blob/main/docs/runbook.md) — operating and recovery guidance.
- [Threat model](https://github.com/ContextualWisdomLab/noema/blob/main/docs/threat-model.md) — security boundaries and failure modes.
- [Traceability](https://github.com/ContextualWisdomLab/noema/blob/main/docs/TRACEABILITY.md) — requirement-to-evidence mapping.
- [Current product/technical gaps](https://github.com/ContextualWisdomLab/noema/blob/main/docs/product-technical-gap-baseline.md) — evidence-backed remaining work.
- [Releases](https://github.com/ContextualWisdomLab/noema/releases) — published release history when available.
- [Ask DeepWiki](https://deepwiki.com/ContextualWisdomLab/noema) — repository-grounded questions and code navigation.

## Evidence boundary

Passing repository checks is technical evidence, not a deployment, certification, approval, sale, or legal claim. A capability is repository-facing only after the relevant protected-branch, deployment, and live-state evidence exists.

This file is a public documentation landing source. GitHub Pages publication is a separate repository-facing state and must be verified live before it is claimed available.
