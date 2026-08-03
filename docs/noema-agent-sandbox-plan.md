# Noema Agent Sandbox Plan

This plan tracks ContextualWisdomLab/noema#9 for CWL Project #1 and
ContextualWisdomLab/naruon#974.

## Decision

Noema Worker remains the token exchange boundary. It verifies GitHub OIDC,
repository ownership, and trusted central workflow identity, then returns a
scoped GitHub App installation token.

The review bot agent runs in a separate quarantined execution plane. That plane
may be implemented with Codex, OpenCode, PydanticAI, or another driver behind a
small `ReviewAgent` interface, but it must not run untrusted repository code in
the Noema Worker process.

## Execution Boundary

The sandbox job owns untrusted file analysis, CodeGraph generation, code
writing, and data analysis. The Noema Worker owns only token exchange policy.

Minimum sandbox controls:

- checkout or archive input is treated as untrusted and mounted read-only by
  default;
- no Noema secrets or Cloudflare credentials are present in the sandbox;
- outbound network is denied by default, with explicit allowlist exceptions for
  package index or GitHub API calls required by the selected analysis mode;
- CPU, memory, wall-clock time, file count, and output byte limits are enforced;
- CodeGraph initialization is attempted before text-only search, and its status
  is written to the review artifact;
- every skipped tool, failed tool, missing SARIF/log, and blocked decision is
  recorded with a visible reason in the artifact.

## Agent Contract

The agent driver receives:

- repository owner/name, pull request number, base SHA, and head SHA;
- a bounded input manifest of files, workflow logs, SARIF, dependency reports,
  review comments, and CodeGraph status;
- an explicit capability set for read-only analysis, patch proposal, test
  execution, and review publication.

The driver returns JSON:

```json
{
  "verdict": "approve | request_changes | blocked",
  "summary": "short reviewer-facing summary",
  "findings": [
    {
      "severity": "critical | high | medium | low | info",
      "path": "relative/path",
      "line": 1,
      "evidence": "log, SARIF, test, or source reference",
      "recommendation": "specific fix"
    }
  ],
  "suggested_patch_ref": "optional artifact path or branch",
  "blocked_reasons": ["missing required log/SARIF/review context"],
  "confidence": "high | medium | low"
}
```

Noema-issued installation tokens are used only after the sandboxed agent has a
bounded verdict to publish. The token scope is limited to the target repository
and central review workflow permissions.

## Implemented trust-boundary slice

The trusted `central-review` workflow now uses two independent GitHub Actions
jobs:

1. `noema-evidence-collection` checks out and parses the exact target head with
   a repository-scoped read-only App token. It has no LLM credential and no
   pull-request write authority. CodeGraph subprocesses inherit a scrubbed
   environment, and the job serializes only the bounded `ReviewManifest`.
2. `noema-review-publication` never checks out target source. It downloads the
   one-day manifest artifact, verifies its SHA-256 checksum, revalidates the
   repository, PR number, and live head SHA, then introduces the LLM credential
   and pull-request write token solely to produce and publish the verdict.

This split follows GitHub's secure-use guidance to isolate privileged secrets
from jobs that process untrusted repository content. The manifest is still
considered untrusted data after handoff; Pydantic validation, deterministic
strict gates, exact-head publication checks, and the model's no-tool interface
remain mandatory.

## Acceptance Criteria

- Scheduled or queued review attempts never fail silently; logs explain whether
  a failure came from missing evidence, dependency vulnerability, CodeGraph
  failure, sandbox timeout, model exhaustion, or GitHub API rejection.
- Medium-or-higher dependency findings from OSV, Trivy, and dependency-review
  are remediated by package bump or source change, not by gate weakening.
- The sandbox has tests proving untrusted files cannot read Noema credentials.
- The review artifact preserves every reviewed PR comment and every current
  GitHub check conclusion used in the verdict.
- Manual strict runs fail when required logs, SARIF, tests, or evidence are
  missing; scheduled monitor runs may warn and preserve artifacts when the only
  missing input is external production/acquisition evidence.

## Remaining quarantine work

The two-job split removes LLM and write credentials from the untrusted source
processing job, but it is not the final issue #9 sandbox. The remaining slice
must add an execution plane with read-only source mounts, outbound-network
deny-by-default, explicit CPU/memory/file/output quotas, and tests proving that
untrusted parsers or optional test execution cannot reach reviewer credentials.
Until then, Noema continues to analyze source without executing repository
scripts, rejects symlinks, installs only trusted lock-pinned tooling with
lifecycle scripts disabled, and fails closed when evidence is incomplete.

## Implementation status

The judgement plane is implemented as the Python package `reviewer/noema_reviewer`
(a PydanticAI `ReviewAgent` driver). It returns the JSON verdict contract above,
enforces the two deterministic gates (strict-evidence blocking and
MEDIUM-or-higher dependency downgrade) around the model, preserves reviewed PR
comments and current check conclusions in its manifest, and records CodeGraph
status. The Noema Worker (`src/`) remains the token-exchange boundary only. The
package ships with 100% line/branch test coverage and 100% docstring coverage,
driven offline with PydanticAI `TestModel`/`FunctionModel` and a stub `gh`
runner. See `reviewer/README.md` for usage and configuration.