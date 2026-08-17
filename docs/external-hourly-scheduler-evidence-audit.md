# 외부 시간별 스케줄러 증거 감사

**상태:** Pull Request #97에서 제안됨.  
**Canonical gap owner:** issue #96.  
**Architecture authority:** pull request #71 및 그 PR이 유지하는 canonical PRD, TRD, Architecture, ADR, UML, ERD, traceability, security, test, operability, release, licensing graph.

## 의사결정 경계

Noema에는 저장소가 소유하는 시간별 workflow가 있지만, 저장소 작업을 호출하는 ChatGPT 시간별 task는 외부 control plane입니다. scheduler prompt, chat response, task-editor screenshot 또는 generic provider error만으로는 task가 활성화되어 있는지, 유일한지, Noema로 범위가 제한되는지, work-conserving한지, 실패 뒤 같은 invocation에서 저장소 실행을 재개할 수 있는지 증명할 수 없습니다.

이 감사기는 외부 task 또는 권한 있는 운영자가 생성한 bounded evidence record를 검증합니다. scheduler provider를 호출하거나 task 설정을 바꾸지 않으며, GitHub review·merge authority를 만들지 않고, protected-branch check를 대체하지 않으며, release·deployment·production·acquisition readiness를 증명하지 않습니다.

다음 구분은 필수입니다.

- **DESIGN_SUFFICIENT:** 이 evidence contract는 PR #97에서 검토·테스트할 수 있습니다.
- **PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT:** 이 구현이 병합되고, 권한 있는 provider-side evidence가 활성화된 시간별 task 하나, 중복 task 비활성화, generic-error recovery, 계속된 GitHub execution, 그리고 두 번의 clean exit sweep 또는 구체적인 invocation-budget boundary를 증명할 때까지 fail-closed입니다.

## 압축된 외부 task prompt

활성화된 시간별 task는 하나만 유지합니다. 안정적인 product, architecture, security, test, release, licensing, acquisition 세부사항은 task prompt에 복제하지 않고 repository authority에 둡니다.

```text
Continuously improve ContextualWisdomLab/noema toward defensible commercial/acquisition readiness. Execute, do not merely report. Start from fresh protected-main, every open PR/issue, exact heads/live bases, stacks, reviews/threads/checks/security/rules/releases/docs and active-writer evidence; rebuild after every material action. Treat pending, absent, skipped, stale, predecessor, synthetic, model-only, rate-limited or status-only evidence as non-passing.

Write only Noema. Before every write refetch exact target/base/blob/ref/review/writer state; freeze only raced branches and rotate. Never force-push, self-approve, weaken gates, fabricate authority/secrets/evidence, or create repair/self-modifying branch-patching workflows.

Priority: merge only unchanged gate-clean authorized PRs; test-first fix current product/security/reliability/data/accessibility defects; remove Noema-owned blockers; resolve only addressed threads/duplicates; advance stacks/issues; run protected-main operational acceptance; repair canonical docs and executable contracts; convert gaps into source/tests/operators; then implement the highest-impact bounded buyer slice. After every action or defer, return to queue top.

Use RCA -> distinct remedies -> feasibility -> smallest safe action -> exact proof. Waiting blocks only that exact lane. Prompt repair, inventory, docs, one test, one commit, one PR update, one merge or one blocker is intermediate. After user redirection, perform at least two materially distinct repository actions when two safe lanes exist. Never end on test-only RED while safe GREEN exists. Documentation must hand off to the highest-priority safe non-documentation action.

On a generic scheduled-task error, refetch this task and GitHub, keep one enabled hourly task, simplify this prompt if needed, do not invent hidden error codes, and immediately resume repository execution. Stable detail belongs in AGENTS.md and canonical PRD/TRD/ARCHITECTURE/ADR/UML/ERD/TRACEABILITY/security/test/operability/licensing authority.

Before exit, perform two consecutive fresh whole-Noema sweeps. Any safe merge, mutation, test, closure, stack repair, operational proof, docs repair, release preparation or bounded product action resets the sweep count. End only on practical invocation-budget exhaustion or two clean sweeps proving every remaining lane non-actionable. Routine status remains internal.
```

prompt 변경 자체는 완료로 계산하지 않습니다. 같은 invocation에서 안전한 lane이 있으면 GitHub execution을 즉시 재개해야 합니다.

## Evidence 입력

기본 입력 경로는 `external-scheduler-evidence.json`입니다. 첫 번째 positional argument 또는 `NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH`로 재정의할 수 있습니다.

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

