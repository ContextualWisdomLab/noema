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
<!-- END cwl-agent-guidance -->
