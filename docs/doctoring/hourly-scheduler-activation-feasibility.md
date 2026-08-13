# Hourly Scheduler Activation RCA and Feasibility

## Status

- Decision state: Proposed implementation under exact-head review
- Repository: `ContextualWisdomLab/noema`
- Initially observed protected base: `8273b350b633eae245f5cab8da4cb1d43799c3a2`
- First integrated protected base: `db4f444c1b1849ec615364a233469870c23407e6`
- Observation date: 2026-08-12 UTC
- Canonical operational contract: `docs/hourly-commercial-readiness-loop.md`
- External scheduler evidence owner: issue #96

This doctoring record distinguishes observed GitHub evidence, source-supported platform behavior, project decisions, and inference. It does not claim that an external ChatGPT task was modified, that the Maintainer App is provisioned, or that a pull request is merge-authorized.

## Observed failure

Scheduled workflow run `31587463951` completed with one job named `commercial-readiness-maintenance`. The job conclusion was `skipped`, its step list was empty, and no runner was assigned. At the observed default-branch source, the sole job had the condition:

```yaml
if: vars.NOEMA_MAINTENANCE_ENABLED == 'true'
```

The connector available to this review could not read the repository variable value because the variables endpoint returned `403 Resource not accessible by integration`. Therefore the evidence supports only this bounded conclusion: the job-level expression evaluated to a non-running state. It does not identify whether the variable was absent, false, inaccessible to the integration, or intentionally disabled.

## Root-cause analysis

### Immediate cause

The activation condition was attached to the only job. When the condition did not permit execution, GitHub had no step in which Noema could retain a reason code, inspect the remaining configuration prerequisites, or upload bounded activation evidence.

### Systemic cause

The design combined two different decisions:

1. whether the scheduler should produce read-only operational evidence; and
2. whether the credential-bearing Maintainer App write lane may run.

The first decision is safe and useful on every schedule. The second must remain fail closed. Binding both to one job-level condition converted an expected external gate into an opaque whole-run skip.

### Secondary confidentiality finding

The first implementation retained one boolean per activation prerequisite and a specific missing-configuration reason. GitHub documents that artifact metadata for public resources can be requested without authentication, and repository readers can retrieve workflow artifacts. Because `ContextualWisdomLab/noema` is public, individual App-private-key, App-client-ID, reviewer-login, or maintenance-variable presence is not suitable for artifact or step-summary retention even when no secret value is printed.

The source configuration names are already visible in the workflow, but whether each credential exists is additional operational information. The public evidence contract was therefore narrowed to repository/run/source identity, `write_ready`, and a configuration-opaque terminal classification/reason.

### What is not established

The observation does not prove a GitHub Actions outage, a malformed secret, an invalid App installation, a reviewer identity mismatch, or a hidden scheduler-provider error code. Those hypotheses require separate access-controlled evidence and must not be invented from the skipped result.

## Remedies considered

| Remedy | Feasibility decision | Reason |
| --- | --- | --- |
| Re-run the unchanged workflow | Rejected | It recreates the same job-level decision and adds no diagnostic boundary. |
| Set `NOEMA_MAINTENANCE_ENABLED=true` immediately | Rejected | It could open a credential-bearing lane before App, reviewer, and governance prerequisites are evidenced. |
| Remove the activation gate | Rejected | It weakens the fail-closed authorization boundary and can turn missing credentials into recurring failures. |
| Add another hourly workflow | Rejected | It creates a duplicate writer/schedule, increases queue pressure, and divides operational authority. |
| Grant the default `GITHUB_TOKEN` write access | Rejected | It expands authority and changes downstream workflow-trigger behavior instead of repairing diagnosis. |
| Publish one boolean or reason per missing credential | Rejected after security review | Public-repository artifacts can expose configuration-presence metadata. |
| Add an always-running read-only activation preflight, then gate the existing write job on its configuration-opaque output | Selected | It preserves one schedule and least privilege while proving whether the write lane was evaluated without publishing which credential or variable is absent. |

## Selected design

The workflow is split into two jobs.

### `activation_preflight`

The preflight has workflow-level `contents: read` authority only and does not checkout repository code, mint an App token, call repository write APIs, use OIDC, or expose secret values. It evaluates internally:

- exact repository identity;
- canonical 40-character workflow source SHA shape;
- explicit maintenance activation;
- presence of Maintainer App client ID, private key, and reviewer login.

It emits `write_ready` and `terminal_classification` as job outputs. The public artifact contains no individual variable/secret presence boolean and no reason that identifies the missing prerequisite. When any ordinary activation prerequisite is unavailable, the public result is the fixed pair:

```text
terminal_classification=EXTERNAL_GATE_REMAINS
reason_code=activation_prerequisite_unavailable
```

