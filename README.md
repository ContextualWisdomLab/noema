# Noema

**Evidence-producing credential and maintenance control plane for governed GitHub automation.**

Noema gives repository automation narrowly scoped capability without turning model output, CI status, or a long-lived secret into authority. It verifies GitHub Actions OIDC identity, exchanges that identity for repository-scoped GitHub App capability, and keeps credential, review, check, merge, release, deployment, and commercial evidence as distinct trust domains.

It is built for maintainers and platform teams that need automation to move quickly while remaining exact-revision, least-privilege, and fail-closed.

## What Noema does

| Need | Noema responsibility |
| --- | --- |
| Short-lived repository capability | Verify GitHub Actions OIDC and mint repository-scoped GitHub App installation tokens |
| Exact-revision maintenance | Bind privileged actions to current heads, live bases, and freshly re-read repository state |
| Independent review evidence | Support App-authored review verdicts without treating model judgement as merge authority |
| Safe automation | Separate untrusted analysis from credential-bearing execution and refuse stale or ambiguous evidence |
| Operational evidence | Preserve bounded readiness, security, governance, release, and maintenance evidence |
| Ecosystem composition | Integrate with central `.github`, `contextual-orchestrator`, and other products through explicit contracts |

Noema does **not** own model discovery or provider routing. Those capabilities belong to [`ContextualWisdomLab/contextual-orchestrator`](https://github.com/ContextualWisdomLab/contextual-orchestrator). Noema also does not promote checks, scanners, model output, or documentation into formal approval, merge, deployment, customer, revenue, legal, or transfer authority.

## Product surfaces

### Credential exchange

The Cloudflare Worker exposes three intentionally distinct HTTP surfaces:

| Method | Path | Meaning |
| --- | --- | --- |
| `GET` | `/health` | Process liveness only |
| `GET` / `HEAD` | `/ready` | Runtime readiness without reflecting secrets |
| `POST` | `/exchange` | Exchange an authorized GitHub Actions OIDC bearer for short-lived repository capability |

The public contract is published as [`openapi.json`](./openapi.json), with narrative details in [`docs/api-spec.md`](./docs/api-spec.md).

### Review and maintenance control

Noema can support review and maintenance workflows that need to distinguish:

- the exact current source head from historical or predecessor evidence;
- an independently resolved live base from a stale PR snapshot;
- checks, statuses, scanners, model judgement, and formal reviews;
- observation authority from mutation authority;
- source integration from release, deployment, and commercial evidence.

A blocked lane is not a reason to stall unrelated safe work. The product is explicitly work-conserving while remaining fail-closed on the blocked action itself.

### Orchestrator gateway contract

Every model-backed Noema job routes through `ContextualWisdomLab/contextual-orchestrator`. Provider credentials remain in the orchestrator credential boundary; Noema consumes only a dedicated inference token and a published gateway contract.

The machine-readable contract is [`contracts/orchestrator-gateway.json`](./contracts/orchestrator-gateway.json).

```bash
node scripts/verify-orchestrator-gateway.mjs --print-contract
```

Host-facing gateway configuration:

| Name | Meaning |
| --- | --- |
| `NOEMA_LLM_API_URL` | HTTPS OpenAI-compatible base ending in `/v1` |
| `NOEMA_LLM_MODEL` | Routing alias, normally `contextual-orchestrator` |
| `NOEMA_LLM_API_KEY` | Dedicated gateway inference token |

Direct-provider fallbacks are intentionally rejected.

## Quick start

Noema is a private Node.js package; the deployed Worker and its HTTP/evidence contracts are the product. The repository requires Node.js 22 or newer and pins the development runtime/package-manager versions in `package.json`.

```bash
npm install
npm test
npm run typecheck
npm run dev
```

`npm run dev` starts a local Cloudflare Worker.

### Configure Worker secrets

Provision GitHub App secrets on the Worker binding rather than reading them from application `process.env` code:

```bash
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY_PEM

# Optional: pin one installation rather than discovering it by repository.
wrangler secret put GITHUB_APP_INSTALLATION_ID
```

### Deploy

```bash
npm run deploy
```

After deployment, configure `NOEMA_EXCHANGE_URL` in the trusted central workflow or consuming deployment to point at the Worker `/exchange` endpoint.

Do not reuse an upstream provider credential such as `OPENAI_API_KEY` as Noema's gateway token.

### Smoke-check a deployment

```bash
NOEMA_EXCHANGE_URL=https://example.workers.dev/exchange npm run smoke:check
```

The smoke check exercises liveness, readiness, exchange framing, unauthenticated challenge behavior, and bounded response/security headers. It does not manufacture GitHub App, deployment, or production-readiness evidence that is absent from the environment.

## Example exchange

A trusted GitHub Actions job supplies its OIDC bearer and the target repository:

```bash
curl -sS -X POST "$NOEMA_EXCHANGE_URL" \
  -H "authorization: Bearer $ACTIONS_ID_TOKEN" \
  -H "content-type: application/json" \
  -d '{"target_repository":"ContextualWisdomLab/example"}'
```

`target_repository` must be an allowed `owner/name` repository. Noema validates the configured issuer, audience, organization, exact trusted workflow identity, immutable workflow-source identity, token time semantics, and replay boundary before credential exchange.

Issued and inbound credentials must not appear in logs or retained model context.

## Architecture at a glance

```text
GitHub Actions
     │
     │ OIDC identity
     ▼
┌───────────────────────────────┐
│             Noema             │
│ credential + maintenance      │
│ control plane                 │
├───────────────────────────────┤
│ OIDC trust verification       │
│ replay / rate-limit boundary  │
│ GitHub App token exchange     │
│ exact-revision evidence       │
│ review / maintenance controls │
└───────────────┬───────────────┘
                │
     short-lived scoped capability
                │
                ▼
         GitHub repository

Model-backed judgement ──► contextual-orchestrator
                           (provider/routing owner)
```

The Worker, GitHub App capability boundary, maintenance controls, and review evidence are Noema-owned responsibilities. Adjacent products remain independently deployable and integrate through published contracts rather than shared application tables or ambient credentials.

## GitHub App permissions

The deployed GitHub App requires the narrow repository permissions used by the exchange/review boundary:

- Pull requests: read and write
- Checks: read-only
- Contents: read-only

Install the App only on repositories that need the trusted workflow path.

## Security model

Noema's default posture is conservative:

- short-lived capability instead of broad long-lived repository credentials;
- exact workflow and repository identity before token minting;
- replay protection and bounded pre-auth rate limiting;
- no model/provider credential ownership in this repository;
- no credential-bearing execution of untrusted PR/model output;
- no transfer of predecessor-head checks or reviews after a source change;
- missing, malformed, stale, partial, pending, or ambiguous evidence is non-passing;
- formal review, merge, release, deployment, and commercial/legal authority remain separate.

See [`docs/threat-model.md`](./docs/threat-model.md), [`docs/doctoring/architecture-trust-boundaries.md`](./docs/doctoring/architecture-trust-boundaries.md), and the [`docs/adr/`](./docs/adr/) decision records for the deeper trust model.

## Verify the repository

The ordinary contributor checks are explicit package scripts:

```bash
npm run typecheck
npm test
npm run security:scan
```

For the broader evidence-bearing release verification path:

```bash
npm run release:verify
```

`release:verify` combines type checking, tests, security scanning, KPI evidence, dependency-license inventory, and acquisition-manifest/integrity checks. Passing repository checks are technical evidence; they are not by themselves a deployment, certification, approval, sale, or legal claim.

## Documentation map

Start with the document that matches the job at hand:

| Goal | Document |
| --- | --- |
| Product requirements and non-goals | [`docs/PRD.md`](./docs/PRD.md) |
| Technical requirements | [`docs/TRD.md`](./docs/TRD.md) |
| Architecture and trust boundaries | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Architecture decisions | [`docs/adr/README.md`](./docs/adr/README.md) |
| API contract | [`docs/api-spec.md`](./docs/api-spec.md) / [`openapi.json`](./openapi.json) |
| Deployment | [`docs/deployment-guide.md`](./docs/deployment-guide.md) |
| Operations | [`docs/runbook.md`](./docs/runbook.md) |
| Security / threat model | [`docs/threat-model.md`](./docs/threat-model.md) |
| Runtime readiness | [`docs/runtime-readiness.md`](./docs/runtime-readiness.md) |
| Requirement → evidence traceability | [`docs/TRACEABILITY.md`](./docs/TRACEABILITY.md) |
| Current product/technical gaps | [`docs/product-technical-gap-baseline.md`](./docs/product-technical-gap-baseline.md) |
| Full documentation index | [`docs/README.md`](./docs/README.md) |

Maintainers and coding agents should also read [`docs/internal/README.md`](./docs/internal/README.md) and [`docs/development/contributor-and-agent-procedure.md`](./docs/development/contributor-and-agent-procedure.md) before changing repository behavior.

## Product principles

1. **Least privilege.** Capability is bounded by purpose, repository, role, operation, and lifetime.
2. **Exact revision before authority.** Mutable identities are re-read before privileged decisions and writes.
3. **Evidence is not authority.** Green-looking signals remain distinct until the correct authority interprets them.
4. **Fail closed.** Missing or ambiguous evidence is never upgraded into success.
5. **Standalone first, composable second.** Noema remains independently deployable and integrates through versioned contracts.
6. **Work conserving.** A waiting lane blocks only that lane; unrelated safe work continues.
7. **Claims stay evidence-bound.** Documentation never substitutes for real deployment, customer, revenue, legal, ownership, or transfer evidence.

## Contributing

Before changing behavior, read [`AGENTS.md`](./AGENTS.md), the canonical PRD/TRD, architecture decisions, and the current product-gap evidence. Keep runtime/security changes test-first, preserve exact-head evidence boundaries, and update the public contract and operator documentation whenever externally visible behavior changes.

This repository currently does not publish an npm library. Do not infer a public package release or license grant from the private package metadata alone.