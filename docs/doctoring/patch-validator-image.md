# Doctoring record: patch-validator image

## Record status

- **Decision date:** 2026-08-06
- **Scope:** pull-request build and verification of Noema's repository-owned patch-validator image
- **Related implementation:** `Dockerfile.patch-validator`, `.github/workflows/patch-validator-image.yml`, `patch-validator/`, `reviewer/noema_reviewer/patch_image_validation.py`, and receipt-verification scripts
- **Related issues and PRs:** #9, #27, #29, #65, #66, #67
- **Release claim:** none
- **Production activation claim:** none

This record separates source-supported requirements, measured repository evidence, project decisions, assumptions, and future work. It is not evidence that a registry image has been published, signed, attested, activated, released, or deployed.

## Problem statement

PR #65 establishes a host-side boundary that authenticates an exact Git source, rejects unsafe patch syntax and objects, materializes a bounded committed snapshot, and keeps untrusted execution away from credentials. PR #67 adds an independently reviewable image implementation for one closed validation profile.

The current goal is narrower than production publication: prove that one exact pull-request head can build and execute a credential-free validator image under a least-privileged, fail-closed verification process without conflating image execution with trusted evidence, independent approval, protected merge, provenance, release, or deployment authority.

## Evidence classification

### Measured repository evidence

The pull-request workflow and tests measure or enforce:

- exact pull-request head checkout;
- live-head equality before and after verification;
- clean-worktree equality;
- an immutable Dockerfile frontend plus digest-pinned builder and runtime images;
- Distroless runtime signature verification;
- numeric non-root runtime identity and a fixed exec-form entrypoint;
- denied shell and package-manager paths in the exported final image;
- no-network, read-only, capability-dropped, seccomp-constrained smoke execution;
- bounded CPU, memory, swap, PID, descriptor, process, core, file-size, tmpfs, and wall-time resources;
- read-only source and patch mounts;
- an image-internal private `0600` result file located only in writable workspace tmpfs;
- no host-writable result mount and no Docker socket;
- trusted-host synthesis of the retained smoke receipt after a zero container exit;
- exact source, patch, profile, command-profile, and image-digest binding in trusted evidence;
- CycloneDX SBOM generation;
- final-image Trivy failure for detected unfixed MEDIUM, HIGH, or CRITICAL vulnerabilities; and
- 100 percent production statement and branch coverage plus public-docstring gates.

A successful workflow run proves only the exact workflow run, source head, local image content identity, selected receipts, and tested runtime boundary. It does not prove registry publication or future operational controls.

### Source-supported requirements

The external sources support these general requirements:

- OCI image configuration, content-addressed manifests, platform metadata, and annotations should follow the OCI Image Specification.
- Container execution should use an explicit runtime configuration and isolation controls consistent with the OCI Runtime Specification and NIST container-security guidance.
- Secure development should protect build integrity, review changes, verify third-party components, and retain evidence consistent with NIST SSDF practices.
- Build provenance should be generated and verified separately from source review and artifact execution; SLSA provides the vocabulary for that future publication stage.
- Artifact signatures and attestations require exact subject, issuer, identity, and workflow verification; a successful command or status alone is insufficient.
- SBOM and vulnerability evidence must be bound to the artifact actually consumed.

## Project decisions

Noema adopts the following stricter decisions for this slice:

