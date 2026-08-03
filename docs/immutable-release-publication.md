# Immutable Buyer Release Publication

## Purpose

The `release-evidence` workflow publishes each approved semantic-version source release as an **immutable GitHub Release** after producing and verifying the exact-tag source archive, CycloneDX SBOM, checksums, and GitHub/Sigstore attestations.

A durable immutable release closes the gap between a short-lived Actions artifact and a buyer-facing distribution record. After publication, GitHub prevents the associated tag from being moved or deleted and prevents release assets from being replaced or deleted. Immutability applies only after the complete draft asset set has been published.

This source release **does not prove deployment** to Cloudflare, production configuration, service availability, customer use, revenue, or 30-day KPI performance. Deployment and operating evidence remain separate acquisition gates.

## Trust separation

The workflow has two jobs with different authorities.

### `attest_release`

- checks out the exact existing `vMAJOR.MINOR.PATCH` tag;
- verifies that the tag, commit, and `package.json` version agree;
- runs `npm run release:verify`;
- produces the source archive, CycloneDX 1.5 SBOM, `release-evidence.json`, and `SHA256SUMS`;
- generates and independently verifies provenance and SBOM attestations;
- seals the exact bounded publication handoff with SHA-256;
- has no release-publication permission.

### `publish_release`

- receives only the sealed bounded handoff through a GitHub Actions artifact;
- does not check out repository code;
- has `contents: write`, `actions: read`, and `attestations: read` only;
- has no GitHub App, LLM, Cloudflare, deployment, or organization-administration credential;
- fails closed unless GitHub's repository immutable-release API reports `enabled=true`;
- refuses to overwrite an existing release or continue when release absence cannot be proved as HTTP 404;
- confirms the remote tag resolves to the exact attested commit;
- publishes the complete asset set in one `gh release create ... --verify-tag` transaction;
- verifies the immutable release and every asset before emitting a publication receipt.

## Published asset set

Every release contains exactly these assets:

| Asset | Purpose |
|---|---|
| `noema-<commit-sha>.tar.gz` | Git source archive for the exact release commit. |
| `noema.cdx.json` | Lockfile-derived CycloneDX 1.5 application SBOM. |
| `release-evidence.json` | Repository, tag, commit, version, size, and digest binding. |
| `SHA256SUMS` | Offline integrity checks for the source archive, SBOM, and evidence manifest. |
| `provenance.sigstore.json` | GitHub/Sigstore source provenance bundle. |
| `cyclonedx-sbom.sigstore.json` | GitHub/Sigstore CycloneDX SBOM attestation bundle. |

The workflow never uses `--clobber`. Any existing release with the same tag blocks publication.

## Immutable-release prerequisite

An administrator must enable immutable releases for `ContextualWisdomLab/noema` at the repository or organization level. The publication job can read and verify the policy, but it intentionally cannot change repository or organization administration settings.

Verify the policy with an appropriately authorized administrative session:

```bash
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  repos/ContextualWisdomLab/noema/immutable-releases
```

Expected response:

```json
{
  "enabled": true,
  "enforced_by_owner": true
}
```

`enforced_by_owner` may be `false` when the repository-level setting is active. `enabled` must always be `true` before publication.

## Publication flow

For a release-ready commit whose `package.json` version is `0.1.0`:

```bash
git tag -s v0.1.0 <release-commit-sha>
git push origin v0.1.0
```

The tag push starts `.github/workflows/release-evidence.yml`. A manual rerun must be bound to the same existing tag:

```bash
gh workflow run release-evidence.yml \
  --repo ContextualWisdomLab/noema \
  --ref v0.1.0 \
  -f tag=v0.1.0
```

A rerun after successful publication is expected to fail because an immutable release already exists. This is the required idempotency behavior: the workflow never mutates or silently replaces buyer assets.

## Buyer verification

### Release-level verification

```bash
gh release view v0.1.0 \
  --repo ContextualWisdomLab/noema \
  --json isImmutable,tagName,targetCommitish,assets,url

gh release verify v0.1.0 \
  --repo ContextualWisdomLab/noema \
  --format json
```

The view must report:

- `isImmutable: true`;
- `tagName: v0.1.0`;
- `targetCommitish` equal to the release commit SHA;
- exactly the six assets listed above.

### Asset-level verification

Download an asset and verify that it originated from the immutable GitHub Release:

```bash
gh release download v0.1.0 \
  --repo ContextualWisdomLab/noema \
  --dir noema-v0.1.0

gh release verify-asset v0.1.0 \
  noema-v0.1.0/noema.cdx.json \
  --repo ContextualWisdomLab/noema \
  --format json
```

Repeat `gh release verify-asset` for every downloaded asset. The publication workflow performs the same check against all six local upload subjects before recording success.

### Offline integrity

```bash
cd noema-v0.1.0
sha256sum --check SHA256SUMS
```

This verifies the source archive, SBOM, and evidence manifest against the release checksum file. The GitHub release and Sigstore verification steps authenticate origin and release association; checksum verification alone does not.

## Publication receipt

After all checks succeed, the workflow writes `release-publication-receipt.json` and retains the publication evidence artifact for 365 days. The receipt records:

- repository, semantic-version tag, exact commit SHA, and package version;
- immutable-release policy response;
- canonical release URL and immutable state;
- release and per-asset verification completion;
- workflow run URL and verification timestamp;
- each asset's local SHA-256, byte size, and GitHub API digest.

Copy the reviewed receipt into:

```text
artifacts/acquisition/release-publication-receipt.json
```

When a release is selected for buyer diligence, set:

```bash
NOEMA_RELEASE_UNDER_DILIGENCE_TAG=v0.1.0 \
NOEMA_RELEASE_PUBLICATION_RECEIPT_PATH=artifacts/acquisition/release-publication-receipt.json \
npm run acquisition:audit
```

The acquisition audit fails closed when the selected release receipt is missing, mutable, identity-mismatched, incompletely verified, or contains a missing/extra/digest-mismatched asset.

## Failure policy

Publication stops without a release receipt when any of these conditions occurs:

- immutable releases are not enabled or the policy API cannot be read;
- the tag does not resolve to the exact attested commit;
- a release with the tag already exists;
- release absence cannot be proven as HTTP 404;
- the downloaded handoff checksum or exact file set differs;
- `gh release create` fails;
- the published release is not immutable;
- release tag or target commit differs from the attested identity;
- `gh release verify` fails after bounded retries;
- `gh release verify-asset` fails for any asset;
- GitHub's asset digest or byte size differs from the local upload subject;
- the publication receipt cannot be validated.

No release publication result should be treated as buyer evidence unless the receipt validator reports `release-publication-receipt: PASS`.
