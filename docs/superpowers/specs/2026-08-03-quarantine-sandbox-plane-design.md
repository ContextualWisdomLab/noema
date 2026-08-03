# Quarantine Sandbox Execution Plane Design

## Problem

Noema now separates untrusted evidence collection from privileged verdict publication, but trusted analyzers still process a checked-out target tree on the host runner. Buyer and security-review due diligence will expect an enforceable execution boundary before Noema offers optional parser, data-analysis, or test execution modes.

## Decision

Add a credential-free Docker quarantine step to the `collect_evidence` job. The step performs bounded source analysis in a container created from a versioned minimal image that is resolved to an immutable image ID for the run. The container receives no GitHub, Noema, LLM, or Cloudflare credentials.

The sandbox must enforce:

- target source mounted read-only;
- container root filesystem read-only;
- `--network none` outbound-network denial;
- all Linux capabilities dropped and `no-new-privileges` enabled;
- a non-root numeric user;
- one CPU, 512 MiB memory, 64 processes, and a 120-second wall-clock limit;
- 50,000 input files, 1 GiB aggregate input, 64 MiB per-file, and 512-byte relative-path limits;
- an 8 MiB tmpfs output filesystem and 64 MiB no-exec tmpfs scratch filesystem;
- explicit rejection of symlinks, sockets, devices, and other non-regular input nodes.

## Components

### `scripts/lib/quarantine-sandbox.mjs`

Owns the deterministic policy, source-tree inventory, Docker argument construction, and evidence validation. It has no GitHub-specific behavior.

### `scripts/run-quarantine-sandbox.mjs`

Pulls the approved versioned image, resolves it to the local immutable image ID and repository digest, creates the hardened container without a shell, runs it with a host-side timeout, copies the bounded tmpfs output before deleting the container, validates the evidence, and writes a host-authored final evidence JSON.

### `scripts/quarantine-analyzer.sh`

Runs inside the container. It proves the source and root filesystem are not writable, verifies only the loopback interface is present, rejects sensitive environment-variable names, and writes a bounded source-analysis result to `/output`.

### Strict manifest binding

`ReviewManifest` gains `sandbox_status`. Strict review blocks when the field is blank, unavailable, or does not begin with `passed:`. The collection workflow reads the validated quarantine evidence, binds a concise immutable-image and control summary into the manifest, and includes both evidence files in the one-day checksum-protected artifact.

## Failure behavior

Input-limit violations, Docker errors, container timeout, failed isolation probes, missing output, malformed evidence, image identity mismatch, or checksum mismatch fail closed and prevent review publication. No fallback executes target code on the host.

## Testing

- Vitest covers input inventory, symlink/special-node rejection, every required Docker security option, and evidence validation.
- Reviewer tests cover strict-mode blocking for absent, blank, unavailable, and failed sandbox evidence.
- Workflow contract tests require the quarantine step before manifest serialization, no secret environment on the step, and checksum/upload of quarantine evidence.
- Existing `release:verify`, 100% reviewer line/branch coverage, docstring coverage, Security Scan, and CodeRabbit gates remain mandatory.

## Scope boundary

This slice executes only a trusted bounded analyzer over untrusted files. It establishes the isolation primitive needed for later opt-in target test execution; it does not yet run repository scripts or allow package-index/GitHub network exceptions.