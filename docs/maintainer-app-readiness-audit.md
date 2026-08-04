# Maintainer App pre-activation audit

## Purpose

Noema's hourly commercial-readiness loop can dispatch exact-head reviews and perform SHA-bound merges only through a dedicated Maintainer GitHub App. The write path remains intentionally disabled until operators can prove that the effective Maintainer token, authenticated Reviewer App identity, and live `main` governance satisfy the repository's fail-closed policy. In this document, **effective installation token** means the repository-scoped token actually minted and exercised during the audited workflow run.

The default-branch-only `.github/workflows/maintainer-app-readiness.yml` workflow produces that machine-readable preflight evidence without dispatching a review, merging a pull request, changing repository configuration, or enabling `NOEMA_MAINTENANCE_ENABLED`. All retained preflight files are generated beneath the GitHub-hosted runner's temporary directory rather than the repository checkout, so a committed checkout path cannot pre-position an artifact symlink. This separation follows the NIST SSDF expectation that security requirements and evidence be integrated into software delivery and the SLSA principle of trusting reviewed platforms while verifying their artifacts (SLSA Community, 2025; Souppaya et al., 2022).

## Trigger

The workflow accepts only the `maintainer-app-readiness` `repository_dispatch` event. GitHub evaluates `repository_dispatch` from the default branch, so a caller cannot select workflow code from an unreviewed branch. Checkout is pinned to `github.sha`, the event-bound default-branch commit, rather than re-resolving the moving branch name after the run starts.

```bash
gh api repos/ContextualWisdomLab/noema/dispatches \
  --method POST \
  --input - <<'JSON'
{"event_type":"maintainer-app-readiness"}
JSON
```

## Required configuration

Configure these repository values before dispatching the preflight:

- variable `NOEMA_MAINTAINER_APP_CLIENT_ID`;
- secret `NOEMA_MAINTAINER_APP_PRIVATE_KEY`;
- variable `NOEMA_GITHUB_APP_CLIENT_ID` for the existing Reviewer App;
- secret `NOEMA_GITHUB_APP_PRIVATE_KEY` for the existing Reviewer App;
- variable `NOEMA_REVIEWER_LOGIN`, including the exact `[bot]` suffix.

Leave `NOEMA_MAINTENANCE_ENABLED` unset or different from `true` until the preflight, independently reviewed App registration evidence, and an approved activation run all pass. The preflight verifies this state and fails with `maintenance_already_enabled` if the write path has been enabled prematurely.

The workflow creates two separately scoped installation tokens:

1. The **Maintainer App token** is scoped to `ContextualWisdomLab/noema` with only the effective permissions needed by the commercial loop: Actions read, Checks read, Contents write, Metadata read, Pull requests write, and Commit statuses read. It is the only token exposed to governance, API-probe, and no-write dry-run scripts as `GH_TOKEN`.
2. The **Reviewer App identity token** is scoped to the same repository with Metadata read only. Its token value is never passed to a script. Only the pinned action's authenticated `app-slug` and `installation-id` outputs are supplied to the readiness evaluator so the configured reviewer login can be bound to the actual Reviewer App credentials.

The job-level `GITHUB_TOKEN` remains Contents read and is not a write fallback. The audited commands use only Node.js built-ins and repository scripts, so the privileged job does not run `npm ci`, install repository dependencies, execute lifecycle scripts, or perform a package-manager audit.

Both token-mint steps are allowed to continue only so the workflow can generate bounded failure evidence. Their exact outcomes remain mandatory inputs to the final gate. A failed Maintainer mint produces governance and readiness failure reports plus a fixed, no-network `maintainer_token_unavailable` dry-run artifact; it can never be interpreted as a successful preflight.

## Enforced checks

`npm run operations:preflight` fails closed unless all of the following are true:

