# Internal maintainer index

This index is for maintainers and coding agents. Buyers and operators should
start at [`README.md`](../../README.md). The files listed here stay on disk;
they are not the customer/operator README surface.

## Contributor and agent procedure

- [Contributing](../../CONTRIBUTING.md)
- [Contributor and agent procedure](../development/contributor-and-agent-procedure.md)
- [AGENTS.md](../../AGENTS.md)
- [Review sandbox](../noema-agent-sandbox-plan.md)

## Hourly loops

- [Hourly commercial-readiness loop](../hourly-commercial-readiness-loop.md)
- [Hourly product development](../operations/hourly-product-development.md)
- [Hourly product-development prerequisites](../operations/hourly-product-development-prerequisites.md)

## Saleable program and acquisition internals

- [Saleable program readiness](../saleable-program-readiness.md)
- [Saleable program goal registry](../saleable-program-goal-registry.md)
- [Goal completion audit](../goal-completion-audit.md)
- [Acquisition readiness](../acquisition-readiness-2b.md)
- [Buyer due diligence index](../buyer-due-diligence-index.md)
- [Buyer pitch deck outline](../buyer-pitch-deck-outline.md)
- [Transfer readiness plan](../transfer-readiness-plan.md)
- [Library boundary decision](../library-boundary-decision.md)
- [Pilot readiness checklist](../pilot-readiness-checklist.md)
- [Release readiness audit](../release-readiness-audit.md)
- [Pricing draft](../pricing-draft.md)
- [Terms draft](../terms-draft.md)

## KPI collect and readiness-scan internals

Operator-facing SLA numbers stay in
[SLA/지원 정책](../sla-and-support.md). The recipes below are maintainer
evidence collection, not buyer documentation.

- [관측성 KPI](../observability-kpi.md)
- `npm run kpi:compute` / `kpi:check` / `kpi:alerts` / `kpi:verify`
- `npm run kpi:collect` writes `exchange-30d.ndjson` plus
  `exchange-30d.ndjson.provenance.json`. Strict KPI requires
  `sourceKind=production`, `sourceId`, `records`, and `collectedAt`.
- `npm run production:preflight` fail-fast-checks production URL and KPI
  collect inputs; it does not create evidence.
- `npm run readiness:audit` and `.github/workflows/readiness-scan.yml`
- `npm run acquisition:manifest` / `acquisition:audit` and
  `.github/workflows/acquisition-readiness-scan.yml`
- `npm run security:evidence`

Do not copy these loops, sale-process audits, or agent procedures back into
`README.md`.
