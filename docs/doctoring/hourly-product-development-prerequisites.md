# Hourly product-development publication prerequisites

## Documentation standard

This doctoring note uses APA 7 reference form. It separates source-supported facts from Noema-specific decisions and does not claim formal NIST conformance.

## Problem statement

The scheduled development path has two independent credential prerequisites:

1. `NOEMA_LLM_API_URL` and `NOEMA_LLM_API_KEY` permit the read-only OpenCode proposal job to reach the `contextual-orchestrator` gateway.
2. `NOEMA_MAINTAINER_APP_CLIENT_ID` and `NOEMA_MAINTAINER_APP_PRIVATE_KEY` permit the later non-executing publisher to create one repository-scoped branch and pull request.

Checking only the inference token can spend model compute on a proposal that the workflow is structurally unable to publish. That is a deterministic configuration failure rather than a model-quality failure and should be rejected before checkout or inference.

## Source-supported controls

GitHub documents that a workflow reads a secret only when the workflow explicitly includes it, and recommends granting credentials the minimum possible permissions. GitHub further recommends GitHub Apps as fine-grained, short-lived, non-user-bound credentials when repository automation needs permissions beyond read-only access. These facts support separating the gateway inference token from the repository publication credential and preserving read-only job-level `GITHUB_TOKEN` permissions. This is a least privilege control: model execution never receives publication authority, and publication receives only the repository-scoped permissions required to create one branch and pull request.

NIST SP 800-218 Version 1.1 recommends integrating secure-development requirements and verification into the software life cycle. NIST SP 800-218A augments that framework with practices specific to generative AI and foundation-model systems. The December 2025 SP 800-218 Revision 1 initial public draft describes updated secure and reliable development practices, but remains a draft; Noema therefore records it as a current informative source while retaining the final Version 1.1 and final AI community profile as the normative published references.

## Noema-specific decision

Before OpenCode starts, the proposal gate evaluates only presence booleans:

- `NOEMA_LLM_API_KEY != ''`
- `NOEMA_LLM_API_URL != ''`
- `NOEMA_MAINTAINER_APP_CLIENT_ID != ''`
- `NOEMA_MAINTAINER_APP_PRIVATE_KEY != ''`

The workflow does not reveal values, import the private key, mint an App token, or call a model during this gate. Missing publication configuration returns the stable reason `maintainer_app_unavailable` and stops before checkout, dependency installation, OpenCode download, or gateway inference. Missing gateway configuration returns `orchestrator_gateway_unavailable`.

The App token is still minted only in the third, non-executing publication job. Presence checking does not prove that the key is valid, that the App remains installed, or that permissions are sufficient; those live failures continue to fail closed when `actions/create-github-app-token` runs. This preserves the late-token trust boundary while preventing known-impossible sessions.

Manual `dry_run` deliberately bypasses credential-presence requirements because it performs no checkout, model call, artifact publication, branch push, or pull-request creation. It remains an operator inspection path rather than evidence that a live proposal can be published.

## Gateway contract, not provider keys

The gate uses the same dedicated gateway names as production review: `NOEMA_LLM_API_URL`, `NOEMA_LLM_MODEL`, and `NOEMA_LLM_API_KEY`. It does not read `NVIDIA_NIM_API_KEY`, `BYTEZ_API_KEY`, `OPENROUTER_API_KEY`, or `OPENAI_API_KEY`. Development proposal authority, publication authority, and independent review App identity remain separate even though both LLM jobs share the orchestrator contract.

## Verification contract

Executable tests must prove that:

- both Maintainer App presence booleans are evaluated in the pre-inference gate;
- either missing value produces `dispatch=false` and `reason=maintainer_app_unavailable`;
- missing gateway URL or key produces `orchestrator_gateway_unavailable`;
- the gate appears before task preparation, checkout, and OpenCode execution;
- `dry_run=true` remains available without production credentials;
- the dedicated gateway token and reviewer App identity remain separate; and
- operations and doctoring documents describe the same failure reason and credential names.

## Residual risk

Presence booleans can become stale between the initial gate and publication, and they cannot validate App installation scope or private-key correctness. Exact publication remains protected by fresh token minting, queue and base-head revalidation, repository-scoped permissions, and ordinary pull-request governance. The new gate reduces deterministic cost waste; it is not a substitute for live App readiness evidence under issue #29.

## APA 7 references

Booth, H., Souppaya, M., Vassilev, A., Ogata, M., Stanley, M., & Scarfone, K. (2024). *Secure software development practices for generative AI and dual-use foundation models: An SSDF community profile* (NIST Special Publication 800-218A). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218A

GitHub. (2026). *Secrets*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/concepts/security/secrets

GitHub. (2026). *Making authenticated API requests with a GitHub App in a GitHub Actions workflow*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure software development framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (Initial Public Draft NIST Special Publication 800-218, Revision 1). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218r1.ipd