1. automated maintenance remains disabled during the pre-activation audit;
2. the Maintainer token action reports a positive installation identifier and a valid Maintainer App slug;
3. the observed Maintainer bot login exactly equals `<maintainer-app-slug>[bot]` and is a GitHub `Bot`;
4. the Reviewer token action reports a positive installation identifier and valid Reviewer App slug;
5. `NOEMA_REVIEWER_LOGIN` exactly equals `<reviewer-app-slug>[bot]`, and the public user lookup returns that same GitHub `Bot` login;
6. the Maintainer and reviewer bot identities differ;
7. the effective Maintainer token can enumerate exactly one repository, `ContextualWisdomLab/noema`;
8. repository metadata reports read and scoped write access but not administrator access;
9. Actions, checks, commit statuses, pull requests, and contents read probes all succeed;
10. the retained live governance report is bound to `ContextualWisdomLab/noema`, branch `main`, and status `PASS`;
11. the existing commercial-readiness loop completes without `--apply`;
12. the dry-run report is opened read-only with no symlink following, the opened descriptor's device, inode, and byte count exactly match the pre-open path metadata, the file contains 1 to 1,048,576 bytes, and its JSON parses as schema version 1 bound to `ContextualWisdomLab/noema` with `apply=false`;
13. both pinned App token actions themselves complete successfully;
14. the reusable evidence normalizer accepts the report without replacing it with `dry_run_report_invalid`.

A configured bot account by itself is not sufficient reviewer authentication. A mismatch between `NOEMA_REVIEWER_LOGIN` and the authenticated Reviewer App slug fails with `reviewer_app_login_mismatch`; a missing or malformed Reviewer App installation identity fails with `reviewer_installation_id_invalid` or `reviewer_app_slug_invalid`.

The Maintainer installation repository endpoint is fully paginated at 100 records per page. The collector retains only bounded identity, scope, permission, probe, governance, activation-state, App-binding, and commit-binding fields. If scope is broader than the expected repository, the report retains only the effective repository count and does not persist unexpected repository names. It does not retain API response bodies, access tokens, private keys, authorization headers, or secret-derived fingerprints. GitHub CLI subprocesses are shell-free, output-bounded, pinned to `github.com`, and terminated after 20 seconds so a stalled upstream cannot consume the entire preflight window.

The `permissions.admin` value must be explicitly present as `false`; a missing or non-boolean value remains unknown and fails closed rather than being coerced into evidence of least privilege.

The public `GET /users/{username}` response is used only to confirm the bounded login and GitHub `Bot` account type after the configured login has already been bound to the authenticated Reviewer App slug. GitHub does not document installation `suspended_at` state in that user-profile schema, so the preflight does not infer an App installation's suspension state from a missing user field. Successful token minting and the required API probes establish that the scoped tokens are operational for the audited run; the complete installation records and suspension states remain separate administrator evidence.

## Verification workflow controls

The pull-request `ci` and `reviewer-ci` workflows use distinct workflow-and-PR concurrency groups with `cancel-in-progress: true`. A newer commit therefore cancels queued or running verification for the superseded head without cancelling another pull request or the other workflow. This reduces duplicate compute while preserving the rule that only checks attached to the exact current head can satisfy merge policy (GitHub, n.d.-e).

Every external action in those workflows is pinned to a full 40-character commit SHA, including GitHub-authored actions. The repository test command executes Vitest with coverage enabled, and the production coverage set includes both `src/**/*.ts` and `scripts/normalize-commercial-readiness-evidence.mjs`; statements, branches, functions, and lines must each remain at 100 percent. Policy tests fail if coverage execution, the production include set, thresholds, concurrency isolation, immutable action pins, or runner-temporary evidence isolation regress (GitHub, n.d.-d).

## Evidence artifacts

Every run attempts to retain these artifacts for 90 days, including token-mint and policy failures after checkout:

- `main-governance-audit`;
- `maintainer-app-readiness`;
- `commercial-readiness-loop-dry-run`.

Their source files live under `${RUNNER_TEMP}/noema-maintainer-app-readiness/`, never under the checked-out repository tree. The workflow passes the same absolute runner-temporary paths to the governance collector, readiness evaluator, commercial-loop dry run, evidence normalizer, and artifact uploader. Missing files remain upload failures rather than causing a fallback to workspace-local evidence.

Before the commercial-loop artifact is uploaded, `scripts/normalize-commercial-readiness-evidence.mjs` validates its file type, byte size, JSON shape, canonical UTC timestamp, schema version, exact repository binding, no-write mode, counters, result identifiers, full head SHAs, and bounded reason/detail fields. It first rejects symlink, directory, empty, oversized, or malformed path metadata; opens the file with `O_RDONLY | O_NOFOLLOW`; and then refuses the input unless descriptor-level `fstat` device, inode, and size still equal the pre-open `lstat` values. This binds the bytes read to the inspected regular file and closes the symlink-swap and stale-path window.

