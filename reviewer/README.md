# Noema reviewer (PydanticAI second reviewer)

This is the reviewer **agent** plane described in
[`docs/noema-agent-sandbox-plan.md`](../docs/noema-agent-sandbox-plan.md)
(ContextualWisdomLab/noema#9). It is an independent second reviewer that runs
alongside OpenCode so the organization's two-reviewer merge rule is satisfied by
two genuinely independent judgements, not by weakening the rule.

Division of responsibility:

- **Noema Cloudflare Worker** (`../src`) — the GitHub-App **token exchange**
  boundary. It hands the CI job a scoped installation token as the Noema bot
  identity. It never runs untrusted repository code.
- **`noema_reviewer`** (this package) — the **judgement** plane. It turns a
  bounded pull-request manifest into a validated `ReviewVerdict` and can publish
  it as an independent GitHub review.

## Contract

The verdict shape is the JSON contract from the sandbox plan:

```json
{
  "verdict": "approve | request_changes | blocked",
  "summary": "…",
  "findings": [{"severity": "critical|high|medium|low|info", "path": "…", "line": 1, "evidence": "…", "recommendation": "…"}],
  "suggested_patch_ref": null,
  "blocked_reasons": [],
  "confidence": "high | medium | low"
}
```

The following guarantees are enforced deterministically around the LLM
(`gating.py`), so they hold regardless of what the model says:

1. **Strict runs never pass silently.** With `--strict`, a manifest missing its
   diff, changed-file context, current check conclusions, CodeGraph evidence,
   or any requested GitHub evidence source returns a `blocked` verdict that
   names every gap. Production collection emits exactly one wrapper-owned
   `## codegraph explore` provenance marker and treats any raw stdout line that
   contains the same marker text as marker-contaminated input: that whole line
   is discarded before the trusted section is retained. Clean semantic lines
   from the same output remain eligible. If raw stdout contains only marker-
   contaminated lines, collection retains an empty labelled explore section
   rather than letting a neutralization annotation become semantic evidence. A
   strict manifest with more than one trusted explore marker is therefore
   ambiguous and fails closed. Initialization/status banners, an empty labelled
   explore section, unlabelled concatenated output, an explicit `No relevant
   code found` semantic response prefix after known lifecycle/wrapper
   annotations are removed (including irregular ASCII or Unicode whitespace),
   truncation/workflow-command annotations without retained semantic bytes, and
   control/punctuation-only output are not semantic review evidence. The same
   words appearing later inside retained source/code context do not erase
   independent semantic evidence. Setup/status bytes cannot redefine the
   wrapper-owned explore boundary. When the standard changed-file explore query
   returns an explicit empty result, the collector may probe the pinned
   CodeGraph `node --file … --symbols-only` interface only for exact current-head
   regular files whose repository-relative path can be walked from the checkout
   without traversing any symlinked component. The checkout root itself must be
   a physical directory whose resolved path equals its absolute path; a symlinked
   checkout root or symlinked ancestor invalidates symbol recovery. A regular
   file reached through a symlinked parent is not current-head evidence and
   cannot seed recovery. The collector caps the structural maps and uses them
   solely as retrieval seeds for one second `explore`. Known leading CodeGraph
   lifecycle/status banners are removed only for this empty-result
   classification, so a banner cannot suppress symbol-seeded recovery while
   arbitrary preceding output still cannot trigger a repository probe. The
   primary explore query preserves each selected changed path in full instead of
   truncating individual path identities; it admits at most 80 changed files and
   24,079 aggregate characters. The manifest retains bounded current-head file
   content for every selected file through that same 80-file canonical scope;
   above 80 files both semantic scope and changed-file context fail closed rather
   than reviewing a historical 12-file prefix. Exceeding either exact-scope
   budget fails closed instead of querying a prefix. The changed-file recovery
   scope removes only Noema's single query-delimiter space and otherwise
   preserves filename whitespace bytes exactly, including tabs, newlines,
   repeated spaces, and leading/trailing spaces. Symbol-recovery segmentation
   likewise preserves the full filesystem-valid path instead of imposing a
   separate per-path character cutoff. To keep ambiguous whitespace parsing
   bounded, recovery admits at most 512 whitespace tokens and 4,096 candidate
   filesystem probes; exhausting either budget fails closed without issuing a
   symbol query. Recovery is complete rather than sampled: if the uniquely
   recovered changed-file scope contains more than eight files, Noema does not
   take an eight-file prefix and retry. The original empty result remains fail
   closed until the full selected scope can be represented within the seed
   bound. Where literal spaces could be either filename bytes or inter-path
   separators, symbol recovery still requires exactly one filesystem-valid
   segmentation; multiple valid segmentations fail closed instead of letting an
   unchanged lookalike path become a retrieval seed. The node output never
   counts as review evidence by itself; deleted, unresolved, symlinked-component,
   unindexed, or symbol-less paths leave the original empty result fail closed.
   The local host-process CodeGraph fallback also builds a closed execution
   environment instead of copying the parent environment: only `PATH` and
   locale discovery variables may be propagated; `HOME`, `TEMP`, `TMP`, and
   `TMPDIR` are replaced by one fresh per-command private temporary directory and
   `NO_COLOR=1` is set explicitly. Process injection, host user
   configuration/credentials, ambient temporary-directory capabilities,
   credential-helper/socket, container/Kubernetes, proxy, arbitrary workflow,
   and provider variables such as `NODE_OPTIONS`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`,
   `DOCKER_CONFIG`, `KUBECONFIG`, and `HTTPS_PROXY` are not ambient CodeGraph
   authority. Production central review still uses the separately attested
   no-network sandbox; this host fallback does not replace that isolation
   boundary. The production `DockerCodeGraphRunner` now owns the same semantic
   wrapper and passes both the exact symbol probe and any symbol-seeded second
   `explore` through its verified no-network container boundary. It extracts
   only the trusted sandbox copy receipt and sole explore stdout section before
   semantic classification, so setup/status bytes cannot satisfy the strict gate
   and an empty production explore cannot silently fall back to a host CodeGraph
   process.
2. **MEDIUM-or-higher dependency findings can't ride out on an approve.** An
   unresolved OSV/Trivy/dependency-review finding at MEDIUM+ downgrades an
   approval to `request_changes` with the finding attached — the org rule is
   "remediate by bump, not gate weakening".
3. **Current-head failures remain blocking.** Failed GitHub Checks and
   MEDIUM-or-higher code-scanning/SARIF alerts deterministically downgrade an
   approval and retain their exact job, rule, path, and bounded log evidence.
4. **Reviewer independence cannot deadlock.** The exact reviewer check names
   `noema-review` and `opencode-review`, plus the downstream
   `metadata-only gate evaluation`, are excluded from Noema's deterministic
   failed-check gate because they cannot be prerequisites for the review that
   produces them. This cycle exception cannot satisfy strict evidence by itself:
   at least one current-head check outside that reviewer-dependent set must be
   observed. Similarly named checks remain blocking, as do every other failed
   check and unresolved non-outdated inline thread.
5. **Long reviews stay useful.** The production provider request timeout
   defaults to 5,400 seconds and provider 429/5xx responses receive bounded SDK
   retries. Production failover belongs inside `contextual-orchestrator`; Noema
   does not sequentially try the next model. Publication re-reads the live PR
   head and refuses stale evidence.

The GitHub manifest fetch covers all inline review threads (including resolved
and outdated state), submitted review bodies, conversation comments, failed
current-head workflow logs, current-head code-scanning alerts, and open
Dependabot package advisories. Evidence-fetch errors are part of the manifest,
not silent empty lists.

The driver sits behind the small `ReviewAgent` protocol, so the sandbox plan's
"Codex, OpenCode, PydanticAI, or another driver" swap is a one-line change.

## Usage

```bash
# Review a PR end to end (fetch manifest via gh, publish the verdict):
python -m noema_reviewer --repo ContextualWisdomLab/naruon --pr-number 1039 \
  --source-root /workspace/naruon --strict --publish

# Judge a prepared manifest offline and print the verdict JSON:
python -m noema_reviewer --manifest-file manifest.json
```

Exit code: `0` for approve, `2` for request_changes, `3` for blocked.

## Configuration

The model call goes to an OpenAI-compatible endpoint (the
`contextual-orchestrator` gateway in production). Settings are resolved
KV-first, with the CI secret environment as bootstrap transport only
(`config.py`):

- `NOEMA_LLM_MODEL`
- `NOEMA_LLM_API_URL`
- `NOEMA_LLM_API_KEY`
- `NOEMA_LLM_REQUEST_TIMEOUT_SECONDS` (default `5400`, allowed `60..7200`)
- `NOEMA_LLM_MAX_RETRIES` (default `1`, allowed `0..8`)

The trusted central production workflow supplies only the primary
`contextual-orchestrator` endpoint and a dedicated gateway inference token. It
verifies the gateway's `/healthz` identity and rejects known direct-provider
hosts. Leftover `NOEMA_FALLBACK_*` settings fail closed. Provider selection
belongs inside `contextual-orchestrator` so cost, allowlist, circuit-breaker,
and audit policies cannot be bypassed by a second model inside Noema.

The same contract is published for `ContextualWisdomLab/naruon` judgments and
decisions (`contracts/orchestrator-gateway.json`). naruon is a first-class
consumer; its wiring is a separate repository pull request.

Publication uses the Noema GitHub-App installation token (from the Worker) or a
`NOEMA_REVIEW_TOKEN` fallback with `pull-requests: write`.

## Develop

```bash
pip install -e .[dev]          # or: pip install pydantic-ai-slim[openai] pytest pytest-cov interrogate
python -m pytest               # 100% line+branch coverage gate
python -m interrogate -c pyproject.toml noema_reviewer   # 100% docstring gate
```

Tests drive the agent with PydanticAI's offline `TestModel`/`FunctionModel` and
a stub `gh` runner — no network, no secret, no real model.
