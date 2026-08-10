# External hourly scheduler evidence audit

**Status:** Proposed in pull request #97.  
**Canonical gap owner:** issue #96.  
**Architecture authority:** pull request #71 and the canonical PRD, TRD, Architecture, ADR, UML, ERD, traceability, security, test, operability, release, and licensing graph it maintains.

## Decision boundary

Noema has repository-owned hourly workflows, but the ChatGPT hourly task that invokes repository work is an external control plane. A scheduler prompt, chat response, task-editor screenshot, or generic provider error is not proof that the task is enabled, unique, scoped to Noema, work-conserving, or capable of resuming repository execution after failure.

This audit validates a bounded evidence record produced by the external task or an authorized operator. It does **not** call the scheduler provider, change task configuration, create GitHub review or merge authority, replace protected-branch checks, or prove release, deployment, production, or acquisition readiness.

The distinction is mandatory:

- **DESIGN_SUFFICIENT:** this evidence contract can be reviewed and tested on PR #97;
- **PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT:** remains fail-closed until this implementation is merged and authorized provider-side evidence proves one enabled hourly task, duplicate-task disablement, generic-error recovery, continued GitHub execution, and two clean exit sweeps or a concrete invocation-budget boundary.

## Compact external task prompt

Keep one enabled hourly task. Stable product, architecture, security, test, release, licensing, and acquisition detail stays in repository authority rather than being copied into the task prompt.

```text
Continuously improve ContextualWisdomLab/noema toward defensible commercial/acquisition readiness. Execute, do not merely report. Start from fresh protected-main, every open PR/issue, exact heads/live bases, stacks, reviews/threads/checks/security/rules/releases/docs and active-writer evidence; rebuild after every material action. Treat pending, absent, skipped, stale, predecessor, synthetic, model-only, rate-limited or status-only evidence as non-passing.

Write only Noema. Before every write refetch exact target/base/blob/ref/review/writer state; freeze only raced branches and rotate. Never force-push, self-approve, weaken gates, fabricate authority/secrets/evidence, or create repair/self-modifying branch-patching workflows.

Priority: merge only unchanged gate-clean authorized PRs; test-first fix current product/security/reliability/data/accessibility defects; remove Noema-owned blockers; resolve only addressed threads/duplicates; advance stacks/issues; run protected-main operational acceptance; repair canonical docs and executable contracts; convert gaps into source/tests/operators; then implement the highest-impact bounded buyer slice. After every action or defer, return to queue top.

Use RCA -> distinct remedies -> feasibility -> smallest safe action -> exact proof. Waiting blocks only that exact lane. Prompt repair, inventory, docs, one test, one commit, one PR update, one merge or one blocker is intermediate. After user redirection, perform at least two materially distinct repository actions when two safe lanes exist. Never end on test-only RED while safe GREEN exists. Documentation must hand off to the highest-priority safe non-documentation action.

On a generic scheduled-task error, refetch this task and GitHub, keep one enabled hourly task, simplify this prompt if needed, do not invent hidden error codes, and immediately resume repository execution. Stable detail belongs in AGENTS.md and canonical PRD/TRD/ARCHITECTURE/ADR/UML/ERD/TRACEABILITY/security/test/operability/licensing authority.

Before exit, perform two consecutive fresh whole-Noema sweeps. Any safe merge, mutation, test, closure, stack repair, operational proof, docs repair, release preparation or bounded product action resets the sweep count. End only on practical invocation-budget exhaustion or two clean sweeps proving every remaining lane non-actionable. Routine status remains internal.
```

A prompt edit earns zero completion credit. The same invocation must resume GitHub execution whenever a safe lane exists.

## Evidence input

The default input path is `external-scheduler-evidence.json`. Override it with the first positional argument or `NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH`.