The normalizer rewrites accepted evidence from an allowlisted field set so unknown nested values and duplicate-key ambiguity are not retained. Missing, empty, symlinked, swapped, short-read, oversized, malformed, wrong-repository, noncanonical-timestamp, or `apply=true` evidence is replaced atomically with a small canonical failure report carrying `dry_run_report_invalid`; the normalization step and final pre-activation gate then fail even though the diagnostic artifact remains available.

The one-mebibyte input and canonical-output caps prevent a trusted workflow regression from turning the artifact path into an unbounded memory or storage sink. The normalizer never persists parser exceptions or rejected source text. It creates the replacement in an unpredictable private temporary directory on the same filesystem, writes with exclusive creation and mode `0600`, renames atomically, and removes the temporary directory on both success and rollback. Realistic deterministic tests cover a blocked current-head pull request, every supported operational result and decision, malformed and non-object JSON, wrong repository and schema bindings, write-enabled input, unsafe counters, oversized input and canonical output, invalid reason codes, unsafe control characters, unbounded detail fields, canonical timestamp edge cases, descriptor device/inode/size swaps, short reads, checkout-path isolation, symlink attacks, atomic rollback, and command-entry behavior.

The primary JSON report is `${RUNNER_TEMP}/noema-maintainer-app-readiness/maintainer-app-readiness.json` during the run and the `maintainer-app-readiness` artifact after upload. It records the Maintainer App slug and installation identifier, Reviewer App slug and installation identifier, configured reviewer login, effective Maintainer repository count and exact expected scope when valid, coarse permissions, API probes, governance binding, and stable pass/failure codes. Missing artifact files are themselves workflow errors; a green preflight cannot omit its machine-readable evidence.

GitHub-hosted public-repository artifacts can be retained for at most 90 days, so the workflow uses the platform maximum while acquisition-grade release and deployment receipts continue to use separately attested long-lived evidence paths (GitHub, n.d.-d).

## Evidence boundary

A passing report proves the effective Maintainer installation token minted for that workflow run, the live APIs exercised with it, and that the configured reviewer bot login matches the authenticated Reviewer App slug and positive installation identifier produced from the configured Reviewer App credentials. It does **not** prove the complete underlying GitHub App registration for either App, all repositories available to either installation before token scoping, installation suspension state, private-key ownership and rotation, administrator bypass policy, or break-glass ownership. Those facts remain independently reviewed operational evidence under issue #29 and issue #27.

A failed report must never be converted into an activation approval by weakening permissions, removing probes, substituting `GITHUB_TOKEN`, trusting an arbitrary bot login, exposing the Reviewer token to scripts, enabling maintenance before approval, or bypassing governance. Correct the external configuration and rerun the default-branch workflow.

NIST SP 800-218 Version 1.1 remains the final SSDF publication used for this control. The December 2025 Version 1.2 revision is an initial public draft and is tracked for future alignment rather than treated as a superseding normative requirement (Booth et al., 2025; Souppaya et al., 2022).

## References

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure Software Development Framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (Initial Public Draft NIST SP 800-218 Rev. 1). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218r1.ipd

GitHub. (2026). *Create GitHub App token* (Version 3.2.0) [GitHub Action]. https://github.com/actions/create-github-app-token/tree/v3.2.0

GitHub. (n.d.-a). *Events that trigger workflows*. GitHub Docs. Retrieved August 4, 2026, from https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch

GitHub. (n.d.-b). *REST API endpoints for GitHub App installations*. GitHub Docs. Retrieved August 4, 2026, from https://docs.github.com/en/rest/apps/installations

GitHub. (n.d.-c). *REST API endpoints for users*. GitHub Docs. Retrieved August 4, 2026, from https://docs.github.com/en/rest/users/users#get-a-user

GitHub. (n.d.-d). *Managing GitHub Actions settings for a repository*. GitHub Docs. Retrieved August 4, 2026, from https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository

GitHub. (n.d.-e). *Concurrency*. GitHub Docs. Retrieved August 4, 2026, from https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency

SLSA Community. (2025). *SLSA specification* (Version 1.2). Open Source Security Foundation. https://slsa.dev/spec/v1.2/

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
