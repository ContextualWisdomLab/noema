# Doctoring record: patch-validator image

## Record status

- **Original decision date:** 2026-08-06
- **Security amendment:** 2026-08-07
- **Scope:** pull-request build and verification of Noema's repository-owned patch-validator image
- **Related implementation:** `Dockerfile.patch-validator`, `.github/workflows/patch-validator-image.yml`, `patch-validator/`, `scripts/verify-patch-validator-image.mjs`, and `scripts/lib/patch-validator-static-runtime-evidence.mjs`
- **Related issues and PRs:** #9, #27, #29, #65, #66, #67
- **Release claim:** none
- **Production activation claim:** none

This record separates source-supported requirements, measured repository evidence, project decisions, assumptions, and residual risk. It is not evidence that a registry image has been published, signed, attested, activated, released, or deployed.

## Problem statement

PR #65 establishes a host-side boundary that authenticates an exact Git source, rejects unsafe patch syntax and objects, materializes a bounded committed snapshot, and keeps untrusted execution away from credentials. PR #67 adds an independently reviewable image implementation for one closed validation profile.

The current goal is narrower than production publication: prove that one exact pull-request head can build and execute a credential-free validator image under a least-privileged, fail-closed verification process without conflating image execution with trusted evidence, independent approval, protected merge, provenance, release, or deployment authority.

On 2026-08-07 the runtime design changed from a distribution runtime to a fully static Node.js 24.19.0 executable copied into a `scratch` final image. That change removed the previously observed Debian runtime CVEs and distribution attack surface, but it also removed package-manager metadata. Two related threats therefore had to be addressed: a package-oriented scanner could report a clean image while never classifying the self-compiled Node executable, and a Node-level classification could still hide bundled dependency versions inside the static binary. The current design uses independent binary presence evidence plus an exact-image `process.versions` inventory and per-component vulnerability evidence.

## Evidence classification

### Measured repository evidence

The pull-request workflow and tests measure or enforce:

- exact pull-request head checkout and live-head equality before and after verification;
- a clean worktree and immutable Dockerfile frontend;
- a digest-pinned Node builder;
- SHA-256 verification of the official Node.js 24.19.0 source archive;
- a fully static Node build copied into a `scratch` final image;
- rejection of dynamic interpreters, dynamic `NEEDED` dependencies, shared libraries, native addons, shells, and package managers in the final runtime;
- numeric non-root runtime identity and a fixed exec-form entrypoint;
- no-network, read-only, capability-dropped, seccomp-constrained smoke execution;
- bounded CPU, memory, swap, PID, descriptor, process, core, file-size, tmpfs, and wall-time resources;
- read-only source and patch mounts, no Docker socket, and no host-writable result mount;
- trusted-host synthesis of retained smoke evidence only after a zero container exit;
- exact source, patch, profile, command-profile, and local image-ID binding in trusted evidence;
- Trivy CycloneDX and vulnerability receipts for package and JavaScript dependency coverage;
- checksum-manifest-pinned Syft 1.50.0 inventory of the same exact local image;
- checksum-manifest-pinned Grype 0.116.1 vulnerability scanning of the same exact local image;
- fail-closed verification that Syft identifies exactly one Node 24.19.0 executable at `/nodejs/bin/node` with the expected Node.js CPE;
- exact-image `process.versions` capture with exact component-set equality against the reviewed inventory;
- `modules` and `napi` handled only as reviewed ABI/runtime metadata and never fabricated as vulnerability packages;
- every other `process.versions` key classified as a bundled dependency with a reviewed PURL or CPE;
- a separate CycloneDX/Grype embedded-runtime lane with one result per bundled dependency, no missing, duplicate, unknown, or ambiguous component result, and exact image identity binding;
- fail-closed rejection of ignored matches, unsupported severity vocabulary, and MEDIUM/HIGH/CRITICAL/UNKNOWN findings across the static-runtime and embedded-runtime lanes; and
- 100% production statement and branch coverage for included production modules plus public-docstring gates.

