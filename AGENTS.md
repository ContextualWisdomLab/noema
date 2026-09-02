# AGENTS.md

Cross-agent conventions for the `noema` repo, readable by any coding agent
(Claude, Codex, Cursor, opencode, …). `noema` is a TypeScript Cloudflare
Worker (npm + `wrangler.toml`); tests run under Vitest.

<!-- BEGIN cwl-agent-guidance -->
## Agent guidance (CWL governance)

### Security & review gate
- Every PR that is expected to receive the central **Security Scan** must pass that required gate. It runs
  `osv-scan` + `dependency-review` (diff-scoped) and `trivy-fs` (repo-wide,
  fixable `MEDIUM/HIGH/CRITICAL`). The current protected central workflow has no
  pull-request base-branch filter, so stacked feature-base PRs are expected to
  receive the same scanner workflow rather than being exempt by branch name.
  An absent, queued, skipped, cancelled, stale, or failed run is non-passing
  evidence rather than scanner success. Keep stacks in dependency order and
  require a fresh terminal-success Security Scan on the unchanged exact head
  before merge; if an expected run is absent, investigate routing instead of
  treating the absence as an eligible-base exception.
- A failing **`trivy-fs` is a REAL finding, not a flake.** Read the job log — it
  prints each finding's rule id / severity / file — or the run's SARIF results,
  then **remediate**:
  - Vulnerable npm dependencies belong in `package.json`/`package-lock.json`;
    refresh the lockfile with the smallest compatible fixed dependency.
    Dockerfile/IaC findings, including the patch-validator image definition,
    must be fixed at the source rather than hidden behind scanner changes.
  - Only for a genuine false positive, add a narrow, **documented**
    `.trivyignore` (or `.trivyignore.yaml`) entry. Never weaken or disable the gate.
- A local scan with a stale DB misses findings. Refresh scanner data before
  local diagnosis and keep local evidence separate from the required central
  exact-head run; local success never substitutes for the protected workflow.
- The org `code_scanning` ruleset is intentionally **CodeQL-only** (multiple
  code-scanning tools can't converge on one PR ref). Gating is by the Security
  Scan **job result**, not the `code_scanning` rule — do **not** add tools to
  that rule.

### Code exploration
- There is no `.codegraph/` index in this repo today, so use normal search
  (grep/find, ripgrep) to locate and understand code. If a `.codegraph/`
  directory is later added at the repo root, prefer CodeGraph first
  (`codegraph explore "<query>"`, or the code-review-graph MCP tools) before
  grep/find — it surfaces callers/callees/impact that text search misses.

### Config & secrets (KV, not env)
- Org rule: do **not** read config/secrets via `os.getenv()` / raw environment
  variables at runtime. Read them from a KV / credential registry. Org Actions
  secrets flow **into** the KV via a bootstrap/CI step; runtime reads **from**
  the KV — env is only transport into the KV, never the runtime source.
- Reference implementation: xtrmLLMBatchPython's pgcrypto-encrypted Postgres
  credential registry (`get_credential(name)`). Reuse that pattern (a DB-backed
  KV is fine) unless a dedicated KV is adopted.
- This repo is a Cloudflare Worker, so the runtime already honors the rule: its
  secrets (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PEM`,
  `GITHUB_APP_INSTALLATION_ID`) reach `src/` only through the typed `Env`
  binding, provisioned by `wrangler secret put` (or a Cloudflare Secrets
  Store / KV binding) — never `process.env` / `os.getenv`. The Worker secret
  binding **is** the KV-equivalent here. Keep it that way: add new secrets with
  `wrangler secret put` and read them off `env`; do **not** introduce
  `process.env` / `os.getenv` secret reads in `src/`. If a dedicated KV registry
  is later adopted, resolve secrets through it at startup rather than widening
  the raw `Env` surface.
- The `scripts/*.mjs` audit/CI tooling may read `process.env` only for non-secret
  build-time configuration such as file paths and thresholds. A real script
  credential must come from an explicit credential capability, not from a raw
  `process.env.GH_TOKEN` or equivalent secret read.
- Narrow GitHub Actions bootstrap exception: a **short-lived GitHub App installation token**
  produced by the pinned App-token action may exist in one credential-bootstrap
  step environment as **bootstrap transport** only. That step must create a fresh
  private directory under `umask 077`, write the token to an **owner-only capability file**,
  unset the secret environment value, and remove the directory on exit. The
  runtime script reads only the capability-file path (`NOEMA_MAINTAINER_TOKEN_PATH`)
  and loads the bearer through the shared bounded/no-follow reader. This
  capability file is the ephemeral Actions credential-registry boundary; it is
  not permission to pass long-lived provider keys, App private keys, PATs, model
  credentials, or arbitrary secrets through runtime script environments.

### LLM gateway (all Noema LLM jobs, reusable by naruon)
- Noema is a multi-purpose bot, not only a review bot. It also runs as a
  separate agent program inside `ContextualWisdomLab/naruon` for judgments and
  decisions. naruon is a **first-class consumer** of this contract; naruon
  wiring is a separate repository PR.
- Every LLM job — production review, hourly product development, naruon
  judgments/decisions, and any later job — calls
  `ContextualWisdomLab/contextual-orchestrator` through the same contract:
  `NOEMA_LLM_API_URL` is an HTTPS OpenAI-compatible base ending in `/v1`,
  `NOEMA_LLM_MODEL` is the canonical routing alias `orchestrator/free`
  (fail-closed zero-cost pool, ZDR-first), and `NOEMA_LLM_API_KEY` is a
  dedicated gateway inference token.
- The reusable, secret-free copy is `contracts/orchestrator-gateway.json`
  (`node scripts/verify-orchestrator-gateway.mjs --print-contract`). Narrative:
  `docs/orchestrator-gateway-consumer-contract.md`. Validation helpers live in
  `scripts/lib/orchestrator-gateway.mjs`. Do not copy the OpenCode config writer
  into naruon.
- Upstream provider keys (`NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_API_KEY_SUB`,
  `BYTEZ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`) belong in the
  orchestrator credential KV, not in Noema or naruon runtime, workflows, or
  this repository. Never `COPILOT_GITHUB_TOKEN`.
- Do **not** sequentially try the next model or agent inside Noema or naruon.
  Routing is pinned to `orchestrator/free`, the fail-closed zero-cost pool,
  ZDR-first — not the paid-inclusive full pool. Do not configure a
  direct-provider fallback. Shared preflight lives in
  `scripts/verify-orchestrator-gateway.mjs`.
- Keep the OIDC token-broker, GitHub App identities, and sandbox/runner
  isolation boundaries intact. Do not clone an OpenCode sidecar or copy
  OpenCode bot model-candidate lists.
<!-- END cwl-agent-guidance -->

## Code-owner review gates — disabled (on hold)

As of 2026-08-04, code-owner review requirements (`require_code_owner_reviews` in branch
protection, `require_code_owner_review` in rulesets) are disabled across the ContextualWisdomLab
org: there is a single maintainer (solo developer), so a code-owner approval gate can never be
satisfied. This is ON HOLD until the org has multiple maintainers — do NOT re-enable these
settings or add CODEOWNERS-based merge gates before then.