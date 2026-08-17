# Contributing to Noema

This file is for maintainers, contributors, and coding agents. Buyers and
operators should start at [`README.md`](./README.md).

## Development

```bash
npm install
npm test
npm run typecheck
npm run security:scan
```

There is no lint script. `typecheck` and tests are the code gates. Coverage is
scoped to `src/**/*.ts` and CI enforces 100% statements, branches, functions,
and lines.

Update `CHANGELOG.md` (`## Unreleased`) with every behavior change. Docs in
`docs/` and the changelog are largely Korean; code, comments, and this file
are English.

## Where procedure lives

| Topic | Document |
| --- | --- |
| Customer/operator product surface | [`README.md`](./README.md) |
| Cross-agent security, secrets, and LLM gateway rules | [`AGENTS.md`](./AGENTS.md) |
| Bot, writer, and hourly-loop procedure | [`docs/development/contributor-and-agent-procedure.md`](./docs/development/contributor-and-agent-procedure.md) |
| Hourly product-development operations | [`docs/operations/hourly-product-development.md`](./docs/operations/hourly-product-development.md) |
| Hourly commercial-readiness / SHA-bound merge | [`docs/hourly-commercial-readiness-loop.md`](./docs/hourly-commercial-readiness-loop.md) |
| Review sandbox | [`docs/noema-agent-sandbox-plan.md`](./docs/noema-agent-sandbox-plan.md) |

Do not put CloudAgent, OpenCode session, PR-stacking, exact-head CI, or
do-not-merge procedure back into `README.md`. That file must stay
customer/operator facing.

## Relocated hourly product-development summary

`hourly-product-development.yml` runs a proposal-only coding session through
the same `contextual-orchestrator` gateway contract as review
(`NOEMA_LLM_API_URL`, `NOEMA_LLM_MODEL`, dedicated `NOEMA_LLM_API_KEY`) when
the PR queue is empty. It does not iterate a model-candidate list. It cannot
review, merge, release, or deploy; the existing hourly commercial-readiness
loop retains exact-head governance and SHA-bound merge authority.

Full runner isolation, OpenCode pin, publication lease, and credential split:
[`docs/operations/hourly-product-development.md`](./docs/operations/hourly-product-development.md).
Doctoring (APA 7th, existing verified sources only):
[`docs/doctoring/hourly-nim-opencode-development.md`](./docs/doctoring/hourly-nim-opencode-development.md).
