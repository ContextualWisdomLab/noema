# Release Supply-Chain Evidence

## Purpose

Noema's `release-evidence` workflow produces a buyer-verifiable release package for an exact semantic-version tag and publishes the package as an **immutable GitHub Release**. The package ties the exact tagged source archive to a lockfile-derived CycloneDX SBOM, SHA-256 checksums, GitHub/Sigstore provenance, and an immutable durable release record.

This source-release evidence **does not prove deployment** to Cloudflare, production configuration, runtime health, customer use, revenue, or 30-day KPI performance. Those claims remain separate deployment, production-provenance, saleable-readiness, and acquisition-readiness gates.

Detailed immutable-publication controls and the acquisition receipt contract are documented in [Immutable Buyer Release Publication](./immutable-release-publication.md).

## Release identity

The workflow accepts only an existing `vMAJOR.MINOR.PATCH` tag whose value equals `v` plus the version in `package.json`. The checked-out commit and the tag's dereferenced commit must match. A manual run must be dispatched with `--ref` set to the same tag, preventing default-branch workflow code from claiming a different release identity.

```bash
gh workflow run release-evidence.yml \
  --repo ContextualWisdomLab/noema \
  --ref v0.1.0 \
  -f tag=v0.1.0
```

## Build and attestation boundary

The read-only `attest_release` job:

1. checks out the exact tag without persisting Git credentials;
2. runs `npm ci` and `npm run release:verify`;
3. builds `noema-<commit-sha>.tar.gz` with `git archive`;
4. generates `noema.cdx.json` with `npm sbom --package-lock-only --sbom-format=cyclonedx --sbom-type=application`;
5. validates the repository, tag, commit, version, SBOM root, bounded file types, names, sizes, and digests;
6. writes `release-evidence.json` and `SHA256SUMS`;
7. generates separate provenance and CycloneDX SBOM attestations with GitHub Actions OIDC;
8. verifies both attestations against the exact signer workflow, source/signer digest, tag ref, GitHub OIDC issuer, and GitHub-hosted-runner policy;
9. seals the complete publication handoff with SHA-256.

The write-authorized `publish_release` job receives only that sealed handoff. It does not check out the repository and has no GitHub App private key, LLM key, Cloudflare credential, deployment credential, or organization-administration permission. It fails closed unless GitHub reports immutable releases enabled, the remote tag still resolves to the exact attested commit, and no release exists for the tag.

## Published asset set

Each immutable release contains exactly:

| File | Meaning |
|---|---|
| `noema-<commit-sha>.tar.gz` | Git source archive of the exact release commit. |
| `noema.cdx.json` | CycloneDX 1.5 application SBOM from the committed lockfile. |
| `release-evidence.json` | Repository, tag, commit, version, byte-size, and digest binding. |
| `SHA256SUMS` | Offline integrity list for the source archive, SBOM, and evidence manifest. |
| `provenance.sigstore.json` | GitHub/Sigstore provenance bundle for the source archive. |
| `cyclonedx-sbom.sigstore.json` | GitHub/Sigstore CycloneDX SBOM attestation bundle. |

The workflow uses one `gh release create ... --verify-tag` publication transaction and never uses `--clobber`. A rerun after successful publication fails rather than mutating the existing release.

## Offline checksum verification

Download the release assets into one directory and run:

```bash
sha256sum --check SHA256SUMS
```

Every listed file must report `OK`. This proves byte integrity relative to the checksum file, but it does not authenticate who generated the checksum. Use attestation and release verification for origin authentication.

## Strict attestation verification

Set the release identity:

```bash
export NOEMA_RELEASE_SHA=<40-character-release-commit-sha>
export NOEMA_RELEASE_TAG=v0.1.0
export NOEMA_ARCHIVE="noema-${NOEMA_RELEASE_SHA}.tar.gz"
```

Verify source provenance:

```bash
gh attestation verify "$NOEMA_ARCHIVE" \
  --bundle provenance.sigstore.json \
  --repo ContextualWisdomLab/noema \
  --signer-workflow ContextualWisdomLab/noema/.github/workflows/release-evidence.yml \
  --signer-digest "$NOEMA_RELEASE_SHA" \
  --source-digest "$NOEMA_RELEASE_SHA" \
  --source-ref "refs/tags/${NOEMA_RELEASE_TAG}" \
  --cert-oidc-issuer https://token.actions.githubusercontent.com \
  --deny-self-hosted-runners
```

