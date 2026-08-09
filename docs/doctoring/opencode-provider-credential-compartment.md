# OpenCode provider credential compartment

Status: **Proposed until protected integration and operational proof**  
Scope: `.github/workflows/hourly-product-development.yml` model-proposal job  
Control implementation: `.opencode/plugins/noema-secret-compartment.js`

## Problem

The hourly product-development proposer must give the trusted OpenCode process the dedicated `NVIDIA_NIM_API_KEY` so the configured NVIDIA NIM provider can call its model. OpenCode's `bash` tool can execute model-selected shell commands. OpenCode documents tool permissions as the decision boundary for allowing or denying tool execution, and its plugin API exposes `tool.execute.before` for rejecting a tool before execution. The upstream implementation also creates bash child processes with inherited environment enabled.

Therefore a deny-list of selected command names such as `curl`, `git push`, or `gh` is not a credential compartment. A model-selected shell process is a materially different trust boundary from the provider client and can use other interpreters or commands that the command-name deny-list did not enumerate. GitHub likewise documents that an Actions secret supplied as an environment variable becomes available to the receiving process; log redaction is not an authorization boundary.

## Decision

Noema denies the OpenCode `bash` tool for the credential-bearing proposer with a repository-controlled project plugin. The plugin contains no secret value, does not inspect `process.env`, and fails the attempted shell tool call before command execution. The existing OpenCode configuration continues to deny `task`, `webfetch`, `websearch`, and external-directory access. The workflow must not invoke OpenCode in a mode that bypasses project plugins.

The model may still use non-shell proposal tools such as repository reads and edits. Executable verification belongs to the separate verifier job, which reconstructs the immutable proposal on a fresh runner and deliberately removes GitHub/action credentials before running `npm run release:verify`. The credential-bearing proposer therefore does not need model-selected shell authority to satisfy the repository's deterministic acceptance contract.

## Test-first evidence contract

`test/hourly-product-development-secret-compartment.test.ts` requires all of the following:

1. the proposer still obtains only the dedicated NVIDIA NIM secret required by the provider;
2. task/web/model-side network and external-directory paths remain denied;
3. project-plugin loading is not bypassed with OpenCode pure mode;
4. the trusted plugin contains an explicit `bash` veto and no environment-variable inspection; and
5. the actual plugin module can be loaded, rejects a `bash` tool invocation, and leaves a non-shell tool invocation available.

The initial RED revision failed because the required project plugin did not exist. The implementation revision added the veto; the following executable regression revision loads and exercises that hook directly. Exact-head CI and reviewer evidence must be refetched after every revision. A passing predecessor revision is never promoted to current-head proof.

## Remedies considered

- **Environment-variable blanking only — rejected.** Removing the variable only from a child environment is weaker than preventing the untrusted child process from existing and does not establish an OS-level isolation boundary.
- **Command-prefix allow/deny expansion — rejected.** Enumerating shell command strings remains vulnerable to alternate interpreters, wrappers, or newly introduced executables and does not bind authority to the intended provider operation.
- **Dedicated lower-privilege/containerized model-tool runtime — deferred architecture option.** Stronger OS isolation could permit carefully scoped shell execution later, but it needs an independently verified filesystem/network/process boundary, reproducible image/provenance evidence, and a bounded operational acceptance plan. It is not necessary for the current proposal path because executable verification already occurs in a separate uncredentialed job.
- **Deny the model shell at the OpenCode tool boundary — execute now.** This is the narrowest control that removes the identified credential-bearing child-process path while preserving the model's source-editing role and the independent verifier.

## Acceptance and residual risk

This control is not release or acquisition evidence until the exact integrated protected head passes CI, reviewer checks, eligible central security scanning, current review/governance requirements, and protected-main operational acceptance. The stacked pull request currently uses a feature base, so absence of the central Security Scan remains non-passing event-ineligible evidence until the predecessor integrates and the successor is refreshed onto an eligible protected base.

Residual risk remains in any future OpenCode feature, custom tool, formatter, plugin, or provider path that can execute model-controlled code outside the denied `bash` tool. Any such capability must be threat-modeled and covered by a fail-closed regression before it is enabled. The repository must also continue to pin and verify the OpenCode distribution itself; this plugin cannot compensate for a compromised trusted OpenCode binary.

## References

GitHub. (2026). *Secrets*. GitHub Docs. https://docs.github.com/en/actions/concepts/security/secrets

GitHub. (2026). *Secure use reference*. GitHub Docs. https://docs.github.com/en/actions/reference/security/secure-use

OpenCode. (2026). *Permissions*. https://opencode.ai/docs/permissions

OpenCode. (2026). *Plugins*. https://opencode.ai/docs/plugins

OpenCode. (2026). *Agents*. https://opencode.ai/docs/agents

OpenCode. (2026). *Session prompt implementation (`extendEnv: true`)*. GitHub. https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/prompt.ts
