# ADR-0019: GitHub App installation is the owner's consent

- Status: Proposed
- Date: 2026-09-29
- Owners: Noema Credential Exchange bounded context
- Related: `src/index.ts` (`verifyOidcToken`, `validateRepositoryName`,
  `resolveInstallationId`), `test/installation-consent-owner-trust.test.ts`

## Problem

The exchange accepted a caller only when the OIDC `repository_owner` equalled
`ALLOWED_REPOSITORY_OWNER` and `repository_owner_id` equalled one hard-coded id,
and it refused any `target_repository` outside that owner. Adding one more
organization meant a code change, a deployment and another fixed value. The
owner rejected that model: Noema reviews repositories in other organizations
(for example `HYOSUNG-ITX-AI-Business-Department`) that should not need an
allowlist edit.

The fixed owner list was never the real authorization. A GitHub App installation
token can only reach repositories where the App is installed, and only an owner
administrator can install it. The installation is already the owner's consent.

## Decision

Keep the workflow identity fixed and derive owner identity from the installation.

- **Fixed trust anchor.** The OIDC `job_workflow_ref` (or `workflow_ref`) must
  still equal the configured central workflow ref exactly, with the
  `ALLOWED_WORKFLOW_SHA` pin, issuer, audience, replay and rate controls
  unchanged. An arbitrary workflow in any organization still cannot mint.
- **No owner allowlist.** `repository_owner` must be a syntactically valid GitHub
  login and `repository_owner_id` a positive numeric id. A well-formed
  `repository` claim must belong to `repository_owner`. The id of the central
  workflow repository's owner stays pinned, as do the known repository ids.
- **Target rule unchanged.** A caller may request only its own repository; only
  the central workflow repository may target another repository.
- **Installation binding.** The installation response must carry an `account`
  with a numeric id and a login. The login must equal the target owner. When the
  target owner is the caller owner, the account id must equal the OIDC
  `repository_owner_id`, which defeats organization-name reuse. The binding is
  cached with the installation id and re-checked on every cache hit. A response
  without an account fails closed with `502 ERR_GITHUB_API`.

`ALLOWED_REPOSITORY_OWNER` now only names the central workflow repository's
owner, which readiness still validates.

## Consequences

- Any organization that installs the Noema App can have its repositories
  reviewed by the central workflow without a Noema change. Tokens are still
  scoped to the caller's own repository (or, for the central repository, to the
  installed target), so there is no privilege gain across organizations.
- Cost exposure moves to the caller's runner minutes and inference credentials.
  A ceiling, if wanted, is a rate-limit setting, not an allowlist.
- Using Noema from a new organization still needs two owner actions outside this
  code: the App must be installable there (public App, or owned by that
  account), and an organization administrator must install it.
- A deployment that sets `GITHUB_APP_INSTALLATION_ID` pins exchange to that one
  installation; multi-organization use requires leaving it unset.
- The central workflow in `ContextualWisdomLab/.github` also hard-codes the
  owner in its target checks and App-token steps; loosening those is a separate
  change in that repository.

## Confirmation

`test/installation-consent-owner-trust.test.ts`: a caller outside
ContextualWisdomLab with a matching installation mints; mismatched installation
account id or login is refused; a missing account fails closed; a foreign caller
cannot target another organization; a non-central workflow ref is refused; the
central repository can target an installed organization; a cached installation
is re-checked against a changed owner id.
