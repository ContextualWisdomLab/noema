# Maintainer App pre-activation audit

## Purpose

Noema's hourly commercial-readiness loop can dispatch exact-head reviews and perform SHA-bound merges only through a dedicated Maintainer GitHub App. The write path remains intentionally disabled until operators can prove that the effective Maintainer token, authenticated Reviewer App identity, and live `main` governance satisfy the repository's fail-closed policy. In this document, **effective installation token** means the repository-scoped token actually minted and exercised during the audited workflow run.

The default-branch-only `.github/workflows/maintainer-app-readiness.yml` workflow produces that machine-readable preflight evidence without dispatching a review, merging a pull request, changing repository configuration, or enabling `NOEMA_MAINTENANCE_ENABLED`.

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
12. both pinned App token actions themselves complete successfully.

A configured bot account by itself is not sufficient reviewer authentication. A mismatch between `NOEMA_REVIEWER_LOGIN` and the authenticated Reviewer App slug fails with `reviewer_app_login_mismatch`; a missing or malformed Reviewer App installation identity fails with `reviewer_installation_id_invalid` or `reviewer_app_slug_invalid`.

The Maintainer installation repository endpoint is fully paginated at 100 records per page. The collector retains only bounded identity, scope, permission, probe, governance, activation-state, App-binding, and commit-binding fields. If scope is broader than the expected repository, the report retains only the effective repository count and does not persist unexpected repository names. It does not retain API response bodies, access tokens, private keys, authorization headers, or secret-derived fingerprints. GitHub CLI subprocesses are shell-free, output-bounded, pinned to `github.com`, and terminated after 20 seconds so a stalled upstream cannot consume the entire preflight window.

The `permissions.admin` value must be explicitly present as `false`; a missing or non-boolean value remains unknown and fails closed rather than being coerced into evidence of least privilege.

The public `GET /users/{username}` response is used only to confirm the bounded login and GitHub `Bot` account type after the configured login has already been bound to the authenticated Reviewer App slug. GitHub does not document installation `suspended_at` state in that user-profile schema, so the preflight does not infer an App installation's suspension state from a missing user field. Successful token minting and the required API probes establish that the scoped tokens are operational for the audited run; the complete installation records and suspension states remain separate administrator evidence.

## Evidence artifacts

Every run attempts to retain these artifacts for 90 days, including token-mint and policy failures after checkout:

- `main-governance-audit`;
- `maintainer-app-readiness`;
- `commercial-readiness-loop-dry-run`.

The primary JSON report is `artifacts/operations/maintainer-app-readiness.json`. It records the Maintainer App slug and installation identifier, Reviewer App slug and installation identifier, configured reviewer login, effective Maintainer repository count and exact expected scope when valid, coarse permissions, API probes, governance binding, and stable pass/failure codes. Missing artifact files are themselves workflow errors; a green preflight cannot omit its machine-readable evidence.

## Evidence boundary

A passing report proves the effective Maintainer installation token minted for that workflow run, the live APIs exercised with it, and that the configured reviewer bot login matches the authenticated Reviewer App slug and positive installation identifier produced from the configured Reviewer App credentials. It does **not** prove the complete underlying GitHub App registration for either App, all repositories available to either installation before token scoping, installation suspension state, private-key ownership and rotation, administrator bypass policy, or break-glass ownership. Those facts remain independently reviewed operational evidence under issue #29 and issue #27.

A failed report must never be converted into an activation approval by weakening permissions, removing probes, substituting `GITHUB_TOKEN`, trusting an arbitrary bot login, exposing the Reviewer token to scripts, enabling maintenance before approval, or bypassing governance. Correct the external configuration and rerun the default-branch workflow.

## Authoritative references

- GitHub Actions `repository_dispatch`: <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch>
- GitHub App token action: <https://github.com/actions/create-github-app-token>
- Public user lookup schema: <https://docs.github.com/en/rest/users/users#get-a-user>
- Installation repository enumeration: <https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation>
- Installation token permissions and repository scoping: <https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app>
- Installation record and suspension fields: <https://docs.github.com/en/rest/apps/apps#get-an-installation-for-the-authenticated-app>
