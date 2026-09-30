# Continuation Dispatch Broker Design

Status: Proposed. This document designs the canonical-owner repair for
`ContextualWisdomLab/noema#735`; it is not release, deployment, or merge
authority.

## Problem

Required Noema and Strix workflows execute in consumer repositories. Their
consumer-scoped `github.token` cannot create a `repository_dispatch` event in
`ContextualWisdomLab/.github`. Returning a broader installation token to the
consumer is also unacceptable: GitHub requires `Contents: write` for the
repository-dispatch endpoint, so the token would carry content mutation power
beyond the single intended action.

The retained protected failure and the current recurrence are bound in
`ContextualWisdomLab/.github#2540`: the existing consumer OIDC exchange can
succeed and the following central dispatch can still fail HTTP 403. Therefore
Noema must own the target/action authorization and perform the fixed dispatch
server-side without returning a GitHub credential.

## Context and responsibility

Noema adds a separate public mutation endpoint:

`POST /v1/continuation-dispatches`

The existing `POST /exchange` contract is unchanged. The new endpoint is a
synchronous broker inside the Noema Identity/Federation bounded context:

1. authenticate the GitHub Actions OIDC bearer;
2. bind the caller to the immutable reusable-workflow source;
3. validate one closed continuation request;
4. read the live source PR with the existing read-only source App;
5. atomically reserve the exact request identity;
6. mint a separate central-only dispatch App token inside Noema;
7. emit one internally mapped `repository_dispatch` request;
8. persist the outcome and return a signed, credential-free receipt.

`.github` remains the consumer adapter and central event handler. It never
reads Noema storage or source and may consume only the released API/schema.

## Closed request contract

The body is exactly one UTF-8 JSON object. Duplicate keys, unknown keys,
additional JSON values, non-integer numbers, non-string typed lookalikes,
whitespace-bearing identifiers, and bodies over the existing public mutation
body bound fail before private-key use.

Required members:

| Member | Contract |
|---|---|
| `contract_version` | exact string `noema.continuation-dispatch.v1` |
| `dispatch_action` | `noema_review_continuation` or `strix_scan_continuation` |
| `central_repository` | exact string `ContextualWisdomLab/.github` |
| `source_repository` | canonical `owner/name`; equals verified OIDC `repository` |
| `pull_request_number` | positive safe integer |
| `expected_head_sha` | lowercase 40-hex commit SHA |
| `expected_base_sha` | lowercase 40-hex commit SHA |
| `expected_base_ref` | nonempty canonical Git ref name without whitespace |
| `transport_retry_attempt` | integer `1` or `2`, consuming the existing two-attempt contract in `.github` ADR-0031 rather than defining a new retry budget |

The caller cannot provide a URL, REST path, event type, arbitrary payload,
installation id, permission set, or GitHub token. Noema maps actions internally:

- `noema_review_continuation` -> `event_type=noema-review`;
- `strix_scan_continuation` -> `event_type=strix-scan`.

The `client_payload` contains only the validated source repository, PR number,
head/base/ref, and retry attempt.

## Identity and live-state admission

The existing OIDC verifier remains the single cryptographic verification path.
Admission additionally requires:

- exact GitHub issuer and configured audience;
- exact organization id and source repository identity;
- exact reusable-workflow path and `job_workflow_sha`;
- bounded temporal claims and unused `jti`;
- OIDC `repository` equals `source_repository`;
- a fresh GitHub PR read reports open, non-draft, same-organization source and
  base repositories, exact head SHA, base SHA, and base ref.

GitHub documents `job_workflow_sha` as the reusable workflow file's commit SHA,
so it is immutable workflow-source authority rather than a mutable branch
label: <https://docs.github.com/en/actions/reference/security/oidc>.

## Credential separation and GitHub egress

The existing GitHub App remains read-only for source PR inspection. A distinct
broker App is installed only on `ContextualWisdomLab/.github` and holds the
`Contents: write` permission GitHub requires for repository dispatch. Its App
id, private key, and central installation id are separate typed Worker secret
bindings. The installation token is created only after admission, stays inside
the fixed dispatch adapter, is never returned or logged, and is not cached
outside the request.

GitHub's repository-dispatch permission contract is the reason for the broker
shape: <https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event>.