A successful workflow run proves only the exact workflow run, exact source head, local image content identity, selected receipts, and tested runtime boundary. It does not prove registry publication, universal vulnerability absence, independent approval, protected merge, provenance, release acceptance, or deployment safety.

### Source-supported requirements

The external sources support these general requirements:

- OCI image configuration and content-addressed image identity should follow the OCI Image Specification.
- Container execution should apply explicit isolation and least-privilege controls consistent with the OCI Runtime Specification and NIST container-security guidance.
- Secure development should protect build integrity, review changes, verify third-party components, respond to vulnerabilities, and retain evidence consistent with NIST SSDF.
- SBOM and vulnerability evidence must identify the artifact actually consumed; an empty finding set is not useful if the relevant component was never inventoried.
- Trivy's OS-package vulnerability scanner does not support third-party or self-compiled packages/binaries. Therefore Trivy alone cannot serve as positive evidence that the self-compiled Node runtime was assessed.
- Syft's binary classifier catalog includes Node executable classification and Node.js CPE evidence, which supports an explicit runtime-presence assertion.
- Node.js 24.19.0 documents `process.versions` as an object of version strings for Node.js and its dependencies. This supports using the exact built runtime as the source of reviewed embedded dependency-version declarations, while not claiming it is a complete binary-composition proof.
- Grype supports container/SBOM inputs and package identities including PURLs and CPEs; matcher selection depends on package type and can fall back to CPE/NVD matching for otherwise modeled packages. Its output remains vulnerability-database- and identity-quality-dependent.
- Build provenance, artifact signatures, independent approval, branch protection, release acceptance, and deployment authority are separate evidence/authority planes.

## 2026-08-07 security finding: self-compiled binary blind spot

### Finding

The `scratch` runtime intentionally has no Debian/Alpine package database. Trivy documents that third-party and self-compiled packages/binaries are outside the support boundary of its OS-package vulnerability scanner. Consequently, a clean Trivy image scan could be a false assurance signal for the self-compiled Node executable.

This was classified as a valid current-head security finding rather than a stale consequence of the previous Distroless runtime. A test-first RED regression required an independent static-binary inventory and vulnerability receipt before production implementation.

### Control decision

Noema keeps Trivy for its existing package/language coverage and adds an independent binary-aware lane:

1. download Syft 1.50.0 and Grype 0.116.1 only from their versioned immutable GitHub releases;
2. pin the SHA-256 of each release checksum manifest in workflow source;
3. authenticate each Linux/amd64 archive through the already authenticated manifest before extraction;
4. run Syft against `docker:<exact local image tag>` and retain native Syft JSON;
5. require Syft's source image ID to equal the trusted Docker image ID;
6. require exactly one `node` package at version 24.19.0 located at `/nodejs/bin/node` and carrying a Node.js 24.19.0 CPE;
7. run Grype independently against the same exact local Docker image with `--config /dev/null`, preventing a repository-local `.grype.yaml` from silently introducing ignore policy;
8. require Grype's source image ID to equal the trusted Docker image ID;
9. reject any non-empty `ignoredMatches` collection;
10. reject MEDIUM, HIGH, CRITICAL, and UNKNOWN findings; and
11. merge those assertions into the final cross-receipt verification record only after all checks pass.

The CLI additionally uses `--fail-on medium`, so a known blocking finding fails the workflow before a success receipt can be emitted. The trusted verifier separately blocks unknown severity so an unclassified finding cannot become positive evidence merely because it falls outside the CLI's ordered threshold.

## 2026-08-07 security finding: bundled static dependency blind spot

### Finding

A clean Node CPE lane is not sufficient for a fully static executable. Node incorporates versioned libraries and language components, and a vulnerability can apply to one of those embedded dependencies even when the top-level Node package identity has no matching advisory. Treating the binary as one package would therefore preserve a false-negative path.

Node.js exposes the runtime's own dependency version declarations through `process.versions`. The exact-image record is useful evidence because it comes from the executable under review, but it must not be treated as a statement that every compiled object or every future vulnerability database identity is complete.