generic provider error가 관측되지 않았다면 `generic_error_observed`를 `false`로 두고 `generic_error_recovery`를 생략합니다. practical invocation budget가 실제로 소진됐다면 `termination_reason: "invocation_budget_exhausted"`를 사용하고 완료된 `exit_sweep_count`를 보존하며 구체적이고 bounded한 `budget_exhaustion_detail`을 포함합니다.

access token, private key, password, authorization header, cookie, hidden model reasoning, vulnerability exploit detail 또는 불필요한 personal data를 보존하지 않습니다. evaluator는 이러한 class를 나타내는 field name을 재귀적으로 거부합니다.

## 운영자 명령

```bash
npm run operations:external-scheduler-evidence -- /secure/path/external-scheduler-evidence.json
```

기본 report 경로는 `artifacts/operations/external-scheduler-evidence-audit.json`입니다. `NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH`로 재정의할 수 있습니다.

명령은 collection 또는 validation 실패 시 non-zero로 종료합니다. 입력은 read-only로 열며 플랫폼이 `O_NOFOLLOW`를 지원하면 final symlink를 따르지 않습니다. 1~262,144 byte의 regular file 하나만 허용하고, UTF-8을 fatal mode로 decode하며, allowlisted identity·state contract를 평가합니다. report는 private temporary directory와 atomic rename을 통해 bounded하게 기록하고 raw evidence 자체는 report에 복사하지 않습니다.

## 강제되는 계약

다음 조건을 모두 만족하지 않으면 evaluator는 fail-closed합니다.

1. schema version, exact repository, prompt digest, protected-main SHA, scheduler identity, canonical UTC timestamp가 유효해야 합니다.
2. `started_at`은 `scheduled_at`보다 이르면 안 됩니다.
3. generic-error evidence는 task·GitHub refetch, invented hidden error code 부재, repository execution 재개, 그리고 실제 `github_actions_performed`에 존재하는 concrete resumed action identity를 증명해야 합니다.
4. 모든 GitHub action은 Noema에 bound되고 bounded exact identity와 허용된 snake_case action kind를 사용해야 합니다.
5. safe independent lane이 둘 이상인 run은 최소 두 action과 materially distinct action kind를 보존해야 합니다.
6. duplicate action identity는 거부됩니다.
7. deferred lane은 `pr:<number>@<head-sha>` 같은 exact identity와 bounded reason code를 보존해야 합니다.
8. 정상 종료는 정확히 두 번의 fresh exit sweep을 보존해야 하고, budget exit는 구체적이고 bounded한 이유를 보존해야 합니다.
9. remaining non-actionable reason은 bounded snake_case code를 사용해야 합니다.
10. 어떤 nesting level에도 금지된 secret, credential 또는 hidden-reasoning field name이 없어야 합니다.
11. decoded JSON object key가 중복되거나 입력 UTF-8이 비정상이면 파싱 전에 거부해야 합니다.
12. validation이 실패하면 untrusted evidence identity 값은 retained report에서 제거하고 파생된 check·failure code만 보존해야 합니다.

## Evidence 해석

`PASS`는 공급된 record가 이 reviewed schema와 policy를 만족한다는 뜻만 가집니다. provider가 record를 정직하게 공급했다는 사실까지 보장하지 않습니다. provider task identity, enabled state, hourly schedule·timezone, owner, prompt digest, duplicate-task disablement, execution receipt identity 및 실제 GitHub mutation은 access-controlled operational evidence로 별도 보존하고 live provider·GitHub state와 대조 검토해야 합니다.

GitHub check, commit status, formal review, central security scan, protected-branch rule, release attestation, deployment receipt, production acceptance 및 acquisition evidence는 별도 authority입니다. 어떤 scheduler record도 이를 대체할 수 없습니다.

## 현재 문서 충분성

PR #71의 canonical documentation audit가 whole-product sufficiency에 대한 유일한 authority입니다. 여기서 다루는 conversation decision에 대해서는 다음과 같이 판정합니다.

- PRD/TRD/Architecture/ADR/UML/ERD coverage는 canonical execution, fail-closed evidence, writer-safety, recovery decision에 external scheduler actor/control-plane boundary가 이미 포함되어 있으므로 review 단계에서 design-sufficient합니다.
- scheduler 전용 신규 ADR은 기존 ADR authority를 중복하므로 이 slice에서는 executable operational contract를 추가하는 것이 적절합니다.
- provider-side task configuration과 실제 execution receipt는 이 repository만으로 관측할 수 없으므로 operational sufficiency는 계속 false입니다.
- issue #96은 해당 external evidence gap을 추적하며, PR #97은 repository-side validator와 operator interface만 구현합니다.

## 참고문헌

Bray, T. (2017). *The JavaScript Object Notation (JSON) data interchange format* (RFC 8259; STD 90). Internet Engineering Task Force. https://doi.org/10.17487/RFC8259

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
