# Quarantined patch validation

Noema can validate an untrusted text patch against a bounded source snapshot without exposing repository write credentials, reviewer-model credentials, NVIDIA NIM credentials, Cloudflare credentials, OIDC tokens, publication credentials, or the Docker socket to the code being tested.

## What this feature does

The trusted reviewer process receives:

- the repository full name;
- the exact base commit SHA;
- the exact head commit SHA;
- the SHA-256 digest of the patch bytes; and
- one approved validation profile.

It performs a strict patch preflight, copies the verified bytes to a private owner-only staging path, starts a digest-pinned validator image with no network access and bounded resources, and accepts only a bounded result artifact that repeats the exact request identity.

The current approved profile is:

| Profile | Command executed inside the validator image |
|---|---|
| `node_release_verify` | `npm run release:verify` |

Callers cannot supply arbitrary shell commands.

## Source identity

When `source_root` is a Git working tree, Noema runs a non-shell `git rev-parse HEAD` check before Docker starts and requires the observed commit to equal the request's exact `head_sha`. A mismatch fails closed.

A source snapshot without `.git` metadata can still be validated, but this module cannot independently prove its commit identity. The trusted caller must authenticate that snapshot through a separate exact-source evidence mechanism before treating the sandbox result as revision-bound evidence.

The request's `base_sha` identifies the patch comparison boundary and is repeated in the result. The current runner does not reconstruct or fetch that base commit and performs no network access.

## Safety model

The source checkout, patch content, repository scripts, and validator output are treated as potentially hostile. The source is mounted read-only. The original patch path is never mounted: after descriptor-safe verification and digest matching, its exact bytes are copied into a private temporary directory and that staged copy is mounted read-only.

The container runs as a non-root user with all Linux capabilities dropped, no network, no writable root filesystem, no Docker socket, isolated IPC, and bounded CPU, memory, process, file-descriptor, tmpfs, and wall-time resources.

The child process receives only the minimum executable path and exact validation identity. GitHub, Noema reviewer, NVIDIA NIM, Cloudflare, OIDC, and publication credentials are intentionally absent.

## Patch rules

A patch is rejected before Docker starts when it is:

- empty, oversized, non-UTF-8, binary, symlinked, unstable, or not a regular file;
- malformed or missing `diff --git` headers;
- changing more than the configured file limit;
- repeating a target path;
- using traversal, an absolute path, raw backslashes, malformed quoted paths, or control characters;
- creating or deleting symlinks or gitlinks;
- redirecting through `---`, `+++`, `rename from`, `rename to`, `copy from`, or `copy to` metadata into a protected path; or
- touching protected governance paths such as `.github/workflows/`, `.github/actions/`, `.git/`, root or documented `CODEOWNERS`, `.gitmodules`, or Dependabot configuration.

These restrictions intentionally keep governance and trust-policy changes out of an automated patch-execution plane. Such changes require the normal protected pull-request path and independent review.

## Result boundary

The container receives one private writable output directory and must write `/output/result.json`. Host-side stdout and stderr are discarded for normal execution so hostile output cannot become an unbounded evidence channel.

The result file is read through the same descriptor-safe regular-file checks as the patch and is limited to 16 KiB. Its JSON schema:

- rejects unknown fields;
- bounds duration, excerpts, exit code, and reason-code count and syntax;
- requires `PASSED` evidence to report exit code `0`;
- repeats repository, base SHA, head SHA, patch digest, and profile; and
- must report the command baked into the selected profile.

Any missing, malformed, oversized, inconsistent, or identity-mismatched result fails closed. A compatibility fallback exists only for injected test runners that return a bounded stdout string; the real subprocess path writes the result file.

## Python API

```python
from pathlib import Path

from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
)

request = PatchValidationRequest(
    repository_full_name="ContextualWisdomLab/noema",
    base_sha="0" * 40,
    head_sha="1" * 40,
    patch_sha256="2" * 64,
    profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
)

result = DockerPatchValidationRunner().validate(
    request=request,
    source_root=Path("/trusted/read-only/source"),
    patch_path=Path("/trusted/read-only/change.patch"),
)
```

The example digest values are placeholders. Production callers must calculate the actual patch SHA-256, bind the real exact base and head commits, and authenticate any non-Git source snapshot independently.

## Required environment

`NOEMA_PATCH_SANDBOX_IMAGE` must contain an independently verified immutable image reference:

```text
ghcr.io/contextualwisdomlab/noema-patch-validator@sha256:<64-lowercase-hex-characters>
```

Mutable tags and images from other repositories are rejected.

This library checks the reference shape and runs with `--pull=never`; it does not itself sign, scan, download, or attest the image. The trusted workflow must separately verify image signature, provenance, vulnerability policy, and real no-network behavior before enabling this boundary in a release path.

## Interpreting results

A returned `PatchValidationResult` is evidence only for the supplied repository, base, head, patch digest, profile, source snapshot, and validator image used by that execution. The caller must reject any identity or command mismatch.

A passed validation does not mean that the pull request is approved or releasable. Merge still requires the repository's protected-branch policy, exact-head required checks, independent approval, security gates, resolved review threads, provenance requirements, and release-acceptance gates.

## Operational failure behavior

The feature fails closed when:

- the image reference is missing or mutable;
- the source or patch cannot be read safely;
- a Git source HEAD differs from the exact request;
- Docker cannot start;
- execution exceeds the wall-time limit;
- the container exits non-zero;
- result JSON is missing, malformed, oversized, inconsistent, or outside schema bounds; or
- the result does not exactly match the request.

Timeout handling attempts a bounded forced container removal. The private staged patch and output directory are deleted when validation exits. Infrastructure diagnostics are truncated before being returned.

## Verification

Run the reviewer test and documentation gates:

```bash
cd reviewer
python -m pytest
interrogate --fail-under 100 noema_reviewer
```

Repository CI enforces 100 percent production statement and branch coverage and 100 percent public docstring coverage. A separate trusted workflow must additionally verify, scan, and smoke-test the actual patch-validator image before production integration.

For the design rationale and APA 7th references, see `docs/doctoring/quarantined-patch-validation.md`.