### Control decision

The exact-image embedded-runtime lane now:

1. executes the exact built `/nodejs/bin/node` and bounds the serialized `process.versions` record;
2. requires `process.versions.node` to equal the reviewed Node.js version `24.19.0`;
3. requires the reviewed inventory component keys to equal every non-`node` `process.versions` key exactly;
4. treats only `modules` and `napi` as runtime metadata, with exact reviewed meanings, and forbids package identities for those counters;
5. requires every other key to be a `bundled_dependency` with an explicit reviewed PURL or CPE;
6. serializes bundled dependencies into a separate CycloneDX inventory;
7. scans that inventory with checksum-pinned Grype 0.116.1 and requires one result per bundled dependency;
8. requires every match to bind to exactly one reviewed component identity and rejects duplicate, omitted, unknown, or ambiguous mappings;
9. forbids aggregate and per-component ignored matches;
10. rejects MEDIUM, HIGH, CRITICAL, and UNKNOWN findings; and
11. applies an explicit reviewed fail-closed security floor where a known component identity is not adequately represented by the scanner, instead of using ignore, VEX, severity downgrade, or fabricated clean evidence.

The dedicated receipt is then cross-bound to the same exact local image ID as image metadata, smoke, Trivy, Syft, and the Node binary Grype lane.

### Why the lanes remain separate

This is defense in depth, not scanner voting. Trivy, Syft, Node's `process.versions`, and Grype answer different questions. Trivy remains useful for ordinary language/package evidence. Syft establishes that the intended self-compiled Node binary was actually classified. The Node-level Grype lane assesses that top-level runtime identity. `process.versions` enumerates reviewed dependency-version declarations from the exact runtime. The embedded-runtime Grype lane then evaluates those separately modeled dependencies.

A disagreement fails closed when required evidence is missing, malformed, mismatched, ignored, unsupported, stale, ambiguous, or blocking. No VEX assertion, severity downgrade, ignore file, or repeat-until-green behavior is introduced to make the image pass.

### Residual limits

- Vulnerability scanners depend on classifier quality, ecosystem modeling, advisory feeds, and database freshness; no scanner can prove absence of unknown vulnerabilities.
- CPE and PURL matching can produce false positives or false negatives, so package-presence/version evidence is retained separately from vulnerability matching.
- `process.versions` is the runtime's dependency-version declaration, not a cryptographic inventory of every translation unit or vendored byte compiled into the executable. Source integrity, exact-runtime enumeration, Node-level scanning, and per-component scanning reduce this risk but do not establish universal component completeness.
- If a future Node release introduces a new `process.versions` key without a reviewed identity, exact component-set verification fails closed until that identity is reviewed.
- Hosted runners, Docker daemon, network retrieval, GitHub release hosting, scanner vulnerability databases, and upstream source distribution remain trusted dependencies.
- Linux/amd64 is the only platform verified by this slice; multi-architecture parity is not claimed.

## Project decisions

Noema adopts the following stricter decisions for this slice:

1. **PR verification is read-only.** The workflow has `contents: read` and no package, OIDC, attestation, model, reviewer, release, or deployment credential.
2. **Mutable identity is not accepted as evidence.** Build inputs are version/digest/checksum pinned as applicable, and receipts bind to a local SHA-256 image ID.
3. **Live-head equality is checked twice.** Concurrency cancellation reduces wasted work but is not the stale-head security control.
4. **The final runtime is `scratch`, static, and numeric non-root.** A shell, package manager, Git client, network client, and distribution runtime are unnecessary for the fixed Node profile.
5. **Commands are image-owned.** Callers select an enum profile and cannot supply shell text.
6. **Control-plane files are outside the patch language.** Dependency, lockfile, configuration, reviewer, validator, Dockerfile, and GitHub workflow changes require ordinary review and image rebuild.
7. **Container output is untrusted.** Private container files, stdout, and stderr do not establish repository, source, profile, or image identity.
8. **The trusted host synthesizes retained smoke evidence.** Zero container exit is necessary but not sufficient for acceptance.
9. **Evidence planes remain separate.** Check runs, commit statuses, scanner evidence, validator evidence, model judgement, independent approval, provenance, release acceptance, and deployment evidence are not interchangeable.
10. **No publication claim is made.** Local image verification is intentionally separated from future main-only publication and digest-lock activation.

