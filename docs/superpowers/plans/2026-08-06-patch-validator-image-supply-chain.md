# Patch-Validator Image Supply-Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement and verify this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, scan, sign, attest, smoke-test, and prepare activation of a repository-owned, credential-free patch-validator image whose exact digest is bound to validation evidence.

**Architecture:** Extend the PR #65 host contract with a fixed `node_patch_verify` profile and image-digest result binding. A shell-free Node entrypoint performs a second strict unified-diff parse, copies the authenticated source into tmpfs, applies only ordinary text creation/modification/deletion, executes lock-pinned TypeScript and Vitest modules with bounded subprocesses, and writes one bounded JSON result. A digest-pinned multi-stage Docker build produces a non-root Distroless image. A read-only PR workflow builds, scans, and smoke-tests; a main-only workflow publishes, signs, and creates CycloneDX/SLSA attestations. Activation remains a separate reviewed digest-lock step.

**Tech Stack:** Python 3.11, Pydantic 2, Node.js 24, ECMAScript modules, TypeScript, Vitest, Docker/BuildKit, Distroless Node 24, Trivy 0.73, Cosign 4.1.2, GitHub Actions artifact attestations, CycloneDX 1.7, SLSA 1.2.

## Global constraints

- Keep this branch stacked on PR #65 until the host patch-validation contract lands.
- Never add a pull-request workflow with package, OIDC, attestation, reviewer, model, publication, release, or deployment credentials.
- Never pass GitHub, NVIDIA NIM, Cloudflare, OIDC, package, publication, deployment, or Docker-socket credentials into untrusted execution.
- Pin every base image and GitHub Action by immutable digest or full commit SHA.
- Do not use `COPILOT_GITHUB_TOKEN`, temporary repair workflows, self-modifying Actions, branch patchers, skips, ignores, or test-name bypasses.
- Maintain 100% production statement and branch coverage and 100% public Python docstrings.
- Treat tags, predecessor digests, queued checks, commit statuses, and unsigned local images as non-evidence.
- Keep issue #27 governance, issue #29 App provisioning, and issue #40 production environment as explicit external gates.

---

### Task 1: Exact profile and image-digest evidence contract

**Files:**
- Modify: `reviewer/noema_reviewer/patch_validation.py`
- Modify: `reviewer/noema_reviewer/__init__.py`
- Modify/Create: focused reviewer tests

- [ ] Add `PatchValidationProfile.NODE_PATCH_VERIFY`.
- [ ] Replace caller-visible shell text with a fixed command-profile identifier owned by the image.
- [ ] Add exact immutable `validator_image_digest` to `PatchValidationResult`.
- [ ] Bind the result digest to the exact `NOEMA_PATCH_SANDBOX_IMAGE` reference.
- [ ] Add profile-specific forbidden control paths: package/lock/config, reviewer, patch-validator, workflow/action, and governance files.
- [ ] Reject unsupported rename/copy/mode-only patch metadata for the first image profile.
- [ ] Add RED tests first for wrong/missing image digest, control-path mutation, unsupported metadata, and ordinary source/test changes.
- [ ] Restore all-pass and 100% reviewer statement/branch/docstring coverage.

### Task 2: Shell-free validator runtime

**Files:**
- Create: `patch-validator/validate-patch.mjs`
- Create: `test/patch-validator-runtime.test.ts`
- Modify: `vitest.config.ts`

- [ ] Export pure helpers for environment parsing, path validation, patch parsing, source copying, hunk application, subprocess execution, bounded capture, result creation, and atomic result writes.
- [ ] Revalidate UTF-8, canonical paths, complete primary headers, exact hunk counts, context equality, `/dev/null`, final-newline markers, changed-file count, and byte ceilings.
- [ ] Support ordinary canonical text file creation, modification, and deletion only.
- [ ] Reject binary, rename, copy, mode, symlink, gitlink, dependency, validator, config, and governance mutations.
- [ ] Copy only regular non-symlink source files into private workspace with member, per-file, and aggregate quotas.
- [ ] Remove the empty `.git` placeholder from the copied workspace before tool execution.
- [ ] Run TypeScript and Vitest through `process.execPath`, fixed absolute module paths, `shell: false`, minimal environment, bounded output, and deadlines.
- [ ] Write only exact-request-bound, exact-image-bound JSON to the pre-created result path.
- [ ] Add realistic tests for modifications, creation, deletion, multiple hunks, no-final-newline, malformed/truncated/context-mismatch patches, hostile paths, unsupported metadata, file-system objects, quotas, child failures, timeout, output overflow, and atomic result behavior.
- [ ] Include runtime production code in the root 100% coverage gate.

### Task 3: Digest-pinned image

**Files:**
- Create: `Dockerfile.patch-validator`
- Create: `.dockerignore.patch-validator`
- Create: `test/patch-validator-image-contract.test.ts`

- [ ] Pin Node 24.16.0 Bookworm Slim builder by digest.
- [ ] Pin the signed Distroless Node 24 Debian 13 runtime by digest.
- [ ] Install the lockfile with scripts, audit, and funding calls disabled.
- [ ] Verify required TypeScript, Vitest, and coverage module files during build.
- [ ] Copy only lock-pinned Node modules and the image-owned entrypoint to the runtime.
- [ ] Set numeric non-root user, absolute workdir, and exec-form entrypoint.
- [ ] Add OCI labels for source repository, revision build argument, license, title, description, and documentation.
- [ ] Ensure final image contains no shell, npm, npx, Git client, package manager, source checkout, credential, or Docker socket.
- [ ] Add static contract tests for digest pins, user, entrypoint, copied paths, no mutable tags, no package install in the final stage, and no secret-bearing ARG/ENV.

