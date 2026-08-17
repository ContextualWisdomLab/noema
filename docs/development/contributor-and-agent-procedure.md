# Contributor and agent procedure

Internal procedure for writers, coding agents, and maintainers. This is not
the customer README. Product facts for buyers and operators stay in
[`README.md`](../../README.md).

## Writer and agent boundaries

- `README.md` is customer/operator facing. Do not turn it into a bot work
  manual (PR stacking, exact-head CI tips, do-not-merge checklists, CloudAgent
  or OpenCode session steps, hourly-loop instructions).
- Cross-agent security and LLM-gateway rules live in [`AGENTS.md`](../../AGENTS.md).
- Secrets reach `src/` only through the typed Worker `Env` binding
  (`wrangler secret put`). Do not introduce `process.env` / `os.getenv` secret
  reads in `src/`.
- Do not sequentially try the next model or agent. The orchestrator selects
  min-cost / max-performance. Do not configure a direct-provider fallback.
- Do not treat cancelled OpenCode or Strix bodies as paper or standard grounds.
  Reuse existing verified APA 7th citations in `docs/doctoring/`; do not invent
  papers or treat drafts as final.
- Do not merge this leaf into a composition hub. Hub-and-leaf calls through the
  published API and `contracts/orchestrator-gateway.json` are the supported
  path. Naruon and gyeot (곁) are intended composition hubs; keep those links.

## Central-review runtime (relocated from README)

The product repository owns the default-branch-only
[`central-review`](../../.github/workflows/central-review.yml) runtime. It
accepts a `noema-review` `repository_dispatch` event containing
`target_repository`, `pr_number`, and the exact `pr_head_sha`; branch-selected
manual workflow code cannot receive the App key. The runtime waits up to 90
minutes for non-OpenCode checks, initializes and explores CodeGraph at the
exact target head, permits a single provider request to run for 90 minutes, and
delegates upstream failover to `contextual-orchestrator` before publishing an
App-authored review. Before sending the manifest it rejects known
direct-provider URLs and verifies the unauthenticated `/healthz` service
identity. It rejects target symlinks, strips credentials from the CodeGraph
subprocess, and revalidates the live head immediately before publication.

The production cutover is intentionally separate from the code change because
it creates organization variables and a secret. Follow the
[contextual-orchestrator reviewer cutover runbook](../contextual-orchestrator-reviewer-cutover.md);
do not reuse `OPENAI_API_KEY` as Noema's gateway token.

Example dispatch (bind the SHA from a fresh PR read, never from stale local
state):

```bash
gh api repos/ContextualWisdomLab/noema/dispatches -X POST --input - <<'JSON'
{"event_type":"noema-review","client_payload":{"target_repository":"ContextualWisdomLab/example","pr_number":1,"pr_head_sha":"0123456789abcdef0123456789abcdef01234567"}}
JSON
```

Sandbox and evidence-collection isolation:
[`docs/noema-agent-sandbox-plan.md`](../noema-agent-sandbox-plan.md).

## Hourly loops

### Product development (proposal only)

`.github/workflows/hourly-product-development.yml` runs a proposal-only
OpenCode session through the same `contextual-orchestrator` gateway contract as
review (`NOEMA_LLM_API_URL`, `NOEMA_LLM_MODEL`, dedicated `NOEMA_LLM_API_KEY`)
when the PR queue is empty. It does not iterate a model-candidate list. It
cannot review, merge, release, or deploy; the existing hourly
commercial-readiness loop retains exact-head governance and SHA-bound merge
authority.

Operator narrative:
[`docs/operations/hourly-product-development.md`](../operations/hourly-product-development.md).
Prerequisites:
[`docs/operations/hourly-product-development-prerequisites.md`](../operations/hourly-product-development-prerequisites.md).

### Commercial readiness (merge authority)

`.github/workflows/hourly-commercial-readiness.yml` inspects open pull requests
and, only when current-head evidence is complete, performs a SHA-bound squash
merge. It does not checkout or execute PR-branch code.

Operator narrative:
[`docs/hourly-commercial-readiness-loop.md`](../hourly-commercial-readiness-loop.md).

Do not treat a green predecessor head, a synthetic merge ref, or a queued check
as acceptance. Exact-head CI and review evidence are recorded in those
operations docs, not in `README.md`.

## Pull-request stacking and merge tips

These tips are for agents and maintainers. They are not buyer documentation.

- Keep stacked PRs in dependency order. A feature-base stacked PR may have no
  Security Scan run; absence is non-passing evidence, not scanner success.
  After the predecessor integrates, retarget onto an eligible protected base
  (`main`, `master`, or `develop`) and require a fresh terminal-success
  Security Scan on the unchanged exact head before merge.
- Do not merge from this procedure document. Human or existing
  commercial-readiness authority decides merge.
- Do not mark a PR Ready when citations are unverified, when the change is
  stacked on an unmerged parent, or when `README.md` has bot-manual leftover.
- A failing `trivy-fs` is a real finding. Remediate by bumping the vulnerable
  npm dependency. Do not weaken the gate. See [`AGENTS.md`](../../AGENTS.md).

## CloudAgent / OpenCode procedure

OpenCode is a coding agent used by `hourly-product-development.yml` only. It is
not a customer interface and not a paper or standard. Pin, budget, runner
split, and publication lease are in
[`docs/operations/hourly-product-development.md`](../operations/hourly-product-development.md).
Do not clone an OpenCode sidecar into naruon or gyeot. Do not copy OpenCode
bot model-candidate lists.

Cloud Agent / Cursor Cloud runs follow the same README rule: land
customer-visible product facts in `README.md`, and keep run procedure here or
in `AGENTS.md`.
