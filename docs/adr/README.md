# Noema Architecture Decision Records

ADR은 **왜 이 구조를 선택했는지**를 기록합니다. 구현 상태와 operational evidence는 별도입니다. `Accepted`는 protected-main에서 이미 안정적으로 적용된 결정, `Proposed`는 active PR/issue에서 검토 중인 결정입니다. PR branch에 코드가 있어도 protected merge 전에는 repository-wide acceptance를 주장하지 않습니다.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](./0001-evidence-authority-separation.md) | Accepted | check/status/review/scanner/model evidence와 merge/release/deployment authority를 분리한다. |
| [0002](./0002-work-conserving-autonomy.md) | Proposed | autonomous loop는 waiting/blocker 하나에서 끝나지 않고 executable queue를 계속 소비한다. |
| [0003](./0003-exact-revision-and-live-base.md) | Proposed | immutable PR head와 independently resolved live base tip을 별도 authority로 결합한다. |
| [0004](./0004-safe-repository-writes.md) | Proposed | 정상 CAS/trusted-checkout write를 사용하고 self-modifying repair automation을 금지한다. |
| [0005](./0005-fail-closed-untrusted-materialization.md) | Accepted | untrusted source, artifact, model output이 trusted evidence로 바뀌는 경계에서 exact identity를 검증하고 fail closed한다. |
| [0006](./0006-protected-main-operational-acceptance.md) | Accepted | PR 검증, protected-main 운영 검증, release, deployment, commercial evidence를 별도 단계로 유지한다. |
| [0007](./0007-package-manager-reproducibility.md) | Proposed | package/lockfile evidence를 deterministic Node/npm identity와 exact base/source에 결합한다. |
| [0008](./0008-atomic-proposal-publication.md) | Proposed | autonomous proposal branch와 PR을 server-observed exact identity에 결합된 conditional transaction으로 게시한다. |
| [0009](./0009-central-local-automation-ownership.md) | Accepted | CWL 중앙 reusable policy와 Noema-local runtime/orchestration의 소유권을 분리한다. |

## ADR lifecycle

```text
Proposed → Accepted → Superseded
              ↘ Deprecated
```

- 결정이 변경되면 기존 ADR을 삭제하지 않고 새 ADR에서 supersede합니다.
- transient run ID, current PR SHA, pending check는 ADR의 timeless fact로 기록하지 않습니다.
- 구현 proof는 source/tests/PR, 운영 proof는 governance/production evidence로 분리합니다.
- material security/architecture choice는 `docs/TRACEABILITY.md`에서 requirement와 test/evidence로 연결합니다.

## Related decision sources

기존의 상세 설계 근거와 primary-source bibliography는 다음 문서도 함께 사용합니다.

- `ARCHITECTURE.md`
- `docs/doctoring/architecture-trust-boundaries.md`
- `docs/doctoring/package-manager-reproducibility.md` (active PR #78)
- `docs/doctoring/atomic-product-publisher-lease.md` (active PR #80)
- `docs/doctoring/realistic-remediation-escalation.md` (active PR #80)
