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
  package index or GitHub API calls required by a separately reviewed mode;
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

## Implemented trust boundaries

### Credential-separated jobs

The trusted `central-review` workflow uses two independent GitHub Actions jobs:

1. `noema-evidence-collection` checks out and parses the exact target head with
   a repository-scoped read-only App token. It has no LLM credential and no
   pull-request write authority. The job serializes only the bounded
   `ReviewManifest`.
2. `noema-review-publication` never checks out target source. It downloads the
   one-day manifest artifact, verifies its SHA-256 checksum, revalidates the
   repository, PR number, and live head SHA, then introduces the LLM credential
   and pull-request write token solely to produce and publish the verdict.

The manifest remains untrusted after handoff; Pydantic validation,
deterministic strict gates, exact-head publication checks, and the model's
no-tool interface remain mandatory.

### CodeGraph quarantine container

CodeGraph no longer parses target source as a host subprocess. Before any
GitHub-token-bearing analysis, the trusted workflow pulls the minimal non-root
Distroless Node 24 source tag
`gcr.io/distroless/nodejs24-debian13:nonroot`, resolves its immutable
`gcr.io/distroless/nodejs24-debian13@sha256:...` registry digest, verifies its
Sigstore keyless signature against
`keyless@distroless.iam.gserviceaccount.com`, and runs a fail-closed Trivy scan
for fixable MEDIUM, HIGH, and CRITICAL vulnerabilities. Only that authenticated
and scanned digest is exported to the parser step. The Docker runner rejects
tags, another repository, and malformed digests and launches with
`--pull=never`.

`reviewer-ci` repeats the image resolution, identity verification, and
vulnerability gate and then exercises the actual container against a small
untrusted fixture. This catches runtime compatibility failures that static
workflow assertions cannot prove.

The container receives:

- the exact target checkout as a read-only bind mount;
- the lock-pinned, lifecycle-script-disabled CodeGraph installation as a
  read-only bind mount;
- a reviewed Node entrypoint as a read-only bind mount;
- no GitHub, Noema, Cloudflare, model, or Docker credentials;
- no Docker socket and no outbound network.

The Distroless image has no shell. Its Node runtime starts the reviewed sandbox
entrypoint. The entrypoint then bypasses CodeGraph's shell launcher and invokes
the lock-pinned Linux package's bundled Node runtime and compiled JavaScript
entrypoint directly, including the upstream `--liftoff-only` and experimental
warning-suppression flags. No `/usr/bin/env`, shell, or PATH-based executable
resolution is used for target parsing.

The runtime enforces a read-only root filesystem, all capabilities dropped,
Docker's built-in seccomp profile, `no-new-privileges`, non-root UID/GID,
disabled IPC, 128 PIDs, 2 CPUs, 1 GiB memory with no swap expansion, bounded
ulimits, and `noexec,nosuid,nodev` tmpfs scratch space. The host Docker
subprocess receives only `PATH`.

The entrypoint copies regular files into tmpfs while excluding `.git`, rejecting
symlinks and special files, stripping executable bits, and enforcing 20,000
files, 8 MiB per file, and 200 MiB aggregate input limits. Each CodeGraph
command has a 180-second timeout and 128-KiB output cap; the complete container
has a 10-minute host timeout. Any image verification, vulnerability, quota, or
runtime failure becomes a visible failed check or `unavailable:` evidence
failure and blocks strict approval.

## Acceptance Criteria

- Scheduled or queued review attempts never fail silently; logs explain whether
  a failure came from missing evidence, dependency vulnerability, image
  verification, image vulnerability, CodeGraph failure, sandbox timeout, model
  exhaustion, or GitHub API rejection.
- Medium-or-higher dependency and sandbox-image findings from OSV, Trivy, and
  dependency-review are remediated by package/image bump or source change, not
  by gate weakening.
- Tests prove untrusted CodeGraph input cannot inherit reviewer or GitHub
  credentials, use outbound networking, mutate the checkout, or exceed the
  reviewed process, memory, file, byte, output, and time limits.
- Reviewer CI proves the authenticated image can run the real lock-pinned
  CodeGraph tool under the production isolation flags.
- The review artifact preserves every reviewed PR comment and every current
  GitHub check conclusion used in the verdict.
- Manual strict runs fail when required logs, SARIF, tests, or evidence are
  missing; scheduled monitor runs may warn and preserve artifacts when the only
  missing input is external production/acquisition evidence.

## Remaining quarantine work

This slice establishes a concrete container boundary for the parser that
processes untrusted repository content. Noema still does not execute repository
scripts. Any future test-execution or patch-validation capability must use a
separate reviewed sandbox profile with an immutable authenticated image,
explicit language runtime allowlist, no credentials, deny-by-default network
policy, bounded writable workspace, and artifact-only output.

For buyers requiring isolation stronger than the shared GitHub-hosted runner's
Docker kernel boundary, the same manifest contract can move to a dedicated
ephemeral runner or microVM/Firecracker execution service without changing the
privileged publication plane.

## Implementation status

The judgement plane is implemented as the Python package
`reviewer/noema_reviewer` (a PydanticAI `ReviewAgent` driver). It returns the
JSON verdict contract above, enforces strict-evidence blocking and
MEDIUM-or-higher dependency downgrade around the model, preserves reviewed PR
comments and current check conclusions, records containerized CodeGraph status,
and publishes only against the live exact head. The Noema Worker (`src/`)
remains the token-exchange boundary only. Reviewer code ships with 100% line and
branch coverage and 100% docstring coverage; the Worker release gate remains
`npm run release:verify`.