## Standards and evidence mapping

| Noema control | Source rationale | Current evidence |
|---|---|---|
| Digest/checksum-pinned build inputs | OCI identity; SSDF supply-chain integrity | Dockerfile source hash, pinned builder, pinned scanner manifests |
| Numeric non-root, read-only runtime | NIST container least privilege | Image metadata verifier and real Docker smoke |
| No network and no Docker socket | NIST isolation/credential separation | Docker flags and workflow contract tests |
| Capability drop, seccomp, no-new-privileges | Container runtime hardening | Real smoke command and static workflow tests |
| `scratch` + static-link verification | Attack-surface reduction project decision | Archive inspection and `readelf` checks |
| Trivy package/dependency lane | Component inventory/vulnerability response | CycloneDX + Trivy JSON receipts |
| Explicit self-compiled Node presence | Trivy documented limitation; Syft Node classifier | Syft native JSON + exact package/CPE verifier |
| Independent binary vulnerability lane | SSDF component-risk response | Grype JSON + exact-image/severity verifier |
| Exact embedded dependency declarations | Node.js `process.versions` contract | bounded exact-image `process.versions` + exact component-set verifier |
| Per-component embedded vulnerability evidence | Grype PURL/CPE package targeting and SSDF component-risk response | embedded CycloneDX + one Grype result per bundled dependency |
| Double live-head refusal | Noema fail-closed exact-head policy | GitHub API equality before and after verification |
| Future signature verification | Sigstore exact subject/identity model | Not implemented for repository-owned image in this slice |
| Future provenance | SLSA provenance model | Not implemented in this slice |

## OCI image and runtime decisions

The Dockerfile uses an immutable frontend and digest-pinned builder. The Node source archive is authenticated by an explicit SHA-256. The final `scratch` image records OCI source, revision, license, title, description, and documentation labels.

The local Docker image ID used in PR verification is explicitly not described as a registry digest, signature, or provenance record. A future publication stage must bind registry subject, signature, SBOM, provenance, and verification receipts to one exact registry digest.

The fixed profile does not require a shell, package manager, Git client, network, privileged capabilities, writable root filesystem, or host-writable result mount. Runtime controls include non-root identity, read-only root, no network, all capabilities dropped, no-new-privileges, built-in seccomp, isolated IPC, bounded resources, read-only inputs, private tmpfs, and no Docker socket.

These controls reduce impact but do not prove complete kernel isolation. The Docker daemon, host kernel, runner image, and hosted-runner policy remain part of the trusted computing base.

## NIST SSDF decision

NIST SP 800-218 supports protecting software, producing well-secured software, responding to vulnerabilities, and maintaining traceable development practices. Noema maps that guidance to test-first security regressions, immutable external action references, verified external scanner release bytes, exact-head refusal, component inventory, multiple vulnerability evidence lanes, bounded evidence retention, independent approval, protected merge, and documented residual risk.

The 100% production statement and branch coverage requirement is a project quality gate, not a claim that coverage proves correctness or security.

## SBOM and vulnerability decisions

CycloneDX remains the machine-readable interoperability format for Trivy inventory and the separately modeled embedded-runtime dependency inventory. Native Syft JSON is retained separately because binary classifier identity, package locations, CPEs, source image ID, and Syft descriptor are evidence the trusted verifier needs to authenticate the self-compiled runtime classification.

The workflow rejects a successful vulnerability scan as sufficient by itself. Positive runtime evidence requires **presence** (Syft identified the intended Node binary), **top-level assessment** (Grype assessed the same exact image with no forbidden ignore or blocking severity evidence), **dependency declaration** (the exact built runtime emitted the reviewed `process.versions` set), and **per-component assessment** (one result per bundled dependency, with exact identity binding and no forbidden ignored/blocking evidence). This prevents both "zero findings because zero relevant component was cataloged" and "clean Node package while a bundled dependency is unassessed" from being accepted as clean evidence.

