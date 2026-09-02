# ADR-0012: `noema-core` — a minimal shared package for Agent-construction wiring

- **Status:** Proposed
- **Decision owner:** Noema repository governance
- **Scope:** `ContextualWisdomLab/noema` (`reviewer/`, new `packages/noema-core/`); informs `ContextualWisdomLab/naruon` and, later, `ContextualWisdomLab/.github`

## Context

[`docs/CWL-MASTER-CONTEXT.md`](https://github.com/ContextualWisdomLab/.github/blob/main/docs/CWL-MASTER-CONTEXT.md)
(`ContextualWisdomLab/.github`, §3/§6, ecosystem UML) defines **noema** as one
shared agent runtime (Pydantic-AI/Codex-Python) used by three consumers: the
GitHub review agent (this repository's `reviewer/`), a do-anything tenant
agent inside `naruon`, and `wardnet`'s AI-SOC/quarantine-detonation judge. In
practice it drifted into three independent implementations that share only
the name "Noema" and an OpenAI-compatible-endpoint convention:

- **This repository's `reviewer/noema_reviewer`** — a PydanticAI `Agent`
  with a typed `ReviewVerdict` output, deterministic post-model gates
  (`gating.py`), and CI-specific evidence plumbing. Model wiring lives in
  `noema_reviewer/config.py:resolve_model` (KV/env resolution, fail-closed
  validation, then `AsyncOpenAI` → `OpenAIChatModel` → `OpenAIProvider`) and
  `noema_reviewer/agent.py:PydanticAIReviewAgent.__init__` (the `Agent(...)`
  construction itself).
- **`naruon`'s `backend/services/noema_agent.py`** — an async multi-tool
  PydanticAI `Agent` over tenant-scoped deps (`NoemaAgentDeps`), six
  registered `@agent.tool` closures, and free-text output (no verdict
  schema). `build_noema_agent()` (`noema_agent.py:465-550`) independently
  builds the identical `AsyncOpenAI` → `OpenAIChatModel` → `OpenAIProvider`
  chain at `:473-497`, then `Agent(model, deps_type=NoemaAgentDeps,
  system_prompt=SYSTEM_PROMPT)` at `:498-502`. Its LLM provider resolution
  (`resolve_runtime_llm_provider()`, tenant-scoped, Fernet-encrypted direct
  provider records) is **not** orchestrator-gateway-routed today — that is
  stalled PR `naruon#1384`.
- **`ContextualWisdomLab/.github`'s `scripts/ci/noema_review_gate.py`** — a
  self-contained, stdlib-only (`urllib.request`) script with no PydanticAI
  import anywhere in the file: one hardcoded prompt string, a manual
  `urllib` POST, and its own JSON verdict parsing
  (`extract_json_object`/`validate_substantive_verdict`). Structurally
  unrelated to the other two.

Two naruon PRs compound the confusion: `naruon#1486`'s description frames
`.github`'s and naruon's Noema as "two separate agents that intentionally
share only a name" — an over-hasty "stay separate" framing corrected the same
day this ADR was written, in the same investigation that produced it. Both
`naruon#1486` and `naruon#1384` are open, both edit `noema_agent.py`, and
both add a colliding `docs/adr/0005-*.md` in that repository — an unresolved
merge-order hazard independent of this decision.

[`docs/product-goal-directive.md` §5](https://github.com/ContextualWisdomLab/.github/blob/main/docs/product-goal-directive.md)
(`ContextualWisdomLab/.github`) directs minimizing a Shared Kernel to the
smallest stable surface and keeping each bounded context's domain model an
Anti-Corruption Layer away from it — not collapsing genuinely different
contexts into one framework.

### Alternatives considered

**A — Shared package (`noema-core`), chosen.** Extract only the
`AsyncOpenAI`→`OpenAIChatModel`→`OpenAIProvider`→`Agent(...)` construction
wiring — the one piece independently duplicated, in the same language, in
the same framework, in *current, unstalled* code — into an installable
package each consumer imports and calls. Nothing about verdict schema,
tool/deps machinery, credential policy, or tenant isolation moves.

**B — Shared service (`noema-service`, `/v1/review` + `/v1/agent/turn` +
`/v1/detonate`).** One always-on HTTP service fronting all three consumers.
Rejected for now on evidence, not principle: two of its three endpoints have
no caller today. `wardnet` has zero artifact-analysis code (grepped the
whole repo for `yara|capa|lief|gvisor|firecracker|ebpf|detonat|IOC|submit(
artifact` — no hits beyond an unrelated UI column literally named
"Verdict"), and `quarantine-sandbox-runtime` has no Podman-backed
`CommandExecutionBackend` and no transport (CLI or HTTP) at all — both
scoped out by that repository's own ADR-0007, partly blocked on
`ContextualWisdomLab/.github#1590` (a dedicated LSM-capable CI runner).
`/v1/agent/turn` is the design's own admitted hard part: naruon's multi-turn
tool loop over stateless HTTP function-calling is unproven, and per-tool-call
network round-trips are a real latency cost nobody has asked to pay. Standing
up a three-endpoint always-on service where two endpoints are stubs violates
both this repository's own one-phase-at-a-time convention and the "does this
need to exist yet" first rung — not until `wardnet` and
`quarantine-sandbox-runtime` clear their own, independently blocked,
prerequisites.

**C — Contract-only (schema, no shared code).** Publish/extend an identity
and verdict-shape contract (`agent_name`/`authority`/`inference_route`/
`credential_source`) that each implementation asserts against in its own
test suite, and leave all three implementations exactly as they are
otherwise. Correct that the three sit in genuinely different bounded
contexts (CI diff-review vs. tenant multi-tool agent vs. future sandboxed
detonation judge), and right that `validate_substantive_verdict`, naruon's
tool/deps machinery, and wardnet's evidence model must never be pulled into
a shared kernel. But alone it does not deliver "real compatibility" — this
repository's `call_llm`-equivalent and `.github`'s already share the
`NOEMA_LLM_*` env-var contract with zero code sharing today
(`contracts/orchestrator-gateway.json` in this repository is exactly that:
a schema, not shared code), so recommending contract-only as the *whole*
answer reads as the same "stay separate" conclusion `naruon#1486`'s
description drew, just with a schema stapled on.

## Decision

Adopt **A — shared package**, scoped to exactly the `Agent`-construction
wiring plus a shared persona-identity fragment, landing as `packages/noema-core/`
in this repository (see `README.md` there for the two functions and one
constant it exports). This is a small, stable, low-change kernel — precisely
product-goal-directive.md §5's "minimize Shared Kernel" reading, not a
framework the bounded contexts become subordinate to. Each consumer's domain
model — this repository's verdict schema and gates, naruon's tool/deps and
tenant isolation, wardnet's future evidence model — stays untouched and
local, satisfying the ACL requirement.

`ContextualWisdomLab/.github`'s `noema_review_gate.py` is explicitly left out
of v1: migrating a stdlib-only script onto PydanticAI is a rewrite, not an
extraction, and this repository's own one-phase-at-a-time convention rules
that out of this PR.

**Grafted from C (do in parallel, not deferred):** amend `naruon#1486`'s
description (doc-only) to drop the "intentionally share only a name" framing
this ADR corrects; add one assertion each to this repository's `reviewer/`
test suite and to `.github`'s `noema_review_gate` test suite against a new
`noema-identity.schema.json` (`agent_name`/`authority`/`inference_route`/
`credential_source`). Cheap (a few asserts against existing test suites),
immediate, and it disambiguates `naruon#1486` from the colliding
`naruon#1384` ADR file before either merges. **Not implemented by this PR** —
tracked as a next step below.

**Named as the explicit phase-2 trigger from B (not built now):** a thin
ASGI wrapper (`/v1/review`) around a future noema-core orchestrator-client
piece, for the one gap noema-core cannot solve — `wardnet` is Rust and will
never `pip install` a Python package. Build this only once `wardnet` has an
actual artifact-analysis pipeline to route (it has none today) and
`quarantine-sandbox-runtime` clears its own independently blocked
Podman-backend/transport work. Do not build a rebuild of the three-endpoint
`noema-service` design when that day comes — build the smallest wrapper
around whatever noema-core's orchestrator-client piece has become by then.

## First concrete PR (this change)

Extracted from `reviewer/noema_reviewer` into `packages/noema-core/src/noema_core/agent.py`:

- `build_openai_model(*, base_url, api_key, model_name, timeout=None, max_retries=1) -> Model`
  — the `AsyncOpenAI` → `OpenAIChatModel` → `OpenAIProvider` chain, called
  from `noema_reviewer/config.py:resolve_model` after that module's existing
  KV/env resolution and fail-closed validation (routing-alias and endpoint
  safety checks), which stay local since they are CI-specific policy, not
  shared wiring.
- `build_agent(model, *, system_prompt, output_type=str, deps_type=None,
  retries=3) -> Agent` — the `Agent(...)` construction, called from
  `noema_reviewer/agent.py:PydanticAIReviewAgent.__init__` (imported under
  the alias `build_core_agent` to avoid colliding with this repository's
  own pre-existing, differently-shaped `build_agent(config) ->
  PydanticAIReviewAgent` production factory in the same module).
- `NOEMA_PERSONA` — a shared identity fragment now prepended to
  `noema_reviewer/agent.py:SYSTEM_PROMPT`, demonstrating the
  persona-injection point without altering the prompt's meaning or any
  test-asserted behavior.

`reviewer/` is the sole consumer (self-consumption only; zero new external
consumers in this PR). No behavior change: `reviewer/`'s existing 478-test,
100%-line/branch-coverage, 100%-docstring suite passes unmodified against
the refactored code (verified locally: `python -m pytest` and `python -m
interrogate` both report the same 100% before and after). `noema-core` has
its own equivalent 100%/100% suite. Not yet published to an index — both CI
(`.github/workflows/central-review.yml`) and local pytest reach it via
`PYTHONPATH`, the same mechanism this repository already uses to provide
`noema_reviewer` itself.

This is smaller and lower-risk than starting in `naruon`: single repository,
no production tenant-agent touched, and no collision with naruon's two
currently-open competing PRs. Naruon's adoption (importing `noema-core`,
replacing `noema_agent.py:473-497`'s inline wiring) is PR #2, explicitly
sequenced after this one and after naruon's `#1486`/`#1384` merge-order
conflict is resolved — not bundled here.

## Consequences

### Positive

- The one real, current, same-language duplicate (Agent-construction wiring)
  has one implementation instead of two, with room for a third (naruon) to
  adopt it without inventing a new interface.
- No bounded context's domain model moves: verdict schema, gating, tool/deps
  machinery, tenant isolation, and credential policy all stay exactly where
  they were.
- The persona fragment gives future consumers one place to keep "Noema"'s
  identity consistent without hardcoding it three times.
- The kernel is small enough to review in one PR and verify with an existing
  test suite — no new production surface, no new secret, no new network
  call.

### Costs and limitations

- `noema-core` is not yet on an index; every consumer needs the same
  `PYTHONPATH` accommodation this repository already carries for
  `noema_reviewer`, which is one more thing to keep in sync until it is
  published.
- The shared kernel's own CI enforcement (its 100% coverage/docstring gates)
  runs only via `packages/noema-core`'s local `pyproject.toml` today; it is
  not yet wired into a dedicated CI job, only exercised indirectly through
  `reviewer/`'s test run.
- `.github`'s Noema stays architecturally divergent (no PydanticAI)
  indefinitely under this decision; that gap is not solved here.
- The full CWL-MASTER-CONTEXT vision (`wardnet`'s AI-SOC calling a shared
  quarantine-sandbox judge) stays unfulfilled for an indefinite period under
  any of the three candidates — a scope/sequencing reality, not a flaw
  specific to this decision.

## Open risks for the owner

1. The "orchestrator client" half of this decision's original justification
   does not hold today — naruon is not gateway-routed until `naruon#1384`
   lands (it still calls `resolve_runtime_llm_provider()` directly). Confirm
   whether `#1384` landing is a prerequisite for extracting an
   orchestrator-client piece into `noema-core`, or whether that piece should
   wait until naruon's routing story is settled, to avoid designing an
   interface against a consumer that does not exist yet.
2. Package hosting/publishing mechanics are undecided: which repository owns
   `noema-core`'s source of truth long-term, PyPI-public vs. a private
   index, and how this repository's hash-pinned-requirements discipline
   extends to a second consuming repository (`naruon`) pulling a new
   cross-repository dependency.
3. This ADR leaves `.github`'s `noema_review_gate.py` permanently
   stdlib-only and outside noema-core in v1 — confirm the owner is fine with
   that staying architecturally divergent indefinitely, since migrating it
   is a rewrite this ADR rules out of scope, not a deferred extraction.
4. `naruon#1486` and `naruon#1384` both currently edit `noema_agent.py` and
   both add a colliding `docs/adr/0005-*.md` in that repository — resolve
   this merge-order hazard before naruon's noema-core adoption PR (PR #2)
   opens.
5. `wardnet`'s and `quarantine-sandbox-runtime`'s paths to the canonical
   "used by wardnet's AI SOC" vision are both blocked on infrastructure this
   decision cannot resolve (`ContextualWisdomLab/.github#1590`, and
   `wardnet`'s own not-yet-built artifact-analysis pipeline).
6. A separate agent was independently committing to
   `quarantine-sandbox-runtime`'s local unpushed branch during the
   investigation behind this ADR (2 commits, not yet pushed to origin) —
   unrelated to this decision, but worth confirming that work is tracked and
   lands deliberately.

## Next steps (not built by this PR)

- Land the identity/verdict-schema assertions grafted from Alternative C: a
  `noema-identity.schema.json` plus one test assertion each in this
  repository's `reviewer/` suite and in `ContextualWisdomLab/.github`'s
  `noema_review_gate` suite; amend `naruon#1486`'s description.
- `naruon`'s noema-core adoption PR (PR #2), after `naruon#1486`/`#1384`'s
  merge-order conflict resolves.
- Publish `noema-core` v0.1.0 to an index once this PR is reviewed and
  merged, then convert `reviewer/pyproject.toml`'s TODO comment into a real
  pinned dependency.
- Decide package hosting/publishing mechanics (risk 2) and, if an
  orchestrator-client piece is extracted later, sequence it against
  `naruon#1384` (risk 1).

## References

`ContextualWisdomLab/.github`. *CWL Master Context* (`docs/CWL-MASTER-CONTEXT.md`,
§3, §6) — the shared-noema-runtime design this ADR reconciles current code
against.

`ContextualWisdomLab/.github`. *Product Goal Directive* (`docs/product-goal-directive.md`,
§5) — the Shared Kernel / Anti-Corruption Layer guidance this decision
follows.

`ContextualWisdomLab/quarantine-sandbox-runtime`. `docs/adr/0007-bounded-command-execution-contract.md`
and `docs/product-technical-gap-baseline.md` — scope of the still-missing
Podman backend and transport, and the `.github#1590` dependency.

`ContextualWisdomLab/naruon`. `backend/services/noema_agent.py`
(`build_noema_agent`, `:465-550`) and open PRs `#1384`, `#1486`.