Repository/source identity violations remain separately classified because they do not disclose credential state.

### `maintain`

The existing maintenance job declares `needs: activation_preflight` and runs only when:

```yaml
if: needs.activation_preflight.outputs.write_ready == 'true'
```

The preflight output is not merge authority. The maintenance job must still mint the repository-scoped Maintainer App token, run live `main` governance audit, collect full exact-head evidence, and satisfy all existing review and merge gates.

## Classification semantics

| Classification | Meaning |
| --- | --- |
| `EXTERNAL_GATE_REMAINS` | At least one activation prerequisite is unavailable; public evidence does not identify which one. |
| `SAFETY_OR_POLICY_BLOCKER` | Repository or workflow-source identity is invalid. |
| `NO_ACTION_NEEDED` | The write lane may evaluate its existing governance controls. |

`NO_ACTION_NEEDED` deliberately does not mean that any pull request is green, approved, protected, mergeable, releasable, deployed, or acquisition ready.

## Evidence minimization

The activation artifact excludes:

- secret values and private keys;
- existence booleans for individual variables or secrets;
- reason codes naming a missing client ID, private key, or reviewer login;
- GitHub tokens or OIDC material;
- reviewer credential values;
- vulnerability details;
- hidden model reasoning;
- pull-request approval or release claims.

The public artifact retains only what is necessary to prove that the read-only preflight ran, which exact trusted workflow source it evaluated, whether the credential-bearing lane opened, and whether a non-secret safety identity check failed. Exact configuration diagnosis remains in repository administrator controls and access-controlled Maintainer App readiness evidence.

## Test-first evidence

The first regression-only head `4dffd09ddac273a8f8756c0db5f6c9289cd9b861` added `test/hourly-commercial-readiness-activation.test.ts` before the workflow implementation. A focused local contract execution against the fetched predecessor workflow failed at `missing activation_preflight`, which is the intended RED condition. Exact-head GitHub application CI for that predecessor remained queued during the initial implementation window and is not treated as completed RED evidence.

After the public-artifact access review, regression-only head `7bfecff9cc39705fae1e144496ed23298452384f` added a second failing contract: no `AUTH_OR_TOOLING_BLOCKER`, no credential-specific reason, and no per-prerequisite boolean may be serialized into the public workflow evidence. The predecessor workflow contained all prohibited strings, so the contract was RED before implementation commit `3eef1a41a70a35c8ef27a931e1f5ca1aace87b76` replaced them with a generic closed-lane reason and removed individual booleans from the JSON artifact.

The integrated head must still pass the repository-owned application CI, reviewer CI, central Security Scan, coverage gates, current review, and branch-protection requirements. Source-level RED demonstrations do not substitute for those acceptance gates.

## Standards and primary documentation rationale

GitHub job outputs are designed to be consumed through the downstream `needs` context. This supports a narrow preflight-to-write-lane decision without sharing a credential. GitHub also documents that dependent jobs normally do not run when a prerequisite fails or is skipped, which is why the preflight itself must complete successfully for classified external gates.

Workflow artifacts are the platform mechanism for retaining run-generated evidence after a job completes, but GitHub's artifact REST documentation states that public resources may be queried without authentication. This makes a public artifact an unsuitable place for individual credential-presence metadata. GitHub's secrets documentation also recommends minimum credential permissions and explicitly warns against intentional secret exposure. These source-supported platform behaviors inform the configuration-opaque evidence decision; they do not independently prove Noema's configuration is correct.

GitHub recommends granting `GITHUB_TOKEN` only the minimum permissions required and using a GitHub App installation token when different permissions are needed. The workflow therefore retains top-level `contents: read` and mints the repository-scoped Maintainer App token only after the preflight opens the write lane.

## References — APA 7th

GitHub, Inc. (n.d.). *GITHUB_TOKEN*. GitHub Docs. Retrieved August 12, 2026, from https://docs.github.com/en/actions/concepts/security/github_token

GitHub, Inc. (n.d.). *REST API endpoints for GitHub Actions artifacts*. GitHub Docs. Retrieved August 12, 2026, from https://docs.github.com/en/rest/actions/artifacts

GitHub, Inc. (n.d.). *Secrets*. GitHub Docs. Retrieved August 12, 2026, from https://docs.github.com/en/actions/concepts/security/secrets

GitHub, Inc. (n.d.). *Use GITHUB_TOKEN for authentication in workflows*. GitHub Docs. Retrieved August 12, 2026, from https://docs.github.com/en/actions/tutorials/authenticate-with-github_token

GitHub, Inc. (n.d.). *Using jobs in a workflow*. GitHub Docs. Retrieved August 12, 2026, from https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs

GitHub, Inc. (n.d.). *Workflow syntax for GitHub Actions*. GitHub Docs. Retrieved August 12, 2026, from https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