## Signature, attestation, and provenance decisions

This PR workflow does not sign the repository-owned local image and does not claim provenance. A future main-only publication stage must push an exact registry digest, sign that digest, verify exact subject/issuer/repository/workflow identity, attach SBOM and provenance attestations to the same digest, and retain bounded verification receipts.

SLSA 1.2 is used as the provenance vocabulary for that future stage. Neither a CodeRabbit status, model comment, smoke result, scanner result, trusted validator receipt, signature, nor attestation can substitute for an eligible independent GitHub approval or enforceable branch rules.

## Stale-head threat model

### Threat

A workflow begins on head A, another writer pushes head B, and the older workflow later reports success.

### Controls

- exact event head captured as `SOURCE_SHA`;
- checkout by exact SHA without persisted credentials;
- clean-worktree verification;
- live PR-head lookup before verification;
- live PR-head lookup after verification;
- equality required both times; and
- concurrency cancellation only as an operational optimization.

API unavailability, malformed output, permission failure, or a mismatched head fails closed. Manual dispatch proves only the selected ref and must not be represented as live-PR-head evidence.

## Credential boundary

The untrusted image receives no repository write credential, GitHub App key/token, `GITHUB_TOKEN`, reviewer/model credential, `NVIDIA_NIM_API_KEY`, package credential, OIDC token, release credential, deployment credential, or Docker socket. The workflow's read-only token is used only by trusted host steps to compare the live PR head and is not passed into the container.

The scanner installation path also requires no repository write authority. It downloads versioned release assets into runner temporary storage and authenticates them against workflow-pinned checksum-manifest hashes.

## Interoperability and modularity

The image contract is repository-independent at the structured request/evidence boundary while Noema currently restricts the trusted repository and first profile. It preserves standalone Noema operation and modular integration with `ContextualWisdomLab/.github`, `naruon`, contextual-orchestrator, and other CWL services through explicit immutable evidence rather than shared mutable state.

No database object is introduced by this slice.

## Alternatives considered

### Rely on Trivy alone after moving to `scratch`

Rejected. Trivy explicitly documents that its OS-package scanner does not support third-party/self-compiled packages/binaries. An empty result would not prove the static Node runtime was inventoried.

### Treat the Node CPE as sufficient for all statically bundled dependencies

Rejected. A top-level Node package result does not independently demonstrate advisory coverage for each versioned dependency compiled into the runtime. The exact-image `process.versions` lane and one result per bundled dependency close that evidence gap more defensibly.

### Fabricate package identities for `modules` or `napi`

Rejected. These are ABI/compatibility level values, not ordinary dependency packages. They remain explicit reviewed runtime metadata and must not produce synthetic vulnerability identities.

### Add an ignore/VEX/severity exception for the runtime

Rejected. That would weaken the gate rather than improve evidence and could conceal a real acquisition-risk finding.

### Trust scanner exit status without exact-image receipt binding

Rejected. A successful tool invocation is not evidence that the intended image was scanned. Syft, Grype, and embedded-runtime receipts must bind to the trusted local image ID.

### Use mutable scanner installer scripts

Rejected for this gate. Versioned release assets are authenticated with workflow-pinned checksum-manifest hashes so the PR evidence does not depend solely on a mutable remote installer script.

### Run validation directly on a credential-bearing host

Rejected. Repository, model, publication, or deployment credentials would share a process/filesystem boundary with untrusted patch execution.

### Allow caller-provided shell commands

Rejected. Command injection and unconstrained tools would make the validation contract non-reviewable.

### Publish from the pull-request workflow

Rejected. PR-selected code and workflow changes must not receive package or OIDC publication authority.

## Residual risks and open gates

