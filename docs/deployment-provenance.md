# Deployment provenance and rollback

Noema production deployments are release promotions, not arbitrary branch deployments. The `cd` workflow accepts only an existing `vMAJOR.MINOR.PATCH` tag whose GitHub Release is immutable and whose `release-evidence.json` binds the repository, tag ref, package version, and exact commit.

The workflow is intentionally production-only. `wrangler.toml` currently defines no isolated staging configuration, so a staging selector would deploy the same top-level Worker and create misleading evidence. Staging may be introduced only with explicit isolated Cloudflare deployment configuration, separate secrets and endpoint, and an independently reviewed evidence policy.

## Production environment governance

The GitHub `production` environment is part of the deployment trust boundary. Before any Cloudflare credential-bearing step, `npm run production:governance` retrieves the current environment configuration and fails closed unless:

- a concrete User or Team is configured as a required deployment reviewer;
- deployment initiators cannot approve their own run;
- a branch-policy protection rule exists;
- only protected branches may deploy;
- custom branch patterns do not replace protected-branch enforcement.

The privileged workflow uses `repository_dispatch`, which GitHub evaluates from the default branch, and also asserts `refs/heads/main` at runtime. This prevents branch-selected workflow code from removing the environment audit before production credentials are used. The generated `production-environment-governance.json` is retained with the deployment receipt for 365 days.

GitHub's environment response does not prove whether administrator bypass is disabled. Deselect **Allow administrators to bypass configured protection rules**, document the environment owner and break-glass process, and retain that configuration as reviewed operational evidence.

The Cloudflare API bearer is bootstrap transport only. The workflow writes the Actions secret once into a fresh owner-only capability file under `umask 077`, unsets the secret value in that step, and exports only the non-secret `NOEMA_CLOUDFLARE_API_TOKEN_PATH`. The repository-owned deployment/status/recovery clients read the bearer through the existing bounded no-follow capability reader. An `always()` cleanup removes the capability immediately after the Cloudflare mutation/status sequence. This keeps a long-lived provider credential out of ambient script environments without changing Cloudflare's ownership of deployment authority.

## Deployment procedure

1. Merge release-ready changes through the required current-head PR gates.
2. Create and push `vMAJOR.MINOR.PATCH` so `release-evidence` publishes and verifies the immutable buyer asset set.
3. Confirm the release is immutable and its six assets verify successfully.
4. Send the default-branch-only production deployment request:

   ```bash
   gh api repos/ContextualWisdomLab/noema/dispatches \
     -X POST \
     -f event_type=noema-production-deploy \
     -F 'client_payload[release_tag]=v0.1.0'
   ```

5. GitHub applies the protected `production` environment and requires an independent reviewer.
6. The workflow audits the live environment policy, checks out the exact tag, runs production evidence preflight and strict 30-day KPI validation, captures a timestamped pre-mutation Cloudflare deployment snapshot, uploads and deploys the exact Worker through the repository-owned direct Cloudflare API client, captures a timestamped post-mutation snapshot, proves the new Worker version serves 100% of traffic, and runs post-deployment smoke checks.
7. Download the `noema-deployment-evidence-production-<tag>` artifact and retain its workflow URL in the buyer data room.

`repository_dispatch`의 `GITHUB_SHA`는 default-branch workflow source를 가리키므로 배포 대상 source identity로 사용하지 않습니다. Immutable-release 검증 단계가 checkout한 tag commit을 `NOEMA_DEPLOY_SOURCE_SHA`로 명시적으로 넘기고 direct deploy client가 실제 `HEAD`와 다시 대조합니다. 또한 `release-view.json`, downloaded release evidence, pre/post deployment status, direct deployment result는 source checkout 바깥의 `$RUNNER_TEMP`에 보관합니다. 이 경계가 있어야 배포 스크립트의 clean-checkout 검증을 유지하면서도 워크플로 자체가 만든 증거 파일 때문에 정상 배포가 거부되지 않습니다.

## Deployment receipt

`deployment-evidence.json` records:

- immutable release URL, tag, ref, package version, commit SHA, and release-evidence digest;
- Cloudflare Worker name, version UUID, deployment UUID, timestamps, traffic percentage, and HTTPS targets;
- the recovery objective plus the timestamped pre-mutation deployment UUID and complete active version/percentage distribution;
- `previousWorkerVersionId` only when the previous state is one version at exactly 100%; split state leaves that compatibility field `null`;
- strict KPI and smoke evidence hashes and timestamps;
- GitHub production environment and workflow-run URL;
- an explicit boundary that the receipt does not prove revenue, paid-customer operation, transfer completion, or recovery-rehearsal completion.

