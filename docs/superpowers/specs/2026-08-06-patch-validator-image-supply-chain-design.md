# Patch-Validator Image Supply-Chain Design

## Status

Approved for autonomous implementation as issue #66's first executable slice. This branch is stacked on the exact head of PR #65. It must remain a draft until the image runtime, build gate, security gate, documentation, and exact-head checks are complete. Publication and reviewer-flow activation require PR #65 and this slice to land on protected `main`; they never justify bypassing issues #27 or #29.

## Buyer-visible gap

PR #65 establishes a credential-free host boundary for validating a text patch against an authenticated Git tree, but the configured image reference does not yet correspond to a repository-owned, reproducibly described validator image. A buyer cannot independently answer which code ran, which dependencies were present, whether the image was scanned and signed, whether the supplied patch could weaken its own validator, or whether the result was produced by the exact digest recorded in review evidence.

## Design decision

Build a dedicated Linux/amd64 patch-validator image at:

`ghcr.io/contextualwisdomlab/noema-patch-validator`

The image uses a digest-pinned Node 24 builder and a digest-pinned, shell-free Distroless Node 24 runtime. The builder installs the repository's reviewed lockfile with scripts disabled. The final image receives only the image-owned validator entrypoint and the lock-pinned Node modules needed for fixed typecheck and test commands; it receives no package manager, shell, Git client, repository source, credentials, or Docker socket.

The first supported validation profile is `node_patch_verify`. It runs image-owned commands rather than a caller-controlled `package.json` script:

1. copy the authenticated `/input` snapshot into private tmpfs;
2. parse and apply the already host-preflighted text patch again with an image-owned strict unified-diff state machine;
3. run the lock-pinned TypeScript compiler through the image's Node runtime;
4. run lock-pinned Vitest with the reviewed coverage configuration through the image's Node runtime;
5. emit one bounded structured result to `/output/result.json`.