- PR #65 must merge before this stacked slice can be retargeted and revalidated.
- Issue #27 must establish enforceable `main` rules and independently reviewed break-glass controls.
- Issue #29 must provision separate Reviewer and Maintainer App identities.
- Issue #66 remains the main-only publication, signature, SBOM/provenance attestation, digest-lock activation, and end-to-end reviewer integration boundary.
- Production KPI, revenue, transfer, release, and deployment evidence remain separate acquisition-readiness gates.
- Scanner databases, hosted runners, Docker, GitHub release hosting, and upstream source infrastructure remain external dependencies.
- Static linking reduces runtime files and makes ordinary filesystem package inventory less granular; the exact-image dependency declarations and per-component scans reduce that blind spot but remain bounded by what Node reports and what vulnerability identities/databases can represent.

## Verification record requirements

Before describing an exact head as verified, retain or link:

- exact PR head and base;
- terminal successful `ci`, `reviewer-ci`, and `patch-validator-image` runs;
- exact immutable workflow source;
- local image metadata and content ID;
- Trivy CycloneDX and vulnerability receipts;
- Syft native binary inventory proving Node 24.19.0 presence;
- Grype exact-image vulnerability receipt with no ignored/blocking findings;
- bounded exact-image `process.versions` record;
- reviewed embedded-runtime inventory with exact component-set equality;
- embedded-runtime CycloneDX inventory and one result per bundled dependency in the Grype receipt;
- trusted-host exact-bound smoke receipt;
- merged cross-receipt verification result;
- zero unresolved current review threads; and
- explicit independent approval and protected-merge evidence outside the scanner/validator plane.

Queued, pending, skipped, cancelled, neutral, rate-limited, status-only, stale-head, or partially completed signals are not success.

## References

Anchore, Inc. (2026a). *Grype v0.116.1* [Software release]. GitHub. https://github.com/anchore/grype/releases/tag/v0.116.1

Anchore, Inc. (2026b). *Syft v1.50.0* [Software release]. GitHub. https://github.com/anchore/syft/releases/tag/v1.50.0

Anchore, Inc. (2026c). *Supported package ecosystems*. Grype documentation. https://oss.anchore.com/docs/guides/vulnerability/scanning/supported-ecosystems/

Anchore, Inc. (2026d). *Scan targets*. Grype documentation. https://oss.anchore.com/docs/guides/vulnerability/scanning/scan-targets/

Anchore, Inc. (2026e). *Syft: CLI tool and library for generating a software bill of materials from container images and filesystems*. GitHub. https://github.com/anchore/syft

Aqua Security. (2026a). *Container image scanning*. Trivy. https://trivy.dev/latest/docs/target/container_image/

Aqua Security. (2026b). *Vulnerability scanning*. Trivy. https://trivy.dev/latest/docs/scanner/vulnerability/

CycloneDX. (2026). *CycloneDX JSON reference: Version 1.7*. https://cyclonedx.org/docs/1.7/json/

GitHub, Inc. (2026). *Using artifact attestations to establish provenance for builds*. GitHub Docs. https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds

National Institute of Standards and Technology. (2017). *Application container security guide* (NIST Special Publication 800-190). U.S. Department of Commerce. https://doi.org/10.6028/NIST.SP.800-190

National Institute of Standards and Technology. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). U.S. Department of Commerce. https://doi.org/10.6028/NIST.SP.800-218

Node.js. (2026). *Process: `process.versions` (Node.js v24.19.0 documentation)*. https://nodejs.org/download/release/v24.19.0/docs/api/process.html#processversions

Open Container Initiative. (2024). *OCI image format specification* (Version 1.1.1). https://specs.opencontainers.org/image-spec/?v=v1.1.1

Open Container Initiative. (2025). *OCI runtime specification* (Version 1.3.0). https://specs.opencontainers.org/runtime-spec/?v=v1.3.0

Sigstore. (2026). *Verifying signatures with Cosign*. https://docs.sigstore.dev/cosign/verifying/verify/

Supply-chain Levels for Software Artifacts. (2025). *SLSA specification* (Version 1.2). https://slsa.dev/spec/v1.2/
