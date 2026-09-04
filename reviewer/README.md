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

The verdict shape is the JSON contract from the sandbox plan. Each finding
carries structured actionability rather than relying on free-form prose:

```json
{
  "verdict": "approve | request_changes | blocked",
  "summary": "…",
  "findings": [{
    "severity": "critical|high|medium|low|info",
    "priority": "P1|P2|P3",
    "path": "…",
    "line": 1,
    "check_name": "exact failed check name | null",
    "evidence": "…",
    "evidence_type": "nearby_implementation|matching_existing_example|cross_file_counterpart|current_official_docs|failed_check_or_log",
    "observable_impact": "…",
    "trigger": "…",
    "recommendation": "smallest fix",
    "regression_command": "one exact single-line command",
    "suggested_diff": "optional replacement text | null"
  }],
  "suggested_patch_ref": null,
  "blocked_reasons": [],
  "confidence": "high | medium | low"
}
```

`check_name` is optional for ordinary source, SARIF, dependency, and review-thread
findings. A finding offered as the RCA for a failed current-head check must bind
to that exact check name. The deterministic gate requires each ordinary failed
check to have its own blocking-severity finding on a current-head changed path
with a positive line; one unrelated or differently bound finding cannot clear
another failed check.

`regression_command` cannot contain newlines or Markdown backticks. A
`suggested_diff` cannot contain a Markdown fence and is accepted only when its
`path:line` is a right-side anchor in the exact PR diff. Accepted replacement
text is sent through GitHub's inline review `comments` payload as a suggestion,
not merely printed in the top-level review body.

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
   regular files, cap the structural maps, and use them solely as retrieval
   seeds for one second `explore`. Because the path-only query is whitespace-
   delimited, symbol recovery also requires exactly one filesystem-valid
   segmentation of that scope; multiple possible current-head segmentations
   fail closed instead of letting an unchanged lookalike path become a retrieval
   seed. The node output never counts as review evidence by itself; deleted,
   unresolved, symlink-only, unindexed, or symbol-less paths leave the original
   empty result fail closed.
2. **MEDIUM-or-higher dependency findings can't ride out on an approve.** An
   unresolved OSV/Trivy/dependency-review finding at MEDIUM+ downgrades an
   approval to `request_changes` with the finding attached — the org rule is
   "remediate by bump, not gate weakening".
3. **Current-head failures remain blocking until causally mapped.** Every
   ordinary failed GitHub Check remains `blocked` unless its exact check name is
   bound to its own current-head changed-file, positive-line blocking RCA.
   Check-run names or workflow URLs are not synthesized into source findings.
   MEDIUM-or-higher code-scanning/SARIF alerts remain deterministic findings.
4. **Suggestions must be executable review artifacts.** Suggested replacement
   text is rejected before publication if GitHub cannot attach it to the exact
   right side of the reviewed diff; fence injection and multiline regression
   commands fail schema validation.
5. **Reviewer independence cannot deadlock.** The exact primary check name
   `opencode-review` and downstream `metadata-only gate evaluation` are ignored
   by Noema's failed-check RCA gate; similarly named checks are not. All other
   failed checks and unresolved non-outdated inline threads remain blocking.
6. **Long reviews stay useful.** The production provider request timeout
   defaults to 5,400 seconds and provider 429/5xx responses receive bounded SDK
   retries. Production failover belongs inside `contextual-orchestrator`; Noema
   does not sequentially try the next model. Publication re-reads the live PR
   head and refuses stale evidence.

The GitHub manifest fetch covers all inline review threads (including resolved
and outdated state), submitted review bodies, conversation comments, failed
current-head workflow logs, current-head code-scanning alerts, and open
Dependabot package advisories. Failed-check log collection derives an Actions
Job id only from an exact repository-bound GitHub `details_url`; a Check Run id
is never reused as a Job id. If the Actions log cannot be obtained, collection
falls back to the same Check Run's bounded annotations. Evidence-fetch errors
are part of the manifest, not silent empty lists.

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