1. **PR verification is read-only.** The workflow has `contents: read` and no package, OIDC, attestation, model, reviewer, release, or deployment credential.
2. **Mutable image identity is not accepted as evidence.** The Dockerfile frontend and base images are digest-pinned. The PR receipt records a local image ID, not a mutable tag.
3. **Live-head equality is checked twice.** Concurrency cancellation reduces wasted work but is not the stale-head security control.
4. **The runtime is Distroless and numeric non-root.** A shell, package manager, Git client, and network are unnecessary for the fixed Node profile.
5. **Commands are image-owned.** Callers select an enum profile and cannot supply shell text.
6. **Control-plane files are outside the patch language.** Dependency, lockfile, configuration, reviewer, validator, Dockerfile, and GitHub workflow changes require ordinary review and image rebuild.
7. **Canonical create and delete remain supported.** Matching `new file mode` and `deleted file mode` metadata for regular `100644` and `100755` files are accepted; symlink, gitlink, rename, copy, and standalone mode changes remain rejected.
8. **Container output is untrusted.** The image may write a private result inside tmpfs for its own execution contract, but that file, stdout, and stderr are not mounted or accepted as host identity evidence.
9. **The trusted host synthesizes retained smoke evidence.** A zero container exit is necessary but not sufficient by itself; the host constructs the receipt from exact workflow inputs and image identity and then cross-verifies it.
10. **Evidence planes remain separate.** Check runs, commit statuses, validator evidence, model judgement, independent approval, provenance, release acceptance, and deployment evidence are not interchangeable.
11. **No publication claim is made.** Local image verification is intentionally separated from a future main-only registry publication and digest-lock activation flow.

## Standards mapping

| Noema control | Source rationale | Current evidence |
|---|---|---|
| Digest-pinned build inputs | OCI content-addressed identity; SSDF supply-chain integrity | Dockerfile contract tests and exact source labels |
| Numeric non-root, read-only runtime | NIST container least privilege and attack-surface reduction | Image metadata verifier and real Docker smoke |
| No network and no Docker socket | NIST container isolation and credential separation | Docker flags and workflow contract tests |
| Capability drop, seccomp, no-new-privileges | Container runtime hardening | Real smoke command and static workflow tests |
| No host-writable result mount | Trust-boundary minimization | Docker command tests and host-runner tests |
| Trusted-host evidence synthesis | Separation of untrusted execution from evidence authority | Workflow and Python runner regressions |
| Exact source revision label | OCI annotations and build traceability | Metadata receipt cross-check |
| CycloneDX SBOM | Machine-readable component inventory | Trivy-generated `image-sbom.cdx.json` and verifier |
| Vulnerability failure gate | SSDF component-risk response | Trivy final-image gate |
| Double live-head refusal | Project fail-closed exact-head policy | GitHub API equality before and after verification |
| Future signature verification | Sigstore identity and subject verification | Not implemented for the repository-owned image in this slice |
| Future provenance | SLSA provenance model | Not implemented in this slice |

## OCI image decision

The Dockerfile uses an immutable frontend directive and digest-pinned base images. The final image records source, revision, license, title, description, and documentation labels.

The OCI Image Specification defines image manifests, configurations, layers, platform identity, and annotations. Noema uses those concepts for static image metadata and future registry-subject binding. The local Docker image ID used in PR verification is explicitly not described as a registry digest or provenance record.

## OCI runtime and NIST container-security decision

The fixed profile does not require a shell, package manager, Git client, network, privileged capabilities, a writable root filesystem, or a host-writable result mount. Removing those capabilities implements least privilege and reduces the attack surface.

The runtime controls include:

- non-root numeric identity;
- read-only root filesystem;
- no network;
- all capabilities dropped;
- no-new-privileges;
- built-in seccomp;
- isolated IPC;
- bounded process and resource limits;
- read-only input mounts;
- private writable workspace and temporary-filesystem mounts;
- an exclusive private result file inside workspace tmpfs; and
- no writable result path shared with the host.

These controls reduce impact but do not prove complete kernel isolation. The Docker daemon, host kernel, runner image, and hosted-runner policy remain part of the trusted computing base.

## Trusted evidence decision

Earlier iterations mounted a pre-created host result file into the container. That design allowed untrusted execution to control retained result bytes and complicated identity assurance. The current design removes that mount.

The container writes only to its private workspace tmpfs. Its result file, stdout, and stderr are treated as untrusted execution material and are not used to establish repository, SHA, profile, or image identity. On zero exit, trusted host code synthesizes a bounded receipt from the exact request and immutable image identity. A defensive host-side equality check then verifies that receipt before it is retained.