```json
{
  "schema_version": 1,
  "scheduler_task_identity": "chatgpt-task:noema-hourly-primary",
  "prompt_sha256": "64 lowercase hexadecimal characters",
  "scheduled_at": "2026-08-10T11:00:00.000Z",
  "started_at": "2026-08-10T11:00:05.000Z",
  "repository_full_name": "ContextualWisdomLab/noema",
  "protected_main_sha": "40 lowercase hexadecimal characters",
  "generic_error_observed": true,
  "generic_error_recovery": {
    "task_refetched": true,
    "github_refetched": true,
    "hidden_error_code_invented": false,
    "repository_execution_resumed": true,
    "resumed_action_identity": "issue:96"
  },
  "safe_independent_lane_count": 2,
  "github_actions_performed": [
    {
      "action_identity": "issue:96",
      "action_kind": "issue_created",
      "target_repository": "ContextualWisdomLab/noema",
      "target_ref": "issues/96"
    },
    {
      "action_identity": "commit:0000000000000000000000000000000000000000",
      "action_kind": "source_commit",
      "target_repository": "ContextualWisdomLab/noema",
      "target_ref": "refs/heads/feat/example",
      "resulting_sha": "0000000000000000000000000000000000000000"
    }
  ],
  "deferred_lanes": [
    {
      "lane_identity": "pr:95@0000000000000000000000000000000000000000",
      "reason_code": "competing_writer_detected"
    }
  ],
  "termination_reason": "double_exit_sweep",
  "exit_sweep_count": 2,
  "remaining_non_actionable_reasons": [
    "independent_approval_unavailable"
  ]
}
```

When no generic provider error was observed, set `generic_error_observed` to `false` and omit `generic_error_recovery`. When the practical invocation budget is genuinely exhausted, use `termination_reason: "invocation_budget_exhausted"`, retain the completed `exit_sweep_count`, and include a concrete bounded `budget_exhaustion_detail`.

Do not retain access tokens, private keys, passwords, authorization headers, cookies, hidden model reasoning, vulnerability exploit details, or unnecessary personal data. The evaluator recursively rejects field names representing those classes.

## Operator command

```bash
npm run operations:external-scheduler-evidence -- /secure/path/external-scheduler-evidence.json
```

The default report path is `artifacts/operations/external-scheduler-evidence-audit.json`. Override it with `NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH`.

The command exits non-zero on collection or validation failure. It opens the input read-only without following a final symlink where the platform supports `O_NOFOLLOW`, requires one regular file from 1 through 262,144 bytes, decodes UTF-8 fatally, evaluates allowlisted identity and state contracts, writes a bounded report through a private temporary directory and atomic rename, and never copies the raw evidence into the report.

## Enforced contracts

The evaluator fails closed unless:

1. schema version, exact repository, prompt digest, protected-main SHA, scheduler identity, and canonical UTC timestamps are valid;
2. `started_at` is not earlier than `scheduled_at`;
3. generic-error evidence proves task and GitHub refetch, no invented hidden error code, repository execution resumption, and one concrete resumed action identity;
4. every GitHub action is bound to Noema, uses bounded exact identities, and has an allowed snake_case action kind;
5. a run with two or more safe independent lanes retains at least two actions with materially distinct action kinds;
6. duplicate action identities are rejected;
7. deferred lanes retain exact identities such as `pr:<number>@<head-sha>` and bounded reason codes;
8. a normal exit retains exactly two fresh exit sweeps, while a budget exit retains a concrete bounded reason;
9. remaining non-actionable reasons use bounded snake_case codes; and
10. no forbidden secret or hidden-reasoning field name occurs at any nesting level.

## Evidence interpretation

`PASS` means only that the supplied record satisfies this reviewed schema and policy. It does not establish that the provider supplied the record honestly. Provider task identity, enabled state, hourly schedule and timezone, owner, prompt digest, duplicate-task disablement, execution receipt identity, and the resulting GitHub mutations must be retained in access-controlled operational evidence and reviewed against live provider and GitHub state.

GitHub checks, commit statuses, formal reviews, central security scans, protected-branch rules, release attestations, deployment receipts, production acceptance, and acquisition evidence remain separate authorities. No scheduler record may substitute for them.

## Current documentation sufficiency

The canonical documentation audit on PR #71 remains the only whole-product sufficiency authority. For the conversation decisions addressed here:

- PRD/TRD/Architecture/ADR/UML/ERD coverage is design-sufficient in review because the external scheduler is an actor/control-plane boundary already represented by the canonical execution, fail-closed evidence, writer-safety, and recovery decisions;
- a new architecture decision record would duplicate existing ADR authority, so this slice adds an executable operational contract instead;
- operational sufficiency remains false because provider-side task configuration and real execution receipts are not observable from this repository alone; and
- issue #96 tracks that external evidence gap, while PR #97 implements only the repository-side validator and operator interface.

## References

Bray, T. (2017). *The JavaScript Object Notation (JSON) data interchange format* (RFC 8259; STD 90). Internet Engineering Task Force. https://doi.org/10.17487/RFC8259

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