The profile refuses changes to validator-control and dependency-control paths, including `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `reviewer/`, `patch-validator/`, and every GitHub workflow/action path. Dependency changes require a separately reviewed image rebuild; a patch being tested cannot install a package, alter the test command, weaken coverage, or replace the validator.

## Trust and authority separation

The system preserves these separate authorities:

- **source review:** decides whether the exact Git revision is acceptable;
- **image build:** creates a digest from reviewed source and lockfiles;
- **image verification:** verifies base identity, final digest, vulnerability results, SBOM, signature, and provenance;
- **patch execution:** runs untrusted source and patch bytes without credentials or network;
- **model judgement:** consumes bounded evidence only;
- **GitHub review publication:** uses the Reviewer App after execution has completed;
- **merge, release, and deployment:** remain protected repository decisions.

A successful image workflow is not approval. A signed image is not a merge authorization. The image digest recorded in patch-validation evidence must equal the digest selected by the trusted caller; tags and predecessor digests are not admissible evidence.

## Image construction

### Builder

The builder is pinned to the multi-platform index for Node.js 24.16.0 Bookworm Slim:

`node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203`

The builder:

- copies only `package.json` and `package-lock.json` before dependency installation;
- runs `npm ci --ignore-scripts --no-audit --no-fund`;
- verifies the expected TypeScript, Vitest, and coverage-provider executables exist;
- never receives a registry credential, GitHub token, OIDC token, model credential, or build secret;
- does not execute repository lifecycle scripts.

Builder packages do not enter the final image except the reviewed Node dependency graph. Builder vulnerabilities are recorded in provenance but the publication gate scans the final image independently.

### Runtime

The runtime is pinned to the exact signed Distroless Node 24 Debian 13 digest already exercised by reviewer CI:

`gcr.io/distroless/nodejs24-debian13@sha256:fbbdda866ea71aef98c4abece17e3d61fbf820cc2ef3961522caa2478716171a`

The runtime:

- declares numeric non-root user `65532:65532`;
- uses an exec-form image-owned entrypoint;
- contains no shell or package manager;
- writes only to caller-supplied tmpfs and the single pre-created result file;
- reads `/input` and `/patch/input.patch` only;
- uses no network and no Docker socket at execution time;
- accepts no arbitrary command, script path, package manager option, or validator configuration from the request.

The first release is explicitly Linux/amd64. An arm64 digest requires its own real build, scan, smoke, signature, SBOM, provenance, parity evidence, and activation decision.

## Runtime patch contract

The image-owned patch applier supports ordinary canonical text modifications, creations, and deletions. It revalidates:

- strict UTF-8 and a bounded patch size;
- canonical repository-relative paths;
- one `diff --git` section per target path;
- complete `---` and `+++` identity;
- exact unified-hunk counts;
- context and removed-line equality against the authenticated snapshot;
- canonical `/dev/null` creation or deletion;
- final-newline markers;
- bounded changed-file and output sizes.

The first profile rejects rename, copy, binary, symlink, gitlink, mode-only, dependency, governance, validator, and configuration changes. Expanding this language requires new failing tests, a profile version change, documentation, and a new image digest.

No arbitrary JavaScript is accepted as a tool. The validator executes only its own entrypoint and two fixed Node module paths. Child processes use `process.execPath`, `shell: false`, a minimal environment, explicit working directory, bounded output, and command deadlines.

## Result contract

The result repeats:

- repository full name;
- base SHA;
- head SHA;
- patch SHA-256;
- validation profile;
- fixed command-profile identifier;
- validator image digest;
- terminal status and exit code;
- bounded duration, excerpts, and reason codes.

The host must reject a result whose image digest differs from the exact `NOEMA_PATCH_SANDBOX_IMAGE` reference. This prevents valid-looking evidence from one image being replayed as evidence for another.

## Pull-request verification workflow

Pull requests receive a read-only `patch-validator-image` workflow with no package, attestation, OIDC, reviewer, model, publication, or deployment credential. It must:

1. check out the exact PR revision without persisted credentials;
2. verify both base references are digest-pinned and the runtime base's Distroless keyless signature is valid;
3. run root and reviewer tests through existing mandatory workflows;
4. build the exact Dockerfile for Linux/amd64;
5. inspect the image for numeric non-root user, exact entrypoint, and absence of shell/package-manager executables;
6. run a real no-network, read-only-root, capability-dropped smoke test that applies a small patch and produces request-bound JSON;
7. generate a CycloneDX 1.7-compatible JSON SBOM with Trivy;
8. fail on any detected MEDIUM, HIGH, or CRITICAL vulnerability in the final image unless a time-bounded reviewed exception is committed;
9. upload only bounded non-secret scan, SBOM, image-metadata, and smoke receipts.

The pull-request workflow never pushes an image and never signs or attests an unmerged revision.

## Main publication workflow

After protected `main` contains the implementation, the same Dockerfile is rebuilt from exact `main` source and pushed under a commit-addressed tag. The trusted main-only publication job:

- has `contents: read`, `packages: write`, `id-token: write`, `attestations: write`, and `artifact-metadata: write` only;
- uses no pull-request code path and no caller-selected ref;
- rescans the pushed digest, reruns the real no-network smoke, and verifies registry identity;
- generates and attaches CycloneDX SBOM and SLSA v1.2 build-provenance attestations through the pinned `actions/attest` action;
- signs the immutable image digest keylessly with Cosign and verifies the exact workflow identity and GitHub Actions OIDC issuer;
- records source SHA, image digest, base digests, SBOM digest, attestation references, scan receipt, and smoke receipt.

The workflow does not update repository variables, branch files, or reviewer configuration. Activation is a separate, reviewable digest-lock change after publication evidence exists.

## Activation

Reviewer-flow activation must use a committed digest lock or protected repository/environment configuration that names exactly:

`ghcr.io/contextualwisdomlab/noema-patch-validator@sha256:<64 lowercase hexadecimal characters>`

Before a trusted workflow passes that digest to `DockerPatchValidationRunner`, it must verify:

- registry/repository identity;
- Cosign certificate identity and issuer;
- GitHub artifact provenance for this repository and workflow;
- SBOM attestation;
- configured vulnerability policy;
- real no-network smoke evidence;
- exact profile compatibility.

No fallback tag, latest digest, unsigned local image, predecessor digest, or status-only signal may activate the runner. Activation does not grant the image GitHub, model, OIDC, Cloudflare, package, publication, release, or deployment credentials.

## Testing and coverage

Production statement and branch coverage and public API documentation remain 100 percent. Tests cover:

- allowed text modifications, creation, and deletion;
- malformed and truncated patches;
- context mismatch, duplicate path, traversal, absolute path, and governance path;
- unsupported rename, copy, mode, binary, dependency, and validator changes;
- final-newline behavior and multiple hunks;
- source-copy symlink, special-file, count, per-file, and aggregate limits;
- child launch, timeout, nonzero exit, output overflow, and signal cleanup;
- exact request, profile, command, image-digest, and result rebinding;
- Dockerfile digest pins, numeric user, entrypoint, and no package manager/shell;
- workflow event, permission, action-pin, no-PR-publish, scan, signing, attestation, and smoke contracts;
- actual image build, scan, and real hardened smoke in GitHub Actions.

## Non-goals

- This slice does not weaken or satisfy issue #27's repository-governance controls.
- It does not provision the Reviewer or Maintainer Apps tracked by issue #29.
- It does not grant the image network access or dependency installation.
- It does not validate arbitrary ecosystems or arbitrary commands.
- It does not claim multi-architecture parity.
- It does not fabricate production, customer, revenue, acquisition, or deployment evidence.

## Standards rationale

OCI Image Specification 1.1.1 defines the portable image format, while OCI Runtime Specification 1.3.0 defines the runtime filesystem, process, namespace, mount, and resource model. SLSA 1.2 distinguishes source provenance from build provenance and requires consumers to verify expected properties rather than treating provenance existence as trust by itself. NIST SP 800-190 emphasizes trusted images, registry controls, vulnerability management, least privilege, isolation, and resource controls. NIST SP 800-218 SSDF 1.1 requires protecting software components, producing release integrity evidence, and responding to vulnerabilities. CycloneDX 1.7 is the current stable CycloneDX specification; SPDX 3.1 remains a release candidate and ISO/IEC 5962 edition 2 remains under development, so this slice uses stable CycloneDX JSON for the publication SBOM.

## Authoritative references — APA 7th

GitHub. (2026). *actions/attest*. https://github.com/actions/attest

GitHub. (2026). *Using artifact attestations to establish provenance for builds*. https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations

National Institute of Standards and Technology. (2017). *Application container security guide* (NIST SP 800-190). https://doi.org/10.6028/NIST.SP.800-190

National Institute of Standards and Technology. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218). https://doi.org/10.6028/NIST.SP.800-218

Open Container Initiative. (2025, April 2). *OCI image-spec v1.1.1 release notice*. https://opencontainers.org/release-notices/v1-1-1-image-spec/

Open Container Initiative. (2025, November 4). *OCI runtime-spec v1.3.0 release notice*. https://opencontainers.org/release-notices/v1-3-0-runtime-spec/

OWASP Foundation. (2025, October 21). *CycloneDX specification overview* (Version 1.7). https://cyclonedx.org/specification/overview/

SLSA Community. (2025). *SLSA specification* (Version 1.2). https://slsa.dev/spec/v1.2/

Sigstore. (2026). *Verifying signatures with Cosign*. https://docs.sigstore.dev/cosign/verifying/verify/