A non-zero exit fails validation. A zero exit does not approve a PR or authorize merge; it only permits trusted receipt synthesis for the exact validation attempt.

## NIST SSDF decision

NIST SP 800-218 supports protecting software, producing well-secured software, responding to vulnerabilities, and maintaining traceable development practices. Noema maps that guidance to:

- test-first security regressions;
- immutable external action and build-input references;
- dependency installation without lifecycle scripts in image construction;
- final-image vulnerability scanning;
- explicit current-head refusal;
- bounded evidence retention;
- independent approval and protected-merge requirements outside the validator; and
- documented residual risk and rollback.

The use of 100 percent production statement and branch coverage is a project quality gate, not a claim that coverage proves correctness or security.

## CycloneDX and vulnerability decisions

CycloneDX JSON is selected for the PR image SBOM because Trivy can generate it directly from the final image and the receipt verifier can validate a bounded, machine-readable component array and specification version. The verifier accepts CycloneDX versions 1.5, 1.6, and 1.7 while the publication baseline is stabilized; 1.7 is the preferred documentation baseline for new publication work.

The PR workflow uses Trivy 0.73.0 and fails when it detects an unfixed MEDIUM, HIGH, or CRITICAL vulnerability under the configured policy. This is a defined gate, not a claim that the image contains no vulnerabilities. Results depend on the vulnerability database, package detection, vendor severity data, scan time, and configured handling of unfixed findings.

A future publication stage must bind the SBOM and vulnerability evidence to the exact registry digest and verify attestation issuer and workflow identity.

## Sigstore, GitHub attestation, and SLSA decisions

The current workflow verifies the signature of the pinned upstream Distroless runtime. It does not sign the repository-owned local image.

A future main-only publication stage must:

1. push an exact registry digest;
2. sign that digest;
3. verify the exact subject, issuer, repository, workflow identity, and expected GitHub-hosted builder policy;
4. attach SBOM and provenance attestations to the same digest; and
5. retain bounded verification receipts.

SLSA 1.2 is used as the provenance vocabulary for that future stage. This slice does not claim a SLSA build level because it does not publish a registry subject or produce and independently verify repository-owned provenance.

Neither a CodeRabbit status, a model comment, a successful smoke, a trusted validator receipt, nor a signature can substitute for an eligible independent GitHub approval or enforceable branch rules.

## Stale-head threat model

### Threat

A workflow begins on head A, another run pushes head B, and the old workflow later reports success. Without a live comparison, observers may misread A's evidence as evidence for B.

### Controls

- exact event head captured as `SOURCE_SHA`;
- checkout by exact SHA without persisted credentials;
- checkout and clean-worktree verification;
- live pull-request head lookup before verification;
- live pull-request head lookup after verification;
- equality required in both places; and
- concurrency cancellation to reduce wasted work.

### Residual risk

The GitHub API and event payload are trusted sources. API unavailability, malformed output, permission failure, or mismatched head causes failure rather than fallback. Manual dispatch has no PR number and proves the selected ref only; it must not be represented as live-PR-head evidence.

## Credential boundary

The untrusted image receives only bounded, non-secret request identity and paths required for validation. It does not receive:

- repository write credentials;
- GitHub App private keys or installation tokens;
- `GITHUB_TOKEN`;
- reviewer/model credentials;
- `NVIDIA_NIM_API_KEY`;
- Cloudflare credentials;
- package credentials;
- OIDC request tokens;
- release or deployment credentials; or
- the Docker socket.

The workflow's read-only GitHub token is used by trusted host steps only to compare the live PR head. It is not passed into the container environment, arguments, files, or mounts.

## Interoperability and modularity

The image contract is repository-independent at the request-schema level while Noema currently restricts the trusted image repository and first profile. It preserves:

