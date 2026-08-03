# Attested Production Deployments Design

## Problem

Noema now publishes immutable, buyer-verifiable source releases, but the existing deployment workflow can deploy an arbitrary default-branch checkout and retains only separate smoke/KPI artifacts. A buyer cannot cryptographically connect an immutable release to the exact Cloudflare Worker version serving production traffic, the deployment workflow run, or the post-deployment validation result.

## Design

Replace the mutable deployment path with a production-only, release-bound workflow. Every deployment requires a semantic-version release tag whose GitHub Release is already immutable. The workflow checks out that exact tag, downloads and validates its `release-evidence.json`, runs the strict release/KPI gate, captures Wrangler's structured deploy output, proves the new Worker version is the active 100% deployment, executes smoke checks, and generates a bounded `deployment-evidence.json` receipt.

The receipt binds:

- repository, immutable release tag/ref/version, and exact commit SHA;
- GitHub production environment and workflow run URL;
- Cloudflare Worker name, opaque Worker version ID, deployment ID, deployment timestamp, and HTTPS targets;
- previous deployment/version identity for deterministic rollback;
- hashes of release, KPI, and smoke evidence;
- a statement that this is production deployment evidence, not revenue or customer evidence.

The workflow signs the receipt with GitHub's official `actions/attest` action using a custom deployment predicate and retains the receipt, Sigstore bundle, Wrangler output, deployment snapshots, KPI evidence, and smoke evidence for 365 days.

The workflow intentionally does not expose a staging choice. `wrangler.toml` currently defines only the top-level production Worker, so presenting a staging option would falsely imply an isolated Cloudflare environment while deploying the same Worker. A future staging path requires an explicit reviewed Wrangler environment and separate secrets, URL, and evidence policy.

## Fail-closed conditions

Deployment or evidence generation fails when the release is absent or mutable, the tag and release manifest disagree, Wrangler does not emit a successful deploy record, the Worker version identifier is missing, unsafe, or does not match Cloudflare deployment status, the deployed version is not the newest active 100% version, smoke/KPI evidence is not passing, an input is a symlink/oversized/malformed, or the receipt attestation cannot be verified.

## Security boundary

The workflow uses only the existing production environment-scoped Cloudflare token and GitHub's ephemeral OIDC token. No long-lived signing key is introduced. The receipt never stores Cloudflare credentials, GitHub tokens, response headers, or unbounded command output. Deployment evidence does not substitute for the 30-day KPI window, paid-pilot, revenue, or transfer evidence required by the acquisition gate.

## Verification

Vitest covers exact release identity, immutable-release enforcement, Wrangler NDJSON parsing, opaque Worker version identifiers, active deployment/version matching, smoke/KPI failures, rollback identity, bounded file handling, and deterministic receipt generation. Static workflow tests require exact-tag checkout, production-only environment binding, structured Wrangler output, pre/post deployment snapshots, custom attestation, attestation verification, 365-day evidence retention, and removal of the prior arbitrary default-branch deploy path.
