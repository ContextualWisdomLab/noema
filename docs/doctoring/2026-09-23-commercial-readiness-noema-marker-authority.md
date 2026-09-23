# Commercial readiness Noema review marker authority

Date: 2026-09-23 KST
Owner: Noema commercial-readiness review admission boundary
Status: Proposed source repair; hosted exact-head verification and fresh independent review remain required.

## Problem

`parseNoemaReviewDecision()` already required the trusted reviewer bot, exact GitHub `review.commit_id`, the Noema credential marker, and a compatible GitHub review state. The reviewer-authored gate marker itself first remained case-insensitive: `noemaMarkerPattern` used the `i` flag and the parser lower-cased both `head_sha` and `decision` before admission.

That allowed non-canonical marker identities such as `decision=APPROVE`, `decision=Approve`, or an upper-case hexadecimal `head_sha` to be promoted into the canonical `approve` decision. The downstream evaluator now rejects non-canonical projected decision tokens, so leaving an upstream parser that manufactures a canonical token from malformed marker text would re-open the same authority class one layer earlier.

After the case-normalization repair, a second serialization gap remained. The marker regex still admitted arbitrary whitespace through `\s*` and `\s+`, so a trusted exact-head review could use extra spaces, tabs, or a line break inside the marker and still produce canonical Noema authority. The publisher emits one literal single-line marker shape, so accepting alternate whitespace serializations expanded the authority language beyond the owner contract.

## Constraints

- GitHub platform review identity remains authoritative: the review must still belong to the exact current `commit_id` and carry the compatible platform review state.
- The reviewer body marker is a Noema-owned protocol, not display text. Noema can therefore require one canonical serialization without redefining GitHub review semantics.
- Reviewer identity, organization governance, Reviewer/Maintainer App eligibility, central Security Scan ownership, provider routing, quarantine/security runtime, outbound authority, and release/deployment authority remain with their existing owners.
- No force-push, destructive rebase, self-approval, gate weakening, or synthetic hosted success is introduced.

## Primary authority and traceability

GitHub's REST endpoint for pull-request reviews returns review records with platform `state`, `commit_id`, and review body, and returns the review list in chronological order. Noema uses the platform fields for review-to-head and state authority; the body marker is an additional Noema-owned protocol assertion rather than a substitute for those GitHub fields.

The Noema publisher in `reviewer/noema_reviewer/github_io.py` constructs the authority marker as the literal single-line string `<!-- noema-review-gate head_sha=<head> decision=<decision> -->`, immediately after the publisher-owned reviewer credential block. Consumer admission therefore follows the publisher's exact bytes for protocol punctuation and spacing rather than accepting a whitespace-normalized language.

GitHub. (2026). *REST API endpoints for pull request reviews*. GitHub Docs. https://docs.github.com/en/rest/pulls/reviews

## Decision

The Noema marker grammar is case-sensitive and whitespace-exact. `head_sha` must match the exact expected head string and `decision` must already be one of the canonical lower-case protocol tokens `approve`, `request_changes`, or `blocked`. The only authoritative marker serialization is `<!-- noema-review-gate head_sha=<40-lower-hex-head> decision=<canonical-decision> -->` with the publisher's literal single spaces. Extra spaces, tabs, line breaks, case variants, or alternate spacing before the closing delimiter are marker-like observations but cannot become authority.

This keeps the established GitHub review chronology and platform-state rules unchanged while preventing malformed reviewer-authored protocol text from gaining merge authority through normalization.

## Executable evidence

RED `d6d5638df6783cd9359dd9a7b1a24408bfcbc722` adds `test/commercial-readiness-noema-marker-authority.test.ts`. It preserves the canonical approval case and independently requires rejection of upper-case decision, mixed-case decision, and upper-case head marker variants. The predecessor parser accepts all three hostile variants because the marker regex is case-insensitive and both captures are lower-cased.

GREEN `3c6c4b45775dde6cdf3b3d67cad9c566bbb05db0` removes only the marker regex `i` flag, compares the captured head exactly, consumes the captured decision without lower-casing, and updates the parser's authority-oriented docstring. RED→GREEN changes one production file by four additions/four deletions; no other merge-admission behavior changes.

A later focused RED `c20214d4f91c37c921ea0ab3c0a22d4aebc158d7` extends the same executable marker contract with three publisher-invalid but predecessor-admitted serializations: an extra space after `<!--`, a line break before `head_sha`, and an extra space before `-->`. Production repair `7bca1164cc2ccd880810e13a25cfdc24dea37c76` replaces only the permissive whitespace grammar with the publisher's literal one-line marker shape. Exact compare from RED to production repair is one ordinary-forward commit, one production file, `+1/-1`.

A focused semantic probe against the predecessor and repaired parser shapes produced:

- canonical marker: predecessor `approve`, repaired `approve`;
- `decision=APPROVE`: predecessor `approve`, repaired `null`;
- `decision=Approve`: predecessor `approve`, repaired `null`;
- upper-case marker `head_sha`: predecessor `approve`, repaired `null`;
- extra-space, embedded-line-break, or extra-closing-space marker: whitespace-permissive predecessor `approve`, repaired `null`.

This probe is local semantic evidence only. It does not replace the repository's hosted exact-head CI, required Security Scan, reviewer-ci, image gate, or fresh independent review.

## Alternatives rejected

**Keep case-insensitive or whitespace-flexible marker parsing because decisions are semantically equivalent.** Rejected because the marker is an authority protocol. Accepting multiple serializations expands the trusted language and can reintroduce normalization bugs downstream.

**Normalize only `head_sha` or whitespace while requiring exact decision text.** Rejected because all marker fields and delimiters participate in the same Noema-owned authority assertion; maintaining multiple serialization policies adds unnecessary ambiguity.

**Rely only on downstream `validateReviews()` exactness.** Rejected because upstream parsing would still manufacture a canonical `approve` token from malformed evidence, making later consumers vulnerable to accidental reuse of that canonicalized projection.

## Risk and follow-up

The compatibility risk is intentionally narrow: a reviewer implementation emitting non-canonical marker casing or spacing will stop satisfying Noema authority and require a fresh canonical review. This is fail-closed and preferable to treating malformed protocol text as merge permission.

Before Ready/merge, the current exact head still requires fresh independent current-head review and every applicable hosted gate to reach terminal GREEN. Commercial authority documentation in PR #729 must also follow the new #730 exact head before it can become current.