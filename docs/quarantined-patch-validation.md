# Quarantined patch validation

Noema can validate an untrusted text patch against an exact source revision without exposing repository write credentials, reviewer-model credentials, Cloudflare credentials, OIDC tokens, or the Docker socket to the code being tested.

## What this feature does

The trusted reviewer process receives:

- the repository full name;
- the exact base commit SHA;
- the exact head commit SHA;
- the SHA-256 digest of the patch file; and
- one approved validation profile.

It performs a strict patch preflight, starts a digest-pinned validator image with no network access and bounded resources, and accepts only a small JSON result that repeats the exact request identity.

The current approved profile is:

| Profile | Command executed inside the validator image |
|---|---|
| `node_release_verify` | `npm run release:verify` |

Callers cannot supply arbitrary shell commands.

## Safety model

The source checkout and patch file are treated as untrusted. They are mounted read-only. The container runs as a non-root user with all Linux capabilities dropped, no network, no writable root filesystem, no Docker socket, isolated IPC, and bounded CPU, memory, process, file-descriptor, tmpfs, and wall-time resources.

The child process receives only the minimum executable path and exact validation identity. GitHub, Noema reviewer, NVIDIA NIM, Cloudflare, OIDC, and publication credentials are intentionally absent.

## Patch rules

A patch is rejected before Docker starts when it is:

- empty, oversized, non-UTF-8, binary, symlinked, unstable, or not a regular file;
- malformed or missing `diff --git` headers;
- changing more than the configured file limit;
- repeating a target path;
- using traversal, an absolute path, raw backslashes, or control characters;
- creating or deleting symlinks or gitlinks; or
- touching protected governance paths such as `.github/workflows/`, `.github/actions/`, `.git/`, `CODEOWNERS`, `.gitmodules`, or Dependabot configuration.

These restrictions intentionally keep governance and trust-policy changes out of an automated patch-execution plane. Such changes require the normal protected pull-request path and independent review.

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

The example digest values are placeholders. Production callers must calculate the actual patch SHA-256 and bind the real exact base and head commits.

## Required environment

`NOEMA_PATCH_SANDBOX_IMAGE` must contain the independently verified immutable image reference:

```text
ghcr.io/contextualwisdomlab/noema-patch-validator@sha256:<64-lowercase-hex-characters>
```

Mutable tags and images from other repositories are rejected.

## Interpreting results

A returned `PatchValidationResult` is evidence only for the exact repository, base, head, patch digest, and profile in the request. The caller must reject any identity or command mismatch.

A passed validation does not mean that the pull request is approved or releasable. Merge still requires the repository's protected-branch policy, exact-head required checks, independent approval, security gates, resolved review threads, provenance requirements, and release-acceptance gates.

## Operational failure behavior

The feature fails closed when:

- the image reference is missing or mutable;
- the source or patch cannot be read safely;
- Docker cannot start;
- execution exceeds the wall-time limit;
- the container exits non-zero;
- result JSON is malformed or exceeds its schema bounds; or
- the result does not exactly match the request.

Timeout handling attempts a bounded forced container removal. Diagnostics are truncated before being returned so hostile output cannot create an unbounded log or response.

## Verification

Run the reviewer test and documentation gates:

```bash
cd reviewer
python -m pytest
interrogate --fail-under 100 noema_reviewer
```

Repository CI additionally enforces 100 percent production statement and branch coverage and performs the configured image verification, vulnerability scan, and no-network sandbox smoke test before this capability can be accepted.

For the design rationale and APA 7th references, see `docs/doctoring/quarantined-patch-validation.md`.