- standalone Noema operation;
- an explicit structured request and trusted-result boundary;
- replaceable build and registry stages;
- integration with `ContextualWisdomLab/.github`, `naruon`, contextual-orchestrator, and other CWL services through evidence rather than shared mutable state; and
- separation between validator evidence and model or reviewer authority.

No database object is introduced by this slice.

## Alternatives considered

### Run validation directly on a credential-bearing host

Rejected. Repository, model, publication, or deployment credentials would share a process and filesystem boundary with untrusted patch execution.

### Allow caller-provided shell commands

Rejected. Command injection and unconstrained tools would make the image contract non-reviewable and undermine evidence comparability.

### Retain a host-writable result mount

Rejected. It gives untrusted execution control over retained evidence bytes. Private tmpfs output plus trusted-host receipt synthesis provides a narrower authority boundary.

### Use a mutable image tag

Rejected. A tag can move after review and cannot bind evidence to one consumed artifact.

### Publish from the pull-request workflow

Rejected. Untrusted PR code and PR-selected workflow changes must not receive package or OIDC publication authority.

### Treat concurrency cancellation as sufficient stale-head protection

Rejected. Cancellation is asynchronous and operational; explicit live-head equality is the fail-closed security decision.

### Claim provenance from local build metadata

Rejected. Local labels and image IDs provide traceability evidence but are not signed registry-subject provenance.

## Residual risks and open gates

- PR #65 must merge before this stacked slice can be retargeted and revalidated.
- Issue #27 must establish enforceable `main` rules and independently reviewed break-glass controls.
- Issue #29 must provision separate Reviewer and Maintainer App identities.
- Issue #66 remains open for main-only publication, signature, SBOM and provenance attestations, digest-lock activation, and end-to-end reviewer integration.
- Production KPI, revenue, transfer, release, and deployment evidence remain separate acquisition-readiness gates.
- Linux/amd64 is the only verified platform in this slice; multi-architecture parity is not claimed.
- Hosted-runner, Docker daemon, base image, vulnerability database, and GitHub API trust remain external dependencies.

## Verification record requirements

Before describing an exact head as verified, retain or link:

- exact PR head and base;
- terminal successful `ci`, `reviewer-ci`, and `patch-validator-image` runs;
- exact workflow source;
- local image metadata and content ID;
- Distroless signature-verification output;
- final-image vulnerability receipt;
- CycloneDX SBOM;
- trusted-host exact-bound smoke receipt;
- cross-receipt verification result;
- zero unresolved current review threads; and
- an explicit statement that CodeRabbit status or model output is not independent approval.

Do not treat queued, pending, skipped, cancelled, rate-limited, status-only, or stale-head evidence as success.

## References

CycloneDX. (2026). *CycloneDX JSON reference: Version 1.7*. https://cyclonedx.org/docs/1.7/json/

GitHub, Inc. (2026). *Using artifact attestations to establish provenance for builds*. GitHub Docs. https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds

National Institute of Standards and Technology. (2017). *Application container security guide* (NIST Special Publication 800-190). U.S. Department of Commerce. https://doi.org/10.6028/NIST.SP.800-190

National Institute of Standards and Technology. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). U.S. Department of Commerce. https://doi.org/10.6028/NIST.SP.800-218

Open Container Initiative. (2024). *OCI image format specification* (Version 1.1.1). https://specs.opencontainers.org/image-spec/?v=v1.1.1

Open Container Initiative. (2025). *OCI runtime specification* (Version 1.3.0). https://specs.opencontainers.org/runtime-spec/?v=v1.3.0

Sigstore. (2026). *Verifying signatures with Cosign*. https://docs.sigstore.dev/cosign/verifying/verify/

Supply-chain Levels for Software Artifacts. (2025). *SLSA specification* (Version 1.2). https://slsa.dev/spec/v1.2/

Trivy. (2026). *Container image scanning*. Aqua Security. https://trivy.dev/latest/docs/target/container_image/
