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
- keeps release creation on the job `GITHUB_TOKEN`, which has `contents: write`, `actions: read`, and `attestations: read` only;
- mints a separate repository-scoped Release Policy Auditor GitHub App token with only `Administration: read` and `Metadata: read` for the immutable-release settings check;
- never reuses the Release Policy Auditor token for tag lookup, release-existence checks, release creation, release verification, Actions, pull requests, deployment, LLM, Cloudflare, or organization administration;
- fails closed unless GitHub's repository immutable-release API reports `enabled=true`;
- refuses to overwrite an existing published release or retained draft by proving absence through the authenticated, paginated release inventory before staging;
- dereferences the remote tag to the exact attested commit before staging;
- creates a draft containing the complete bounded asset set, verifies the draft state plus every staged asset name, size, and GitHub SHA-256 digest, then re-checks the release tag after asset staging and immediately before publication;
- publishes only the verified draft, leaving a drifted-tag draft unpublished rather than creating an irreversible mismatched immutable release;
- verifies the immutable release and every asset after publication before emitting a publication receipt.

The existing Noema Maintainer App is intentionally not broadened for this purpose. Repository-settings inspection and release publication are separate authorities.

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

The workflow never uses `--clobber`. Any existing published release or retained draft with the same tag blocks publication.

## Immutable-release prerequisite

An administrator must enable immutable releases for `ContextualWisdomLab/noema` at the repository or organization level. The publication workflow intentionally cannot change that setting.

GitHub's immutable-release settings read requires repository `Administration: read`, which is not a `GITHUB_TOKEN` workflow permission. Before publication, provision a dedicated GitHub App installed only where this settings read is required. Its repository permissions must be exactly:

- Administration: read;
- Metadata: read;
- no Contents, Actions, Pull requests, Deployments, or Administration write authority.

Configure repository Actions variable `NOEMA_RELEASE_AUDITOR_APP_CLIENT_ID` with the App Client ID and repository Actions secret `NOEMA_RELEASE_AUDITOR_APP_PRIVATE_KEY` with the App private key. The workflow reads them through `vars.NOEMA_RELEASE_AUDITOR_APP_CLIENT_ID` and `secrets.NOEMA_RELEASE_AUDITOR_APP_PRIVATE_KEY`, respectively.

The workflow mints the installation token only for the immutable-release policy read. The ordinary job `GITHUB_TOKEN` remains the authority for exact-tag/release-inventory reads and immutable release creation. Source configuration of this boundary does **not** prove that the App is installed, that its credentials are provisioned, or that immutable releases are enabled; those remain live control-plane evidence.

Verify the policy with an appropriately authorized administrative read session:

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

GitHub documents that immutable-release protection starts only after publication. `gh release create` with attached assets otherwise performs separate draft-creation, asset-upload, and publication API calls. Noema therefore makes those phases explicit: it creates the release with `--draft`, verifies the staged six-asset set and its digests, re-dereferences `v0.1.0`, and only then runs `gh release edit v0.1.0 --draft=false`. If the tag moved while assets were being staged, publication stops and the draft remains non-authoritative.

Before draft creation, the workflow reads the authenticated, paginated release inventory and rejects any existing published release or retained draft with the same tag. This is intentionally stricter than a published-release-by-tag lookup because a failed prior run may have left a draft that must not be silently reused or replaced.

A rerun after successful publication is expected to fail because an immutable release already exists. A failed run that already created a draft is also intentionally fail-closed rather than silently replacing that draft; an authorized operator must inspect the retained evidence and resolve the draft before retrying. The workflow never mutates or silently replaces buyer assets.

### Why `--target` is not an identity control

The release tag must exist before draft creation because the workflow uses `--verify-tag`. GitHub documents `target_commitish` as unused when the tag already exists. Therefore the workflow does not rely on `--target` or the release object's reported `targetCommitish` field to prove source identity. It dereferences the tag before staging, re-checks it after asset staging and immediately before publication, then dereferences it again after publication. The final authoritative result is recorded as `resolvedTagCommitSha` in the publication receipt.

The tag remains mutable until the draft is published unless live repository or organization tag governance independently forbids update/deletion. The post-staging check sharply narrows the mutable interval and prevents publication after drift observed during asset upload; it does not manufacture a live tag-protection rule. Buyer-ready release acceptance therefore still requires fresh control-plane evidence for the approved tag-governance policy when that policy is relied on as an independent control.

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
- exactly the six assets listed above.

`targetCommitish` is retained in the receipt as informational API output only. The authoritative source binding is the dereferenced tag commit recorded as `resolvedTagCommitSha`, which must equal the attested source commit.

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

The receipt output parent must already exist as a real directory reached without symbolic-link ancestors. The receipt is created exactly once with exclusive owner-only permissions; an existing output is never replaced.

- repository, semantic-version tag, exact commit SHA, and package version;
- immutable-release policy response;
- canonical release URL and immutable state;
- informational release `targetCommitish` values plus the authoritative resolved tag commit SHA;
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

- the Release Policy Auditor App credentials are absent, invalid, not installed for `ContextualWisdomLab/noema`, or lack the required Administration read permission;
- immutable releases are not enabled or the policy API cannot be read;
- the tag does not resolve to the exact attested commit before staging, after draft asset staging, or after publication;
- an existing published release or retained draft matches the tag;
- the authenticated release inventory cannot be read, admitted within its bounded response budget, or parsed as the expected paginated JSON shape;
- the downloaded handoff checksum or exact file set differs;
- draft creation or asset upload fails;
- the staged release is not a mutable draft before publication;
- the staged draft contains a missing, extra, size-mismatched, or digest-mismatched asset;
- the tag moves while the draft assets are being staged;
- draft publication fails;
- the published release is not immutable;
- the release tag differs from the attested identity;
- `gh release verify` fails after bounded retries;
- `gh release verify-asset` fails for any asset;
- GitHub's asset digest or byte size differs from the local upload subject;
- the receipt output parent is missing, is not a real directory, or traverses a symbolic link;
- the receipt output already exists;
- the publication receipt cannot be validated.

No release publication result should be treated as buyer evidence unless the receipt validator reports `release-publication-receipt: PASS`.
