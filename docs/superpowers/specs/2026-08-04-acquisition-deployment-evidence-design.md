# Acquisition Deployment Evidence Design

## Problem

Noema now produces an immutable release receipt, a production deployment receipt, a Sigstore bundle, and a live production-environment governance audit. The acquisition data-room manifest and `npm run acquisition:audit` currently validate only the release-publication receipt. A buyer can therefore receive a nominally complete acquisition package without the evidence that the selected release was independently approved, deployed to production, served 100% of traffic, passed strict KPI and smoke validation, and retained an independently verifiable attestation.

## Design

Add a pure deployment-evidence evaluator used by the acquisition audit. When `NOEMA_RELEASE_UNDER_DILIGENCE_TAG` selects a release, the evaluator requires four artifacts:

- `deployment-evidence.json`;
- `deployment-evidence.sigstore.json`;
- `deployment-attestation-verification.json`;
- `production-environment-governance.json`.

The deployment receipt must bind the selected semantic-version tag to `ContextualWisdomLab/noema`, a full commit SHA, `refs/tags/<tag>`, the `noema` Worker, the `production` environment, exactly 100% active traffic, immutable release validation, strict 30-day KPI validation, successful smoke validation, and a GitHub Actions workflow-run URL.

The environment-governance report must be schema version 1, identify the same repository and `production` environment, record `PASS`, contain at least one concrete reviewer, contain no failures, and report every policy check as passing.

The attestation verification receipt is generated only after `gh attestation verify` succeeds in the trusted `cd.yml` workflow. It binds the repository, selected tag, commit SHA, deployment receipt SHA-256, signer workflow, predicate type, GitHub Actions OIDC issuer, and the deny-self-hosted-runners policy. The Sigstore bundle must be a non-empty JSON object or JSON-lines sequence and is retained for independent online or offline verification. The acquisition audit validates the receipt and cross-artifact identities; buyers must still cryptographically re-run `gh attestation verify` because structural bundle inspection alone is not signature verification.

## Data-room integration

The acquisition manifest indexes the deployment workflow, deployment-evidence implementation and tests, production governance implementation, and the four final evidence artifacts. Missing production artifacts remain final-gate gaps. Scheduled report-only audits record them as `NOT_READY`; explicit acquisition audits fail closed when a release-under-diligence tag is selected.

## Failure handling

Missing, malformed, stale, mismatched, permissive, or self-asserted evidence fails closed. The audit never invents a deployment, customer, KPI, revenue, or transfer claim. When no release-under-diligence tag is selected, the audit records that deployment evidence is not yet selected, while the data-room final gate remains incomplete until real artifacts exist.

## Verification

Vitest covers a complete cross-bound evidence set and failures for wrong tag, wrong commit, non-production deployment, traffic below 100%, failed KPI/smoke/immutability, failed governance, empty reviewers, failed governance checks, malformed Sigstore bundle, and verification-receipt identity or digest mismatch. Static workflow tests require the verification receipt to be written only after `gh attestation verify` and retained for 365 days.