Verify the CycloneDX association:

```bash
gh attestation verify "$NOEMA_ARCHIVE" \
  --bundle cyclonedx-sbom.sigstore.json \
  --repo ContextualWisdomLab/noema \
  --signer-workflow ContextualWisdomLab/noema/.github/workflows/release-evidence.yml \
  --signer-digest "$NOEMA_RELEASE_SHA" \
  --source-digest "$NOEMA_RELEASE_SHA" \
  --source-ref "refs/tags/${NOEMA_RELEASE_TAG}" \
  --cert-oidc-issuer https://token.actions.githubusercontent.com \
  --predicate-type https://cyclonedx.org/bom \
  --deny-self-hosted-runners
```

Do not remove the signer, digest, source-ref, issuer, or runner restrictions for buyer diligence.

## Independent and air-gapped verification

Download the independently stored attestation records:

```bash
gh attestation download "$NOEMA_ARCHIVE" \
  --repo ContextualWisdomLab/noema \
  --digest-alg sha256 \
  --output attestations-from-github.jsonl
```

Before entering an air-gapped environment, export GitHub's trusted root:

```bash
gh attestation trusted-root > github-trusted-root.jsonl
```

Inside the isolated environment, run `sha256sum --check SHA256SUMS`, then repeat `gh attestation verify` with `--custom-trusted-root github-trusted-root.jsonl` and the same strict identity restrictions.

## Immutable release verification

Verify the release-level identity and immutable state:

```bash
gh release view "$NOEMA_RELEASE_TAG" \
  --repo ContextualWisdomLab/noema \
  --json isImmutable,tagName,targetCommitish,assets,url

gh release verify "$NOEMA_RELEASE_TAG" \
  --repo ContextualWisdomLab/noema \
  --format json
```

Verify each downloaded release asset, including the source archive, SBOM, checksum file, evidence manifest, and both Sigstore bundles:

```bash
gh release verify-asset "$NOEMA_RELEASE_TAG" noema.cdx.json \
  --repo ContextualWisdomLab/noema \
  --format json
```

Repeat `gh release verify-asset` for every asset. The release must report `isImmutable: true`, the tag and target commit must match the evidence manifest, and the asset set must be exact.

## SBOM inspection

```bash
jq '{
  bomFormat,
  specVersion,
  serialNumber,
  root: .metadata.component,
  component_count: (.components | length),
  dependency_count: (.dependencies | length)
}' noema.cdx.json
```

The root must be the `noema` application at the release version. The SBOM describes the source dependency resolution used by the release workflow; it is not an inventory of Cloudflare platform components or production infrastructure.

## Acquisition receipt

After release-level and per-asset verification succeeds, the workflow writes `release-publication-receipt.json`. The receipt records the immutable policy response, repository/tag/commit/version binding, canonical release URL, verification timestamp and workflow run, and every asset's local SHA-256, byte size, and GitHub API digest.

Copy the reviewed receipt to:

```text
artifacts/acquisition/release-publication-receipt.json
```

Select the release under diligence and run the audit:

```bash
NOEMA_RELEASE_UNDER_DILIGENCE_TAG=v0.1.0 \
NOEMA_RELEASE_PUBLICATION_RECEIPT_PATH=artifacts/acquisition/release-publication-receipt.json \
npm run acquisition:audit
```

The audit fails closed when the selected receipt is missing, mutable, identity-mismatched, incompletely verified, or digest-inconsistent.

## Failure policy

No bundle or release is buyer evidence unless all applicable gates pass. Publication fails when the tag, commit, version, SBOM, source, checksum, attestation, handoff, immutable-policy, release-absence, release-identity, release-level verification, asset-level verification, or receipt validation fails.

A passing release supports source-origin, dependency-transparency, byte-integrity, and immutable-distribution claims. It does not establish production deployment, operating effectiveness over time, absence of all vulnerabilities, legal ownership of every dependency, customer acceptance, revenue, or transfer completion.