### Task 4: Real PR image verification

**Files:**
- Create: `.github/workflows/patch-validator-image.yml`
- Create: `scripts/verify-patch-validator-image.mjs`
- Create: `test/patch-validator-workflow.test.ts`
- Modify: `package.json`

- [ ] Trigger on pull requests touching the runtime, Dockerfile, lockfile, host contract, tests, or workflow; also trigger on pushes to `main` for publication.
- [ ] Split read-only PR verification from main-only publication into separate jobs with explicit conditions and least permissions.
- [ ] Checkout without persisted credentials.
- [ ] Install Cosign and Trivy through full-SHA-pinned official actions.
- [ ] Verify the Distroless base signature before building.
- [ ] Build Linux/amd64 image with exact source-revision label and no secrets.
- [ ] Inspect numeric user, entrypoint, architecture, labels, and absence of shell/package managers.
- [ ] Run a real hardened smoke with no network, read-only root, all capabilities dropped, no-new-privileges, seccomp, isolated IPC, bounded resources, read-only source/patch mounts, and one writable result file.
- [ ] Validate the smoke result against exact request/profile/image identity.
- [ ] Generate CycloneDX JSON with Trivy and validate schema/version/subject identity and bounded size.
- [ ] Fail on detected MEDIUM, HIGH, or CRITICAL final-image vulnerabilities without a committed exception.
- [ ] Upload bounded SBOM, scan, metadata, and smoke receipts with pinned artifact actions.
- [ ] Add workflow and verifier tests for events, permissions, pins, PR no-publish contract, scan policy, smoke flags, and receipts.

### Task 5: Main-only publication, signature, and attestations

**Files:**
- Modify: `.github/workflows/patch-validator-image.yml`
- Modify: `test/patch-validator-workflow.test.ts`

- [ ] Grant `packages: write`, `id-token: write`, `attestations: write`, and `artifact-metadata: write` only to the main-only publication job.
- [ ] Authenticate to GHCR using only the main job's scoped `GITHUB_TOKEN`.
- [ ] Push a commit-addressed tag and resolve the immutable registry digest.
- [ ] Re-scan and re-smoke the pushed digest.
- [ ] Sign the exact digest keylessly with Cosign and verify exact workflow identity and GitHub Actions issuer.
- [ ] Use full-SHA-pinned `actions/attest` to create SLSA build provenance and CycloneDX SBOM attestations, pushing registry attestations for the exact digest.
- [ ] Generate a bounded publication receipt containing source SHA, image/base/SBOM digests, signature identity, attestation references, scan result, and smoke result.
- [ ] Do not mutate repository files, variables, environments, branch protection, reviewer configuration, or deployment state.

### Task 6: Documentation, doctoring, and change traceability

**Files:**
- Create: `docs/patch-validator-image.md`
- Create: `docs/doctoring/patch-validator-image.md`
- Modify: `docs/quarantined-patch-validation.md`
- Modify: `docs/doctoring/quarantined-patch-validation.md`
- Modify: `ARCHITECTURE.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] Document build, PR verification, main publication, digest lock, activation, rotation, rollback, incident response, and evidence interpretation.
- [ ] Document the intentionally restricted first patch language and dependency-change workflow.
- [ ] Add an architecture diagram showing source review, image build/verification, untrusted execution, model judgement, publication, merge, release, and deployment authorities.
- [ ] Record stable CycloneDX 1.7 selection and why SPDX 3.1/ISO edition 2 are not yet the publication baseline.
- [ ] Add APA 7th references for OCI Image 1.1.1, OCI Runtime 1.3.0, SLSA 1.2, NIST SP 800-190, NIST SP 800-218, GitHub attestations, Sigstore/Cosign, Trivy, and CycloneDX.
- [ ] Update `CHANGELOG.md` only after the implementation and exact CI evidence are truthful.
- [ ] Do not claim release, activation, SLSA level, multi-architecture parity, or production readiness that has not been verified.

### Task 7: Verification and stacked integration

- [ ] Run exact root typecheck and 100% Vitest coverage.
- [ ] Run exact reviewer tests and 100% docstring gate.
- [ ] Run `npm audit --audit-level=high` outside the untrusted runtime.
- [ ] Run Dockerfile static contract and workflow contract tests.
- [ ] Run actual image build, structure inspection, zero-medium/high/critical Trivy gate, CycloneDX generation, and hardened smoke.
- [ ] Confirm `ci`, `reviewer-ci`, `Security Scan`, and `patch-validator-image` all succeed on the same exact head.
- [ ] Request fresh CodeRabbit, OpenCode, and Noema exact-head review.
- [ ] Address every current finding test-first and resolve all threads.
- [ ] Keep the PR draft and do not enable auto-merge while base PR #65, independent approval, or issue #27 governance remains unresolved.
- [ ] After PR #65 merges, update or retarget this stacked PR without losing exact-head verification.
- [ ] After this slice merges and publishes an attested digest, create a separate digest-lock activation PR and verify the reviewer decision flow end to end.
