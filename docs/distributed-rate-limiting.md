# Distributed `/exchange` rate limiting

## Purpose

Noema exchanges short-lived GitHub Actions OIDC credentials for a repository-scoped GitHub App token. The endpoint therefore needs an abuse-control boundary that remains coherent when Cloudflare routes requests to different Worker isolates or restarts an isolate.

The Worker keeps the original in-isolate fixed-window limiter as defense in depth, but the authoritative pre-authentication decision is now made by a SQLite-backed Cloudflare Durable Object.

## Architecture

1. `src/worker.ts` intercepts only `/exchange` requests.
2. The client bucket is derived exclusively from Cloudflare's `CF-Connecting-IP` header. Caller-controlled forwarding headers are ignored. The value must contain exactly one valid IPv4 or IPv6 address; malformed, out-of-range, comma-separated, bracketed, zone-qualified, or overlong values return `503` before any shared bucket or Durable Object lookup is used.
3. Valid addresses are canonicalized before hashing, so equivalent IPv6 spellings map to the same bucket. The canonical client identifier is SHA-256 hashed before it is used as the Durable Object name. Raw client IP addresses are not stored in the object name or bucket record.
4. Each client hash maps to one `NoemaRateLimiter` Durable Object instance.
5. The object uses transactional, strongly consistent storage for one 60-second fixed-window bucket.
6. Alarm cleanup re-reads the current bucket atomically. An expired or empty bucket is deleted, while a delayed or retried alarm that observes a newer active window is rescheduled to that window's actual reset time instead of erasing its count.
7. The request proceeds to the existing OIDC and GitHub App exchange only when the distributed decision is `allowed=true`.
8. A denied request returns `429`, `Retry-After`, and `X-Rate-Limit-*` headers without parsing the bearer token.
9. A missing trusted client identity, missing binding, failed object request, non-2xx response, or malformed decision fails closed with `503` and `Retry-After: 1`.

Cloudflare documents Durable Objects as globally unique coordination primitives with private, transactional, strongly consistent storage. Durable Object alarms have at-least-once execution and may be delayed or retried, so cleanup must validate the current stored deadline rather than assuming every alarm invocation still belongs to the bucket that originally scheduled it. New namespaces use the SQLite backend and can be declared with Wrangler's `exports` lifecycle configuration. Cloudflare also documents that `CF-Connecting-IP` is the edge-provided visitor identity header and that request or managed transforms can remove it; Noema therefore treats absence as a deployment misconfiguration rather than collapsing unrelated callers into one fallback bucket:

- https://developers.cloudflare.com/durable-objects/
- https://developers.cloudflare.com/durable-objects/get-started/
- https://developers.cloudflare.com/durable-objects/api/alarms/
- https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip
- https://developers.cloudflare.com/rules/transform/managed-transforms/reference/#remove-visitor-ip-headers

## Configuration

`wrangler.toml` is the source of truth:

```toml
[[durable_objects.bindings]]
name = "NOEMA_RATE_LIMITER"
class_name = "NoemaRateLimiter"

[exports.NoemaRateLimiter]
type = "durable-object"
storage = "sqlite"
```

`NOEMA_RATE_LIMIT_PER_MINUTE` controls both the distributed limiter and the existing isolate-local limiter. Invalid or non-positive values fall back to `60`; values above `10000` are clamped to `10000`.

The Cloudflare zone must not enable a request transform or the **Remove visitor IP headers** managed transform for the `/exchange` route. If an upstream Worker calls this Worker cross-zone, review Cloudflare's documented Worker-subrequest behavior before enabling the route because cross-zone requests can share Cloudflare's Worker client address and should not be treated as independent end-user identities.

## Privacy and trust boundary

- Only `CF-Connecting-IP` is treated as the client identity input.
- `X-Forwarded-For` and `X-Real-IP` cannot select a distributed bucket.
- Exactly one syntactically valid IPv4 or IPv6 address is accepted and canonicalized; ambiguous or multiple-address forms fail closed.
- Missing, malformed, or overlong client identity values fail closed before object lookup; unrelated clients are never merged into a global `unknown` bucket.
- Durable Object names contain only a SHA-256 digest.
- Stored bucket data contains a window start timestamp and count, not a client identifier, bearer token, repository, or workflow reference.
- Logs contain outcome, limit, retry duration, and bounded backend diagnostics; they do not contain the raw client identifier or credentials.

## Operational verification

Before merge and release:

```bash
npm run typecheck
npm test
npm run security:scan
npm run release:verify
```

Before production promotion:

1. Confirm Wrangler reports creation or reconciliation of the `NoemaRateLimiter` SQLite namespace.
2. Confirm no request-header Transform Rule or managed transform removes `CF-Connecting-IP` for `/exchange`.
3. Verify `/health` does not call the Durable Object.
4. Send repeated unauthenticated `/exchange` requests from one source and confirm the configured threshold returns `429` with `Retry-After`.
5. Confirm accepted `/exchange` responses, including authentication failures, carry `X-Rate-Limit-Limit`, `X-Rate-Limit-Remaining`, and `X-Rate-Limit-Scope: distributed`.
6. In a non-production test route, remove or corrupt `CF-Connecting-IP` and confirm `/exchange` returns `503` without invoking the Durable Object or parsing the bearer token.
7. Confirm expanded and compressed representations of the same IPv6 address select the same Durable Object bucket.
8. Exercise an alarm after its original window has expired and a newer window has already begun; confirm the newer count remains stored and the alarm is moved to the newer reset deadline.
9. Temporarily test a missing or invalid binding in a non-production environment and confirm `/exchange` fails closed with `503` rather than bypassing the limiter.
10. Retain Cloudflare deployment evidence and post-deployment smoke evidence through the existing production workflow.

## Layered protection

This limiter protects the application-level token exchange budget and coordinates decisions across Worker isolates. It is not a volumetric DDoS substitute. Production should retain Cloudflare WAF/rate-limiting rules as the outer edge layer, with the Durable Object limiter as the authorization-adjacent control.

## Rollback and lifecycle safety

A code rollback may target only a release that preserves fail-closed behavior for missing or invalid `CF-Connecting-IP` identities. Never roll back to a release that uses a shared `unknown` fallback bucket; if no compliant rollback release exists, retain the current entrypoint and repair the Cloudflare route or transform configuration first.

The `NoemaRateLimiter` export must not be silently removed from Wrangler configuration because class lifecycle changes can delete or orphan a Durable Object namespace. Use an explicit reviewed `exports` lifecycle state for any future rename, transfer, or deletion, and preserve the existing namespace until operational evidence confirms it is no longer required.

Do not restore unconditional `deleteAll()` alarm handling. Cloudflare alarms are at-least-once and can be delayed or retried; unconditional cleanup can erase a renewed active bucket and temporarily reopen the request budget.