The direct deploy client emits the exact source SHA, new Worker version ID and deployment ID. Receipt construction rejects a source SHA that does not equal the release commit and a deployment ID that does not equal the active post-deployment status. Pre/post status snapshots carry their own observation timestamps. The pre-mutation active deployment may contain one or two versions; receipt construction validates deployment/version UUIDs, unique version identities, provider-valid percentages of at least 0.01 totaling exactly 100 and temporal ordering, then canonicalizes retained versions by version identity so provider array ordering cannot become recovery authority. It also rejects reuse of the new deployment ID as purported pre-mutation authority. The smoke URL supplies the observed serving origin; it is not treated as a substitute for Cloudflare deployment identity.

The receipt is a subject of a GitHub/Sigstore custom attestation with predicate type:

```text
https://contextualwisdomlab.org/attestations/noema-deployment/v1
```

The workflow verifies the bundle against `.github/workflows/cd.yml`, GitHub Actions OIDC, and a GitHub-hosted runner before retaining it for 365 days. Only after that command succeeds, it writes `deployment-attestation-verification.json`, which binds the repository, release tag, commit SHA, deployment-receipt SHA-256, signer workflow, predicate type, OIDC issuer, runner policy, and workflow-run URL. This receipt is workflow evidence, not a substitute for independent signature verification.

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

Then compare the receipt's `source.commitSha` and `source.releaseTag` with the immutable GitHub Release, confirm `deployment-attestation-verification.json` records the same SHA-256 and workflow identity, confirm `production-environment-governance.json` records `PASS`, confirm the Cloudflare deployment page shows the recorded `workerVersionId` as the active 100% version, and inspect `rollback.previousDeployment` as a complete pre-mutation distribution rather than treating array position as recovery authority.

## Acquisition data-room gate

Copy the four release-specific deployment artifacts into the acquisition evidence paths:

```text
artifacts/acquisition/deployment-evidence.json
artifacts/acquisition/deployment-evidence.sigstore.json
artifacts/acquisition/deployment-attestation-verification.json
artifacts/acquisition/production-environment-governance.json
```

Select the exact release and run the combined gate:

```bash
NOEMA_RELEASE_UNDER_DILIGENCE_TAG=v0.1.0 npm run acquisition:audit
```

The deployment sub-audit cross-checks the selected tag, commit, production Worker identity, 100% current traffic, immutable release, strict KPI, smoke result, independent-review environment policy, receipt digest, signer workflow, OIDC issuer, runner restriction, and retained pre-mutation recovery authority. Missing, malformed, reordered-noncanonical, duplicate, stale-deployment or percentage-incoherent recovery evidence fails closed. Scheduled report-only scans record absent external deployment evidence as `NOT_READY` rather than fabricating it.

## Rollback and exact-state restoration

The workflow captures `deployment-status-before.json` before mutation. This file contains an observation timestamp and Cloudflare's full deployment list; it is raw provider evidence, not a license to pick the first version entry.

When post-deployment checks fail:

1. Disable further production deployment dispatches and retain the failed immutable release and all pre/post evidence.
2. Verify `deployment-evidence.json` against its retained Sigstore bundle before using it as recovery input. Prefer its admitted `rollback.previousDeployment` object. If receipt construction did not complete, treat the raw pre-mutation snapshot as incident evidence requiring equivalent validation before any new recovery receipt is constructed; do not bypass the attested recovery-input boundary.
3. Follow the explicit `rollback.objective`. For `restore_exact_pre_deployment_distribution`, use the repository-owned `npm run cloudflare:recover` command from reviewed exact source. Set `NOEMA_RECOVERY_TOOL_SOURCE_SHA` to that checked-out exact commit, `NOEMA_RECOVERY_DEPLOYMENT_EVIDENCE_PATH` to the verified receipt, and provide the Cloudflare bearer only through `NOEMA_CLOUDFLARE_API_TOKEN_PATH`. The command re-reads Cloudflare immediately before mutation and refuses recovery if the active deployment no longer matches the failed deployment recorded by the receipt; if currentness holds, it creates a new percentage deployment from every retained previous version and percentage and verifies Cloudflare's returned distribution.
4. A deliberate Cloudflare single-version rollback is a different recovery choice: it promotes one reviewed previous version to 100% traffic. Use it only when the recovery decision explicitly chooses that objective; a previous split is not thereby restored.
5. Re-read Cloudflare deployment status, verify the selected recovery state, run smoke checks and capture a separate recovery workflow record. The direct recovery command's JSON output is mutation evidence, not an attested completion receipt by itself.
6. Do not overwrite, delete or repurpose the failed immutable release. Correct the defect through a new PR and semantic-version release.

A source-level recovery receipt and executable restore command define a bounded recovery mechanism; they do not prove recovery works in production. ADR-0018 remains Proposed and the commercial/release gate stays open until a controlled production recovery rehearsal produces immutable provider/status/smoke evidence.

## Evidence boundary

Deployment provenance closes the source-release-to-runtime identity gap and prevents ambiguous rollback target selection. It does not replace the separately required 30-day production KPI provenance, controlled recovery rehearsal, paid pilot, revenue/LOI, security validation, or transfer evidence. Those gates remain fail-closed in the saleable and acquisition audits.
