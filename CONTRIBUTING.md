# Contributing to Noema

This file is maintainer and coding-agent procedure. The buyer/operator product
story is [`README.md`](./README.md). Do not put exact-head merge authority,
hourly commercial loops, or acquisition-price audits back into the README body.

Cross-agent guardrails: [`AGENTS.md`](./AGENTS.md).

## Writer boundaries

- Write only Noema. Optional CWL composition (Naruon receiving Noema, or a
  decision-agent path that calls orchestrator/Noema) is not a bug and is not a
  reason to add a Naruon runtime dependency.
- Before every write, refetch the exact target, base, blob, ref, review, and
  writer state. Treat a moving head as a writer-lease conflict.
- Never force-push, self-approve, weaken gates, fabricate authority, secrets,
  or evidence, or add self-modifying branch-patching workflows.
- Do not merge. SHA-bound squash merge, when enabled, belongs to the hourly
  commercial-readiness loop and human operators — not to a feature-branch agent.
- Do not introduce `process.env` / `os.getenv` secret reads in `src/`. Worker
  secrets stay on the typed `env` binding.

## Exact-head CI and successor heads

Pending, queued, skipped, cancelled, stale-head, status-only, predecessor-head,
synthetic, or model-only evidence is not success.

- A successor rebuild after `main` advances is a new head. Predecessor CI,
  reviews, coverage, and scanner results do not transfer.
- Required checks must pass on the **unchanged exact head** that will merge:
  `verify`, `reviewer`, `scorecard`, `osv-scan`, `trivy-fs`,
  `dependency-review`, plus observed successful checks. Producer identity
  matters (`app.slug=github-actions` for the required set).
- The Security Scan gate (`osv-scan`, `dependency-review`, `trivy-fs`) runs on
  pull requests whose base is `main`, `master`, or `develop`. A stacked
  feature-base PR with no Security Scan is non-passing evidence, not scanner
  success. After a predecessor integrates, retarget onto an eligible protected
  base and require a fresh terminal-success Security Scan on the unchanged
  exact head.
- `trivy-fs` findings are real. Remediate by bumping the vulnerable npm
  dependency. Do not weaken the gate.

Details: [`docs/hourly-commercial-readiness-loop.md`](./docs/hourly-commercial-readiness-loop.md),
[`docs/main-governance-audit.md`](./docs/main-governance-audit.md),
[`docs/doctoring/atomic-product-publisher-lease.md`](./docs/doctoring/atomic-product-publisher-lease.md).

## PR stacking

Keep stacked PRs in dependency order. Do not merge a successor on a
predecessor head. After the predecessor lands, refresh or retarget the
successor onto the new protected base and re-run exact-head gates.

GitHub cannot atomically create “only if no other PR exists.” Unique branches,
branch protection, and exact-head review bound that race. See
[`docs/operations/hourly-product-development.md`](./docs/operations/hourly-product-development.md).

## Do not merge; hidden wait states

Agents and proposal loops do not merge, release, or deploy.

The hourly commercial-readiness loop is the SHA-bound merge authority when
`NOEMA_MAINTENANCE_ENABLED=true` and the dedicated Maintainer App is ready.
It still fails closed on unresolved threads, `CHANGES_REQUESTED`, missing
exact-head Noema approval, or incomplete required checks.

**Review-dependent wait is not a product defect.** `opencode-review` and
`metadata-only gate evaluation` may stay pending until a Noema verdict exists,
so the central reviewer and CodeRabbit-adjacent checks do not deadlock each
other. That wait is a merge-lane state, not a buyer-facing outage. After the
trusted Noema App approval, merge still requires completed allowed conclusions
on the current head.

Default-branch protection and break-glass policy are issue #27.
Untrusted-PR sandbox editing is issue #9. Until that sandbox exists, the
hourly loop must not execute or auto-edit untrusted PR code.

## Hourly loops

| Workflow | Role |
| --- | --- |
| [`.github/workflows/hourly-commercial-readiness.yml`](./.github/workflows/hourly-commercial-readiness.yml) | Inventory open PRs, dispatch exact-head `noema-review`, SHA-bound squash merge only when every fail-closed check passes. |
| [`.github/workflows/hourly-product-development.yml`](./.github/workflows/hourly-product-development.yml) | Proposal-only OpenCode session through `NVIDIA_NIM_API_KEY` when the PR queue is empty. Cannot review, merge, release, or deploy. |

Manual commercial-loop dispatch (default-branch workflow code only):

```bash
gh api repos/ContextualWisdomLab/noema/dispatches -X POST --input - <<'JSON'
{"event_type":"commercial-readiness-loop"}
JSON
```

Reports: `commercial-readiness-loop-report` artifact. Reviewer login must match
`NOEMA_REVIEWER_LOGIN` exactly. Operator runbook:
[`docs/hourly-commercial-readiness-loop.md`](./docs/hourly-commercial-readiness-loop.md),
[`docs/operations/hourly-product-development.md`](./docs/operations/hourly-product-development.md),
[`docs/maintainer-app-readiness-audit.md`](./docs/maintainer-app-readiness-audit.md).

APA 7th source notes for these loops stay in `docs/doctoring/`. Do not invent
citations in README or this file.

## Saleability and acquisition audits

These commands are maintainer/data-room tooling. They are not how a buyer runs
Noema.

```bash
npm run readiness:audit
NOEMA_EXCHANGE_URL=https://.../exchange npm run readiness:audit
npm run acquisition:manifest
npm run acquisition:audit
npm run security:evidence
```

- Saleability goal and daily scan:
  [`docs/saleable-program-readiness.md`](./docs/saleable-program-readiness.md),
  [`docs/saleable-program-goal-registry.md`](./docs/saleable-program-goal-registry.md)
- KRW 2,000,000,000 acquisition goal and data room:
  [`docs/acquisition-readiness-2b.md`](./docs/acquisition-readiness-2b.md),
  [`docs/buyer-due-diligence-index.md`](./docs/buyer-due-diligence-index.md)
- KPI collect/check/verify:
  [`docs/observability-kpi.md`](./docs/observability-kpi.md)
- Library/submodule boundary:
  [`docs/library-boundary-decision.md`](./docs/library-boundary-decision.md)

Scheduled `readiness-scan` / `acquisition-readiness-scan` runs are
**surveillance**: missing production evidence is recorded as `NOT_READY`
(warning + artifact). The same gaps fail `workflow_dispatch` and local
`npm run readiness:audit` / `npm run acquisition:audit`. Unchecked items in
[`docs/security-validation-checklist.md`](./docs/security-validation-checklist.md)
fail readiness audit.

Production CD uses `npm run release:verify:strict` and stores KPI/smoke
evidence as workflow artifacts. Preflight:

```bash
NOEMA_EXCHANGE_URL=https://.../exchange \
NOEMA_KPI_SOURCE_KIND=production \
NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
NOEMA_KPI_LOG_URL=https://.../exchange-30d.ndjson \
npm run production:preflight
```

## Local verification

```bash
npm install
npm test
npm run typecheck
npm run release:verify
```

There is no lint script. `typecheck` and tests are the code gates. Follow
[`CHANGELOG.md`](./CHANGELOG.md) `## Unreleased` for behavior changes.
