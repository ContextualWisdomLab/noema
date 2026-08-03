# CodeGraph Quarantine Sandbox Design

## Status

Approved for autonomous implementation as the next issue #9 security slice.

## Buyer-visible gap

Noema now separates untrusted evidence collection from privileged LLM verdict publication, but CodeGraph still parses attacker-controlled repository content as a host subprocess in the evidence job. The job has no LLM or write credential, yet a parser compromise could still reach the runner filesystem, the GitHub read token present in the host environment, or the Docker daemon. A security buyer will expect a concrete execution boundary rather than environment-variable scrubbing alone.

## Design decision

Run all CodeGraph parsing inside a short-lived Docker container launched by trusted Noema code. The exact target checkout is mounted read-only. The container receives no GitHub, Noema, Cloudflare, or model environment variables; has no network; cannot access the Docker socket; and has a read-only root filesystem. A tmpfs scratch workspace receives a sanitized copy of the repository with `.git` omitted so analysis cannot mutate the checkout or depend on host Git credentials.

The trusted workflow starts from the minimal non-root Distroless Node 24 source tag:

`gcr.io/distroless/nodejs24-debian13:nonroot`

It pulls the source tag in a credential-free step, resolves the registry-provided immutable digest, requires the digest to remain under `gcr.io/distroless/nodejs24-debian13`, verifies the image's Sigstore keyless signature against Google's documented Distroless identity, and runs a Trivy vulnerability gate for fixable MEDIUM, HIGH, and CRITICAL findings. Only the authenticated and scanned `@sha256:` reference is exported to the analysis step. The Docker runner accepts only that repository/digest shape and uses `--pull=never`, preventing tag drift or a new image pull after the GitHub read token enters the process environment.

The same resolution, signature verification, vulnerability scan, and real-container smoke test run in `reviewer-ci`, so a release cannot rely solely on static command assertions.

## Isolation controls

The Docker invocation must include:

- `--network=none`;
- `--read-only`;
- `--cap-drop=ALL`;
- `--security-opt=no-new-privileges=true` and the built-in Docker seccomp profile;
- `--pids-limit=128`;
- `--memory=1g` and `--memory-swap=1g`;
- `--cpus=2`;
- bounded `nofile`, `nproc`, and `core` ulimits;
- a non-root UID/GID matching the runner process;
- bounded `noexec,nosuid,nodev` tmpfs mounts for `/workspace` and `/tmp`;
- read-only bind mounts for the untrusted checkout, the lock-pinned CodeGraph installation, and the trusted sandbox entrypoint;
- no bind mount of `/var/run/docker.sock` or any credential directory.

The host runner sets an explicit minimal child environment containing only `PATH`. The container receives only deterministic non-secret variables needed by CodeGraph (`HOME`, `XDG_CACHE_HOME`, `CODEGRAPH_NO_UPDATE_CHECK`, `DO_NOT_TRACK`, and `NO_COLOR`). Distroless contains no shell; the trusted entrypoint and CodeGraph npm shim are invoked directly through the Distroless Node binary.

## Input and output quotas

The trusted Node entrypoint recursively copies regular files from `/input` into tmpfs while:

- rejecting symlinks and non-regular filesystem objects;
- excluding `.git` directories;
- limiting input to 20,000 files;
- limiting each file to 8 MiB;
- limiting aggregate copied bytes to 200 MiB;
- stripping executable bits and preserving no ownership metadata.

CodeGraph commands run without a shell. Each command has a 180-second timeout and a 128-KiB combined stdout/stderr limit. The complete sandbox session is bounded by a 10-minute host timeout and its final output is still truncated by the existing manifest budget.

## Analysis flow

The entrypoint runs, in one container lifecycle:

1. `codegraph init -i`;
2. `codegraph sync`;
3. `codegraph status`;
4. `codegraph explore <bounded changed-file scope>`.

Running the sequence in one ephemeral container preserves the `.codegraph` index while keeping all derived state inside tmpfs. Any quota violation, timeout, non-zero command, malformed input, image authentication failure, vulnerability gate failure, or Docker failure becomes a visible failed check or `unavailable:` CodeGraph evidence reason and therefore blocks strict review.

## Code boundaries

- `reviewer/noema_reviewer/sandbox.py`: validates trusted paths and the verified image reference, constructs the fixed Docker command, strips the environment, enforces the host timeout, cleans up timed-out containers, and returns bounded stdout.
- `.github/codegraph/sandbox-runner.mjs`: validates/copies untrusted files and runs the lock-pinned CodeGraph commands through the Distroless Node binary inside the container.
- `reviewer/noema_reviewer/github_io.py`: accepts a `CodeGraphRunner` callback and uses the Docker runner in production while preserving injectable offline tests.
- `.github/workflows/central-review.yml`: resolves, authenticates, and scans the Distroless image before passing `DockerCodeGraphRunner` during manifest collection.
- `.github/workflows/reviewer-ci.yml`: repeats image verification and scanning and executes a real no-network sandbox smoke test.

## Verification

Tests and CI must prove:

- Docker flags enforce network, privilege, seccomp, process, memory, CPU, filesystem, and tmpfs restrictions;
- the child environment excludes GitHub and Noema credentials;
- the image reference cannot be overridden to a tag, another registry/repository, or a malformed digest;
- Cosign identity verification and the MEDIUM-or-higher Trivy image gate complete before analysis;
- invalid source/tooling paths, timeout, cleanup, and non-zero container exits fail visibly;
- current manifest collection records sandbox failure as missing evidence;
- the workflow resolves and verifies the image before the GitHub-token-bearing collection step and never executes host CodeGraph against target source;
- the entrypoint rejects symlinks, oversized files, excessive file counts, excessive aggregate bytes, and excessive command output;
- reviewer CI successfully runs the actual container against a small untrusted fixture.

## Non-goals

- This slice does not execute repository tests or build scripts.
- It does not grant outbound allowlists.
- It does not claim full VM or microVM isolation; a future high-assurance tier may move the same contract to a dedicated ephemeral runner or Firecracker-based service.
- It does not fabricate production, customer, revenue, or transfer evidence.

## Authoritative references

- GitHub Actions secure-use guidance: https://docs.github.com/en/actions/reference/security/secure-use
- Docker `run` security and resource options: https://docs.docker.com/reference/cli/docker/container/run
- Docker runtime resource constraints: https://docs.docker.com/engine/containers/run/
- Distroless images and keyless verification identity: https://github.com/GoogleContainerTools/distroless
- Cosign verification: https://docs.sigstore.dev/cosign/verifying/verify/
- Trivy image scanning: https://trivy.dev/latest/docs/target/container_image/
