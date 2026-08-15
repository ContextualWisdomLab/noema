# Workflow registry disablement: evidence and trust boundaries

## Documentation standard

This doctoring note uses APA 7 reference form and separates external platform facts from Noema-specific engineering decisions. It does not claim certification, NIST conformance, or that a successful GitHub API response by itself proves the intended workflow was safely retired.

## Source-supported facts

### GitHub workflow disablement API

GitHub documents a dedicated REST endpoint for disabling a repository workflow: `PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable`. A successful disable request returns HTTP `204 No Content`. The endpoint requires authenticated authority appropriate to the repository and workflow operation. Noema therefore treats disablement as an explicit privileged mutation rather than a side effect of file deletion or a synthetic repository workflow.

GitHub's current REST API version is `2026-03-10`, released March 10, 2026. GitHub documents both `2026-03-10` and `2022-11-28` as supported at the time of this change, with requests that omit the version header defaulting to the older version. Noema pins `X-GitHub-Api-Version: 2026-03-10` so the transport contract is explicit and testable.

### Secure software development

NIST SP 800-218 version 1.1 is the current final Secure Software Development Framework publication. It organizes secure development practices around preparing the organization, protecting software, producing well-secured software, and responding to vulnerabilities. NIST published an initial public draft of SP 800-218 Revision 1 / SSDF version 1.2 in December 2025; because that revision is not final, Noema cites it only as current draft direction and retains SP 800-218 version 1.1 as the normative final reference.

The final SSDF emphasizes protecting software from unauthorized access and tampering and using secure development practices to address root causes. The Revision 1 draft further illustrates least-privilege repository access and accountable version-control changes. These principles support a narrow operator capability that can disable only a freshly identified workflow and that remains subordinate to exact-state revalidation.

## Noema-specific decisions

### Read-only discovery and mutation authority stay separate

`scripts/workflow-registry-audit.mjs` remains read-only. It classifies the complete GitHub Actions registry against one exact protected-main tree plus active pull-request workflow paths. An `active_orphan` finding is evidence, not mutation authority.

`scripts/workflow-registry-disable-plan.mjs` converts only an exact, complete active-orphan audit into an immutable process-local plan. Any other failure type, stale protected-main identity, duplicate workflow identity, unsafe path, or live-state mismatch invalidates the plan.

`executeWorkflowDisablement` remains the mutation authority. Immediately before the mutation it revalidates the protected-main SHA and the exact workflow ID, path, and active state. Immediately after the mutation it requires the same workflow identity to be observed as `disabled_manually`. A `204` response is therefore necessary transport evidence but not sufficient completion evidence.

### Least-authority REST transport

`createGithubWorkflowDisablementTransport` provides only the three capabilities required by the executor:

1. read the exact `main` branch identity;
2. read one exact workflow registry record; and
3. disable one exact workflow ID.

The transport is hard-bound to `ContextualWisdomLab/noema`, validates positive integer workflow IDs, validates canonical repository workflow paths, validates a lowercase 40-hex protected-main SHA, and fails closed on non-success HTTP responses or malformed JSON/identity responses. It does not list candidates, batch-disable workflows, enable workflows, edit repository files, approve pull requests, merge, release, deploy, or weaken governance.

The delegated token is captured only in a closure used to construct the Authorization header. The returned transport object contains functions, not the token value, and diagnostics do not echo response bodies or credentials. Credential scope and provisioning remain operator responsibilities; this code does not invent, broaden, or fall back to another secret.

### No self-repair workflow

Noema intentionally does not create a repository Actions workflow to repair the Actions workflow registry. Such a writer would become another workflow identity that could itself be orphaned, stale, or competing. The bounded transport is an operator primitive consumed by the existing fail-closed plan/executor boundary.

## Verification mapping

| Risk or requirement | Executable control |
|---|---|
| Wrong repository | Exact `ContextualWisdomLab/noema` assertion before network access |
| Invalid workflow identity | Positive safe-integer ID plus canonical `.github/workflows/*.yml` / `.yaml` path validation |
| Stale protected main | Exact lowercase 40-hex SHA returned by transport and equality recheck in executor |
| Workflow replaced between audit and action | Executor re-reads exact ID/path/state immediately before mutation |
| HTTP/API failure | Non-2xx response fails closed; no fallback mutation |
| Malformed successful response | Strict JSON and identity validation fails closed |
| Disable acknowledged but not effective | Executor requires a fresh `disabled_manually` postcondition |
| Credential disclosure | Closure-private token; response bodies excluded from errors |
| API contract drift | Tests pin the current `2026-03-10` version header and documented disable endpoint |
| Competing repair writer | No new repository workflow or self-modifying control plane |

## Residual risks

The transport cannot prove that the delegated credential is optimally scoped; the caller must provision and rotate credentials according to organizational policy. GitHub service availability and API behavior remain external dependencies. A workflow can also become relevant again after it is disabled, so disablement is not equivalent to permanent deletion or proof that the corresponding business capability is obsolete.

The complete active-orphan registry must still be collected immediately before planning. Any movement of protected `main`, workflow registry identity, path inventory, or active pull-request ownership invalidates the affected lane rather than being silently reconciled.

## APA 7 references

GitHub. (2026). *API versions*. GitHub Docs. Retrieved August 16, 2026, from https://docs.github.com/en/rest/about-the-rest-api/api-versions?apiVersion=2026-03-10

GitHub. (2026). *REST API endpoints for workflows*. GitHub Docs. Retrieved August 16, 2026, from https://docs.github.com/en/rest/actions/workflows?apiVersion=2026-03-10

National Institute of Standards and Technology. (2025). *Secure Software Development Framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities (NIST SP 800-218 Rev. 1 initial public draft).* https://doi.org/10.6028/NIST.SP.800-218r1.ipd

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities (NIST SP 800-218).* National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
