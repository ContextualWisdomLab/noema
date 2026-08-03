# Deployment provenance and rollback

Noema production and staging deployments are release promotions, not arbitrary branch deployments. The `cd` workflow accepts only an existing `vMAJOR.MINOR.PATCH` tag whose GitHub Release is immutable and whose `release-evidence.json` binds the repository, tag ref, package version, and exact commit.

## Deployment procedure

1. Merge release-ready changes through the required current-head PR gates.
2. Create and push `vMAJOR.MINOR.PATCH` so `release-evidence` publishes and verifies the immutable buyer asset set.
3. Confirm the release is immutable and its six assets verify successfully.
4. Dispatch `cd` with the immutable `release_tag` and target GitHub environment.
5. The workflow checks out the exact tag, runs production evidence preflight and strict 30-day KPI validation, records the previous Cloudflare deployment, deploys, proves the new Worker version serves 100% of traffic, and runs post-deployment smoke checks.
6. Download the `noema-deployment-evidence-<environment>-<tag>` artifact and retain its workflow URL in the buyer data room.

## Deployment receipt

`deployment-evidence.json` records:

- immutable release URL, tag, ref, package version, commit SHA, and release-evidence digest;
- Cloudflare Worker name, version ID, deployment ID, timestamps, traffic percentage, and HTTPS targets;
- previous deployment/version IDs for rollback;
- strict KPI and smoke evidence hashes and timestamps;
- GitHub environment and workflow-run URL;
- an explicit boundary that the receipt does not prove revenue, paid-customer operation, or transfer completion.

The receipt is a subject of a GitHub/Sigstore custom attestation with predicate type:

```text
https://contextualwisdomlab.org/attestations/noema-deployment/v1
```

The workflow verifies the bundle against `.github/workflows/cd.yml`, GitHub Actions OIDC, and a GitHub-hosted runner before retaining it for 365 days.

## Independent verification

```bash
gh attestation verify deployment-evidence.json \
  --bundle deployment-evidence.sigstore.json \
  --repo ContextualWisdomLab/noema \
  --signer-workflow ContextualWisdomLab/noema/.github/workflows/cd.yml \
  --cert-oidc-issuer https://token.actions.githubusercontent.com \
  --predicate-type https://contextualwisdomlab.org/attestations/noema-deployment/v1 \
  --deny-self-hosted-runners
```

Then compare the receipt's `source.commitSha` and `source.releaseTag` with the immutable GitHub Release, and confirm the Cloudflare deployment page shows the recorded `workerVersionId` as the active 100% version.

## Rollback

The workflow captures `deployment-status-before.json` before mutation. When post-deployment checks fail:

1. Disable further deployment dispatches for the affected environment.
2. Read `rollback.previousWorkerVersionId` from `deployment-evidence.json`, or use the first version in `deployment-status-before.json` if receipt generation did not complete.
3. Deploy the previous version through Cloudflare's version deployment/rollback mechanism.
4. Re-run smoke checks and capture a separate rollback workflow record.
5. Do not overwrite, delete, or repurpose the failed immutable release. Correct the defect through a new PR and a new semantic-version release.

A rollback restores service state; it does not erase the failed deployment evidence.

## Evidence boundary

Deployment provenance closes the source-release-to-runtime identity gap. It does not replace the separately required 30-day production KPI provenance, paid pilot, revenue/LOI, security validation, or transfer evidence. Those gates remain fail-closed in the saleable and acquisition audits.
