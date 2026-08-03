# Attested Review Manifest Handoff Design

## Status

Approved for autonomous implementation as the next commercial-readiness security slice.

## Buyer-visible gap

Noema separates untrusted evidence collection from secret-bearing verdict publication, but the bounded manifest currently crosses the job boundary with a SHA-256 checksum stored beside the manifest in the same workflow artifact. That detects accidental corruption, yet the checksum is not an independent authenticity claim: a replaced artifact could contain a replacement checksum. A security buyer or acquisition reviewer will expect cryptographic provenance proving which trusted workflow and source revision produced the exact manifest consumed by the privileged publication job.

## Design decision

Insert a dedicated `attest_evidence` job between `collect_evidence` and `publish_review`.

The new job:

1. downloads only the bounded manifest artifact;
2. verifies the existing SHA-256 checksum;
3. validates repository, PR number, and exact head SHA using `jq` without executing target content;
4. generates a GitHub artifact attestation for `noema-manifest.json` with the official `actions/attest` action pinned to the full v4.1.0 commit SHA;
5. uploads the signed Sigstore bundle as a one-day workflow artifact.

The job receives no target checkout, GitHub App key, repository-scoped App token, LLM key, model configuration, or pull-request write permission. Its only write capabilities are the short-lived OIDC token and repository attestation permission required to create the provenance claim.

The publication job downloads both artifacts and, before parsing or publishing the manifest, verifies the attestation with `gh attestation verify`. Verification binds the manifest digest to:

- repository `ContextualWisdomLab/noema`;
- signer workflow `ContextualWisdomLab/noema/.github/workflows/central-review.yml`;
- the same workflow source and signer digest as `GITHUB_SHA`;
- source ref `refs/heads/main`;
- GitHub's Actions OIDC issuer;
- a GitHub-hosted runner, rejecting self-hosted provenance.

Only after cryptographic verification does the existing checksum, JSON schema/binding, live PR head, and publication logic run.

## Architecture

### `collect_evidence`

Remains the only job that checks out target content. It retains read-only repository authority and uploads the bounded manifest plus checksum.

### `attest_evidence`

A new trusted transformation boundary. It never checks out target code and never receives review-publication secrets. It signs the exact bounded file after deterministic metadata validation, then exports only the signed bundle.

### `publish_review`

Depends on both preceding jobs. It downloads the manifest and bundle, verifies provenance first, then performs the existing checksum, current-head, manifest-field, contextual-orchestrator, strict gate, and App-authored review publication checks.

## Permissions

`attest_evidence` uses explicit job permissions:

- `contents: read`
- `id-token: write`
- `attestations: write`

It does not receive `pull-requests: write`, `actions: write`, `checks: write`, `secrets`, `packages`, or `artifact-metadata` permissions. The attestation action uses `create-storage-record: false` because the subject is an internal bounded handoff artifact rather than a registry asset.

## Failure behavior

Any missing artifact, checksum mismatch, invalid manifest binding, attestation creation failure, missing bundle, signature failure, signer mismatch, source digest/ref mismatch, OIDC issuer mismatch, or self-hosted provenance fails the workflow before the LLM credential or review write path is exercised.

The existing checksum remains as defense in depth and as a simple operator diagnostic. It is no longer the sole integrity control.

## Verification

Static reviewer tests require:

- the attestation job to sit between collection and publication;
- least-privilege permissions and absence of reviewer/App/model secrets;
- the official action pinned to `59d89421af93a897026c735860bf21b6eb4f7b26` (verified to match tag `v4.1.0`);
- checksum and exact manifest binding before signing;
- a one-day signed-bundle artifact;
- publication dependency on both jobs;
- attestation verification before manifest parsing and live-head publication;
- exact signer workflow, signer/source digest, source ref, issuer, and GitHub-hosted-runner policies.

The full root release gate, reviewer 100% line/branch coverage, reviewer 100% docstring coverage, CodeGraph real-container smoke test, image signature/vulnerability checks, Security Scan, and CodeRabbit review remain mandatory.

## Non-goals

- This slice does not claim that attestation makes untrusted evidence semantically correct; it proves provenance and integrity of the bounded handoff.
- It does not execute repository tests or scripts.
- It does not replace the Docker quarantine or exact-head checks.
- It does not fabricate production KPI, customer, revenue, or transfer evidence.
- It does not replace the optional future microVM tier for stronger-than-container isolation.

## Authoritative references

- GitHub artifact attestations: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- GitHub CLI attestation verification: https://cli.github.com/manual/gh_attestation_verify
- GitHub Actions secure-use guidance: https://docs.github.com/en/actions/reference/security/secure-use
- Official `actions/attest` action: https://github.com/actions/attest
