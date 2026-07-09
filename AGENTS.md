# AGENTS.md

Cross-agent conventions for the `noema` repo, readable by any coding agent
(Claude, Codex, Cursor, opencode, …). `noema` is a TypeScript Cloudflare
Worker (npm + `wrangler.toml`); tests run under Vitest.

<!-- BEGIN cwl-agent-guidance -->
## Agent guidance (CWL governance)

### Security & review gate
- Every PR must pass the central **Security Scan** required gate. It runs
  `osv-scan` + `dependency-review` (diff-scoped) and `trivy-fs` (repo-wide,
  CRITICAL/HIGH, fixable only). It runs on every PR base, **including stacked PRs**.
- A failing **`trivy-fs` is a REAL finding, not a flake.** Read the job log — it
  prints each finding's rule id / severity / file — or the run's SARIF results,
  then **remediate**:
  - For this repo, findings are almost always vulnerable npm dependencies: bump
    the package in `package.json` and refresh `package-lock.json`
    (`npm update <pkg>` or `npm install <pkg>@<fixed>`), preferring the transitive
    fix. There is no Dockerfile or k8s manifest today; if you add one, `trivy-fs`
    will also flag image/IaC misconfig — fix it at the source.
  - Only for a genuine false positive, add a narrow, **documented**
    `.trivyignore` (or `.trivyignore.yaml`) entry. Never weaken or disable the gate.
- A local scan with a stale DB misses findings. Run `trivy --download-db-only`
  first, then scan the **merge ref**, not just the PR head.
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
- The `scripts/*.mjs` audit/CI tooling reads `process.env` for non-secret knobs
  (file paths, thresholds) only; that is build-time config, out of scope for
  this rule. If any script ever needs a real secret, source it from the KV, not
  the environment.
<!-- END cwl-agent-guidance -->