All GitHub requests use the exact configured GitHub Cloud origin, fixed paths,
`redirect: "error"`, bounded JSON responses, and existing secret-redaction
rules. No caller string participates in target origin or path selection.

## Exactly-once state

Add `NoemaContinuationDispatchState`, a SQLite-backed Durable Object selected
by SHA-256 of an RFC 8785 canonical JSON identity object. Its named members are
`contract_version`, verified `workflow_sha`, `source_repository`,
`pull_request_number`, exact head/base/ref, `dispatch_action`,
`central_repository`, and `transport_retry_attempt`. Named canonical members
avoid the delimiter ambiguity of concatenated strings.

Canonical bytes contain only that closed identity schema. RFC 8785 defines
deterministic JSON bytes suitable for hashing:
<https://www.rfc-editor.org/info/rfc8785/>.

The Durable Object transaction stores the request digest and one state:

- `reserved`: the first admitted request owns the only dispatch attempt;
- `accepted`: GitHub returned 204;
- `denied`: GitHub returned an authorization/validation denial;
- `indeterminate`: a network error, 5xx, deadline, or unreadable upstream
  response makes external side-effect completion unknowable.

An exact replay returns the stored signed receipt without another GitHub call.
The same logical key with a different digest fails closed. `indeterminate` is
never silently redispatched; operator reconciliation is required.

## Signed receipt

Noema returns `{ ok: true, data, trace_id }`; `data` contains no credential.
Receipt fields are:

- contract/receipt version, receipt id, key id, and `Ed25519` algorithm;
- canonical request digest and idempotency identity;
- verified source repository, PR, head/base/ref;
- verified reusable-workflow ref and SHA;
- fixed central repository and mapped event type;
- exact emitted payload digest;
- outcome `accepted`, `denied`, or `indeterminate` and bounded upstream status;
- issued-at and expiry copied from the admitted OIDC lifetime bound;
- trace id and detached base64url signature.

The signing private key and key id are dedicated Worker bindings and are not
the GitHub App key. The public key is documented for offline verification.
Cloudflare Workers Web Crypto supports Ed25519, including the standards-based
Secure Curves form: <https://developers.cloudflare.com/workers/runtime-apis/web-crypto/>.
The receipt is evidence only and authorizes no later dispatch, merge, release,
or deployment.

## Error taxonomy

The response envelope adds these stable codes:

- `ERR_DISPATCH_REQUEST_INVALID` (400);
- `ERR_DISPATCH_IDENTITY_DENIED` (401/403);
- `ERR_DISPATCH_LIVE_STATE_STALE` (409);
- `ERR_DISPATCH_REPLAY_CONFLICT` (409);
- `ERR_GITHUB_DISPATCH_AUTHORIZATION` (502);
- `ERR_GITHUB_DISPATCH_UPSTREAM` (503).

Provider capacity and user cancellation are never used for broker failures.
Logs contain only bounded identifiers, digests, status classes, and trace ids.

## Rejected alternatives

- Extend `/exchange`: rejected because it returns reusable credential
  authority and would silently change an existing stable contract.
- Return a target installation token: rejected because GitHub requires
  `Contents: write`, which exceeds a continuation-only consumer capability.
- PAT, inherited central secret, or consumer workflow secret: rejected because
  it bypasses OIDC source identity and central owner policy.
- Fire-and-forget retry: rejected because an unknown upstream result can
  duplicate an external side effect.
- Consumer copy of broker logic or direct Noema storage access: rejected by
  owner/consumer and DDD boundaries.

## Verification and release order

1. RED unit/contract tests cover closed JSON, claims, live PR movement,
   target/action closure, exact replay/conflict, GitHub denial/unknown outcome,
   signature verification, and secret absence.
2. Implement the broker with focused tests and 100% owned-production coverage.
3. Update OpenAPI, API stability, PRD/TRD/ADR, threat model, runbook,
   CHANGELOG, and product gap baseline.
4. Run typecheck, focused tests, complete coverage suite, security scan, SBOM,
   and provenance on one exact owner head. The two pre-existing local baseline
   failures (Unix-socket EPERM and strict-allow-scripts harness behavior) remain
   explicit until hosted Linux evidence resolves them.
5. Merge ordinarily after exact-head required Checks and review, publish an
   immutable semantic version, then update `.github#2540` to the released
   contract and prove a real consumer continuation plus fresh model verdict.
