# Doctoring: 인수 검증용 Git 작업 트리 바인딩

## 결정

Noema의 인수 검토용 exact-checkout 사전 검증은 Git이 실제로 사용하는 작업 트리를, 보존 증거를 감사하는 정확한 체크아웃 디렉터리에 고정해야 합니다. 다른 파일시스템 트리를 대상으로 한 깨끗한 Git 비교는 감사 대상 체크아웃이 주장된 커밋과 일치한다는 증거가 아닙니다.

따라서 사전 검증은 모든 제한된 Git 읽기에서 `GIT_WORK_TREE`를 명령의 해석된 `cwd`로 설정합니다. 이 통제는 이미 적용된 시스템·전역 설정, hooks, fsmonitor, untracked cache, replacement objects, lazy fetch, terminal prompts, 안전하지 않은 index hints, exact-HEAD 이동 차단에 추가됩니다.

## 위협 모델과 테스트 우선 증거

Git은 저장소 로컬 설정의 `core.worktree`가 `.git` 디렉터리가 있는 경로와 다른 위치를 가리키는 것을 허용합니다. 작업 트리를 명시적으로 바인딩하지 않으면 `cwd=/audited/repository`에서 실행한 명령도 공유 index와 commit을 `/different/path`와 비교할 수 있습니다. 공격자 또는 우발적인 로컬 설정은 `/different/path`를 깨끗하게 유지하면서 인수 검증 프로세스의 실제 `cwd` 아래 추적 바이트를 변경할 수 있습니다. 이 경우 증거 판독기는 한 작업 트리를 검사하지만 Git은 다른 작업 트리를 인증하게 됩니다.

회귀 테스트는 실제 저장소로 이 경계를 구성합니다. `tracked.txt`를 commit하고 별도의 깨끗한 decoy tree를 만든 다음, 저장소 로컬 `core.worktree`가 decoy를 가리키도록 설정하고 감사 대상 저장소 디렉터리의 추적 파일을 변조합니다. production 변경 전에는 exact-checkout verifier가 성공을 반환하여 의도한 RED 테스트가 만들어졌습니다. `GIT_WORK_TREE=<resolved audited cwd>`를 적용하면 Git의 추적 바이트 비교가 인수 검증 entrypoint가 사용하는 동일한 파일시스템 트리로 강제되므로 변조가 거부됩니다.

이 통제는 `GIT_WORK_TREE`가 Git executable, object database, 또는 bootstrap JavaScript 자체를 인증한다고 주장하지 않습니다. 이러한 구성 요소는 문서화된 trusted checkout/runtime boundary와 독립적인 protected-branch, CI, release, provenance 통제의 일부로 남습니다.

## 1차 출처에 따른 근거

Git 2.54.0 문서는 `core.worktree`를 작업 트리의 root를 설정하는 구성으로 정의하고, `/path/to/.git/config`에 저장된 값이 `/different/path`를 가리킬 수 있으며 `/path/to`에서 실행한 Git 명령도 계속 `/different/path`를 사용한다고 명시적으로 경고합니다. 같은 문서는 `GIT_WORK_TREE` 또는 `--work-tree`가 `core.worktree`를 재정의한다고 설명합니다. 현재 `git` 명령 문서도 `--work-tree`와 `GIT_WORK_TREE`를 작업 트리 경로의 통제 수단으로 정의합니다.

Noema는 모든 Git subprocess에 의도적으로 재구성한 제한 환경을 이미 전달하므로 environment 형식을 사용합니다. 이 환경을 `resolve(cwd)`에 바인딩하면 보안 속성이 명시적이 되고, ambient worktree 설정을 수용하지 않은 채 exact-commit resolution, index inspection, tracked-state comparison에 일관되게 적용됩니다.

## 인수 검증 불변 조건

인수 검증 사전 절차가 정확한 소스 식별자를 승인하려면 다음 조건이 모두 계속 참이어야 합니다.

- Git object resolution은 local-only 및 exact 상태를 유지합니다.
- Git이 실제로 사용하는 작업 트리는 인수 검증 명령의 해석된 `cwd`와 같습니다.
- tracked comparison 전후에 `skip-worktree`와 `assume-unchanged`가 없습니다.
- tracked tree에는 exact commit과 비교한 staged, unstaged 또는 deleted 차이가 없습니다.
- 검증 중 exact HEAD가 이동하지 않습니다.
- 보존 증거를 읽은 뒤 전체 사전 검증을 다시 수행합니다.

어느 조건이라도 실패하면 fail-closed evidence-integrity failure입니다. 이를 review approval, release acceptance 또는 acquisition readiness로 변환할 수 없습니다.

## APA 7판 참고문헌

Git Project. (2026). *Git documentation: git*. https://git-scm.com/docs/git

Git Project. (2026). *Git documentation: git-config (version 2.54.0)*. https://git-scm.com/docs/git-config/2.54.0
