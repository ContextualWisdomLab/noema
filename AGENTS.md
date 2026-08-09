# AGENTS.md

Cross-agent conventions for the `noema` repo, readable by any coding agent
(Claude, Codex, Cursor, opencode, …). `noema` is a TypeScript Cloudflare
Worker (npm + `wrangler.toml`); tests run under Vitest.

<!-- BEGIN cwl-agent-guidance -->
## Agent guidance (CWL governance)

### Realistic remediation before escalation
- Do not stop at the first unavailable tool, connector operation, edit path, or
  network path. First enumerate every safe candidate path that the current
  environment actually exposes, then choose the narrowest viable path.
- For each candidate, verify permissions, prerequisites, exact-head binding,
  expected diff, and failure behavior with read-only, dry-run, or no-op evidence
  whenever possible. Reject a candidate only on observed evidence, not an
  assumption that a connector or checkout cannot perform the operation.
- A connector-backed full-file replacement is acceptable when the exact current pull-request head
  and current blob SHA are re-read immediately before the write, the exact
  fetched bytes receive a deterministic minimal transformation, the resulting
  comparison proves there is no unrelated diff, and the stale blob identity
  causes the write to fail rather than overwrite another writer.
- Prefer a connector-backed write or a trusted local checkout. Never create, restore, or use repair workflows,
  self-modifying Actions, branch-patching `contents:write` automation, or
  protection bypasses as a substitute for a normal repository write path.
- Only report a tooling or permission blocker after every safe candidate has
  been attempted or concretely proven infeasible. Separate a real external
  approval, permission, policy, or infrastructure gate from an untried option,
  and continue other bounded work while the external gate remains open.

### Mandatory RCA and feasibility protocol
The hourly product-development scheduler consumes this section through its
required `AGENTS.md` preflight. For every failed, blocked, stale, or unexpected
local source, test, documentation, dependency, or tool result:

1. First capture exact evidence from the failing boundary and reproduce or
   isolate it on the current source state. Trace the causal chain, state one
   falsifiable root-cause hypothesis, and record what observation would
   disprove it.
2. Generate materially distinct remediation candidates. Do not relabel the
   same retry, no-op edit, or unsupported operation as a new remedy.
3. Before acting, empirically verify authority, capability, exact target, policy, reversibility, remaining time,
   dependency and tool availability, blast radius, and an observable test oracle
   for each candidate.
4. Classify each candidate as execute_now, defer_until_trigger, external_only, or reject.
   Execute the smallest safe `execute_now` option test-first, verify the result,
   and return to RCA with the new evidence when the hypothesis fails.
5. After three failed repair hypotheses, stop speculative patch stacking and
   treat the architecture or contract boundary as the suspected cause.

Do not stop at naming a blocker. This scheduler's OpenCode process runs in an
uncredentialed proposal workspace and cannot clear GitHub approvals, required Checks, repository settings, secrets, or external infrastructure.
Record such a gate, its direct evidence, and a concrete continuation trigger in
`PR_MESSAGE.md`; then continue bounded non-conflicting work when it cannot race
another writer or invalidate the selected product slice. Never claim an
external state transition that this authority boundary cannot perform or
verify.

### Work-conserving continuation and deliverable handoff
A prompt update, documentation assessment, design, RCA, test, commit, review request, merge, or blocked lane is an intermediate state, not an invocation endpoint. A user-visible report is never completion.

Every artifact must hand off to the next executable boundary:

- RCA must hand off to a feasible action or a precisely evidenced deferred trigger.
- design must hand off to implementation within the selected bounded product slice.
- test must hand off to production code, then focused and full verification.
- documentation assessment must hand off to canonical repository files and machine-checkable contracts.
- local changes must hand off to an intentional commit and pull request.
- pull request must hand off to exact-head checks, review remediation, and merge when governance permits.
- merge must hand off to protected-main operational acceptance and the next executable queue item.

If one handoff is blocked, defer only that lane and rotate to another safe,
non-conflicting action. After documentation repair, documentation repair must be followed by the highest-value non-documentation work that remains executable in the same invocation.

Before ending, perform a mandatory double exit sweep across open pull requests,
issues, changed branches, current defects, review/check state, operational
acceptance, documentation drift, release evidence, and buyer-visible gaps. If
either sweep finds a safe action, execute it and sweep again. End only when the
practical run budget is genuinely exhausted or the second fresh sweep proves
all remaining work non-actionable under current authority, writer lease,
dependency order, and safety constraints.

### Security & review gate
- Every PR must ultimately pass the central **Security Scan** required gate. It
  runs `osv-scan` + `dependency-review` (diff-scoped) and `trivy-fs` (repo-wide,
  CRITICAL/HIGH, fixable only). Central Security Scan currently triggers only for pull requests whose base branch is `main`, `master`, or `develop`.
  A stacked pull request whose base is another feature branch therefore has no
  central Security Scan run until it is retargeted or rebased after its predecessor integrates.
  Treat that absence as `defer_until_trigger`, never as passing evidence. Do not retarget a stacked pull request merely to manufacture the check when that would duplicate its predecessor's diff or violate dependency order.
  After the predecessor integrates, refresh the stack onto an eligible base and
  require a terminal-success Security Scan on the then-current exact head before
  merge authority is considered.
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

## Code-owner review gates — disabled (on hold)

As of 2026-08-04, code-owner review requirements (`require_code_owner_reviews` in branch
protection, `require_code_owner_review` in rulesets) are disabled across the ContextualWisdomLab
org: there is a single maintainer (solo developer), so a code-owner approval gate can never be
satisfied. This is ON HOLD until the org has multiple maintainers — do NOT re-enable these
settings or add CODEOWNERS-based merge gates before then.
