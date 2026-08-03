# CodeGraph Quarantine Sandbox Design

## Status

Approved for autonomous implementation as the next issue #9 security slice.

## Buyer-visible gap

Noema now separates untrusted evidence collection from privileged LLM verdict publication, but CodeGraph still parses attacker-controlled repository content as a host subprocess in the evidence job. The job has no LLM or write credential, yet a parser compromise could still reach the runner filesystem, the GitHub read token present in the host environment, or the Docker daemon. A security buyer will expect a concrete execution boundary rather than environment-variable scrubbing alone.

## Design decision

Run all CodeGraph parsing inside a short-lived Docker container launched by trusted Noema code. The exact target checkout is mounted read-only. The container receives no GitHub, Noema, Cloudflare, or model environment variables; has no network; cannot access the Docker socket; and has a read-only root filesystem. A tmpfs scratch workspace receives a sanitized copy of the repository with `.git` omitted so analysis cannot mutate the checkout or depend on host Git credentials.

The container uses the official Node 24 image pinned by digest:

`node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`

The workflow pulls this digest in a secret-free step and the analysis runner uses `--pull=never`, preventing runtime tag drift or an unexpected pull while the GitHub read token exists in the host process.

## Isolation controls

The Docker invocation must include:

- `--network=none`;
- `--read-only`;
- `--cap-drop=ALL`;
- `--security-opt=no-new-privileges=true`;
- `--pids-limit=128`;
- `--memory=1g` and `--memory-swap=1g`;
- `--cpus=2`;
- bounded `nofile`, `nproc`, and `core` ulimits;
- a non-root UID/GID matching the runner process;
- bounded `noexec,nosuid,nodev` tmpfs mounts for `/workspace` and `/tmp`;
- read-only bind mounts for the untrusted checkout, the lock-pinned CodeGraph installation, and the trusted sandbox entrypoint;
- no bind mount of `/var/run/docker.sock` or any credential directory.

The host runner sets an explicit minimal child environment containing only `PATH`. The container receives only deterministic non-secret variables needed by CodeGraph (`HOME`, `XDG_CACHE_HOME`, `CODEGRAPH_NO_UPDATE_CHECK`, `DO_NOT_TRACK`, and `NO_COLOR`).

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

Running the sequence in one ephemeral container preserves the `.codegraph` index while keeping all derived state inside tmpfs. Any quota violation, timeout, non-zero command, malformed input, or Docker failure becomes a visible `unavailable:` CodeGraph evidence reason and therefore blocks strict review.

## Code boundaries

- `reviewer/noema_reviewer/sandbox.py`: validates trusted paths, constructs the fixed Docker command, strips the environment, enforces the host timeout, cleans up timed-out containers, and returns bounded stdout.
- `.github/codegraph/sandbox-runner.mjs`: validates/copies untrusted files and runs the lock-pinned CodeGraph commands inside the container.
- `reviewer/noema_reviewer/github_io.py`: accepts a `CodeGraphAnalyzer` callback and uses the Docker analyzer in production while preserving injectable offline tests.
- `.github/workflows/central-review.yml`: pulls the pinned image in a secret-free step and passes `docker_codegraph_analyzer` during manifest collection.

## Verification

Tests must prove:

- Docker flags enforce network, privilege, process, memory, CPU, filesystem, and tmpfs restrictions;
- the child environment excludes GitHub and Noema credentials;
- the image reference cannot be overridden to an unpinned value;
- invalid source/tooling paths, timeout, cleanup, and non-zero container exits fail visibly;
- current manifest collection records sandbox failure as missing evidence;
- the workflow pulls the pinned image before the GitHub-token-bearing collection step and never executes host CodeGraph against target source;
- the entrypoint rejects symlinks, oversized files, excessive file counts, excessive aggregate bytes, and excessive command output.

## Non-goals

- This slice does not execute repository tests or build scripts.
- It does not grant outbound allowlists.
- It does not claim full VM or microVM isolation; a future high-assurance tier may move the same contract to a dedicated ephemeral runner or Firecracker-based service.
- It does not fabricate production, customer, revenue, or transfer evidence.

## Authoritative references

- GitHub Actions secure-use guidance: https://docs.github.com/en/actions/reference/security/secure-use
- Docker `run` security and resource options: https://docs.docker.com/reference/cli/docker/container/run
- Docker runtime resource constraints: https://docs.docker.com/engine/containers/run/
- Official Node image digest record: https://hub.docker.com/layers/library/node/24.18.0-bookworm-slim/images/out
