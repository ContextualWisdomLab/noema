# Runtime liveness and readiness

Noema exposes separate operational probes so traffic is not routed to a live but unusable credential-exchange deployment.

## Endpoints

### `GET /health`

Liveness only. A `200` response proves that the Worker request path is executing. It does not validate GitHub App credentials, OIDC trust configuration, or the GitHub API boundary.

```json
{
  "ok": true,
  "data": {
    "name": "noema"
  },
  "trace_id": "..."
}
```

### `GET /ready`

Runtime traffic readiness. No authentication is required and no external network request is made.

A ready deployment returns `200`:

```json
{
  "ok": true,
  "data": {
    "name": "noema",
    "status": "ready",
    "checks": {
      "configuration": "pass"
    }
  },
  "trace_id": "..."
}
```

A deployment whose credential-exchange configuration is incomplete or invalid returns `503`:

```json
{
  "ok": false,
  "error_code": "ERR_SERVICE_NOT_READY",
  "message": "Noema credential exchange is not ready",
  "details": {
    "hint": "Repair the listed configuration checks before routing credential-exchange traffic.",
    "failed_checks": "github_app_id,github_app_private_key"
  },
  "trace_id": "..."
}
```

The `failed_checks` value contains stable check identifiers only. Noema does not return secret values, App identifiers, repository configuration, private-key bytes, parser errors, or cryptographic exceptions.

`HEAD /ready` returns the same status and headers without a response body. Other methods return `405` and `Allow: GET, HEAD`.

## Required readiness headers

Both ready and not-ready responses include:

- `Cache-Control: no-store`
- `Pragma: no-cache`
- `X-Content-Type-Options: nosniff`
- `X-Trace-Id`
- `X-Latency-Ms`
- `X-Noema-Readiness: ready|not-ready`

A not-ready response also includes `Retry-After: 30`.

## Configuration checks

| Check identifier | Requirement |
|---|---|
| `allowed_issuer` | Exact GitHub Actions OIDC issuer |
| `allowed_audience` | Nonempty bounded protocol-safe audience |
| `allowed_repository_owner` | Valid organization owner name |
| `allowed_workflow_repository` | Trusted workflow repository owned by the configured organization |
| `allowed_workflow_ref` | Exact workflow path and protected ref or immutable SHA, without wildcard |
| `github_api_base` | Exact GitHub Cloud REST API root |
| `github_app_id` | Positive decimal GitHub App identifier |
| `github_app_private_key` | Importable PKCS#8 RSA private key |
| `github_app_installation_id` | Positive decimal identifier when fixed-installation mode is configured |

`GITHUB_APP_INSTALLATION_ID` remains optional. When omitted, Noema discovers the installation for the requested repository during an authenticated exchange.

## Routing policy

An orchestrator should:

1. use `/health` only to detect an unavailable Worker process;
2. use `/ready` to decide whether to send `/exchange` traffic;
3. stop routing new exchange traffic while `/ready` returns `503`;
4. retry according to `Retry-After`; and
5. avoid restarting a healthy process solely because readiness configuration is temporarily unavailable.

## Deployment smoke test

Run the existing smoke contract against a deployed Worker:

```bash
NOEMA_EXCHANGE_URL="https://noema.example/exchange" \
  bash scripts/smoke-readiness.sh
```

The command fails unless all of the following pass:

- `/health` liveness schema and headers;
- `/ready` runtime-readiness schema, state, and headers; and
- the unauthenticated `/exchange` `401 ERR_AUTH_MISSING` challenge contract.

To retain machine-readable evidence:

```bash
NOEMA_EXCHANGE_URL="https://noema.example/exchange" \
NOEMA_SMOKE_EVIDENCE_PATH="./noema-smoke-evidence.json" \
  bash scripts/smoke-readiness.sh
```

The output must be treated as deployment evidence for the tested endpoint and time only; it is not a substitute for production governance, release provenance, or long-window KPI evidence.
