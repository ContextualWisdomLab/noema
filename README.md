# Noema

Noema is ContextualWisdomLab's dedicated GitHub App token exchange service for an independent LLM pull request reviewer.

It runs as a Cloudflare Worker on the Free tier:

- GitHub Actions requests a GitHub OIDC token with audience `cwl-noema-review`.
- Noema verifies the OIDC issuer, audience, organization owner, and trusted central workflow identity.
- Noema exchanges the verified OIDC token for a GitHub App installation token scoped to the target repository.
- The central `.github` workflow uses that installation token to submit an LLM review verdict from a GitHub App identity separate from OpenCode Agent.

The LLM call itself is configured in the central workflow with:

- `NOEMA_LLM_API_URL`
- `NOEMA_LLM_MODEL`
- `NOEMA_LLM_API_KEY`

## Required GitHub App permissions

Repository permissions:

- Pull requests: Read and write
- Checks: Read-only
- Contents: Read-only

Install the app on `ContextualWisdomLab/.github` and target repositories that use the central required workflow.

## Worker secrets

```powershell
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY_PEM
```

Optional:

```powershell
wrangler secret put GITHUB_APP_INSTALLATION_ID
```

## Deploy

```powershell
npm install
npm run deploy
```

Set `NOEMA_TOKEN_EXCHANGE_URL` in `ContextualWisdomLab/.github` variables to the deployed `/exchange` URL.
