# 시간별 contextual-orchestrator 제품 개발 운영

## 목적과 책임 경계

`.github/workflows/hourly-product-development.yml`은 Noema의 다음 구매자 가시적 제품 증분을 제안합니다. 기존 PR의 리뷰나 Checks가 대기 중이라는 이유만으로 저장소 전체 개발을 멈추지는 않습니다. 열린 PR은 각각 독립된 거버넌스 lane으로 남고, 새 제안은 게시 직전과 PR 생성 직후에 **모든 기존 열린 PR의 변경 경로와 겹치지 않는지** 확인합니다. 경로가 하나라도 겹치거나 열린 PR의 변경 파일 목록을 완전하게 읽을 수 없거나 `main`이 제안 base에서 전진하면 실패 폐쇄합니다. 동시에 활성화되는 product-development workflow는 하나뿐입니다.

OpenCode 1.17.13은 코딩 에이전트로만 남고, 모델 호출은 리뷰와 같은 `contextual-orchestrator` 게이트웨이 계약을 사용합니다. 리뷰, 승인, 병합, 릴리스, 배포는 수행하지 않습니다. 정확한 현재 HEAD의 리뷰, 필수 Checks, 미해결 스레드, 저장소 규칙, 병합 가능성 판단은 기존 `hourly-commercial-readiness`가 계속 담당합니다. 자동 개발은 겹치지 않는 후보 PR을 만드는 역할만 하며 최종 거버넌스 권한을 획득하지 않습니다.

조직 중앙 commercial-readiness loop가 저장소별 열린 PR과 활성 writer를 확인한 뒤 이 워크플로를 dispatch합니다. 남아 있는 PR 수는 새 작업의 전역 정지 조건이 아닙니다. commercial-readiness 실행 자체에 operational error가 없어야 하며, 이미 product-development run이 pending·queued·running 상태이면 새 실행을 만들지 않습니다. 저장소 안에는 별도 schedule이 없습니다. 수동 `dry_run=true`는 실제 PR inventory와 작업 계약만 확인하며 checkout, 모델 호출, 아티팩트 업로드, 브랜치 push, PR 생성을 하지 않습니다. 각 실행은 이전 상태를 믿지 않고 열린 PR inventory, 기본 브랜치 SHA, 필요한 자격 증명을 다시 확인합니다. 목록 조회 실패와 게이트웨이·게시 자격 증명 부재는 모두 실패 폐쇄 사유입니다.

## 게이트웨이 계약과 실행 종료 권한

공식 OpenCode 아카이브는 고정 버전과 SHA-256으로 검증합니다. 공급자는 `contextual-orchestrator` 한 곳만 허용합니다. `NOEMA_LLM_API_URL`은 `/v1`로 끝나는 HTTPS OpenAI 호환 주소여야 하고, `NOEMA_LLM_MODEL`은 보통 라우팅 별칭 `contextual-orchestrator`이며, `NOEMA_LLM_API_KEY`는 전용 게이트웨이 추론 토큰입니다. 상위 공급자 키(`NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_API_KEY_SUB`, `BYTEZ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`)는 오케스트레이터 KV에만 두고 Noema 런타임에 넣지 않습니다.

Noema는 모델 후보를 순서대로 시도하지 않습니다. 최소 비용과 최대 성능 선택은 오케스트레이터의 책임입니다. 직접 NVIDIA NIM, OpenAI, GitHub Models, OpenRouter, Bytez 호스트로 폴백하지 않습니다. OpenCode 세션에는 Noema가 만든 추론·reasoning·stream·tool-call 경과시간 cutoff를 두지 않습니다. GNU `timeout`으로 세션을 2,700초에 종료하던 경로와 강제 종료 유예 설정은 제거했습니다. `propose_product_increment`의 GitHub Actions `timeout-minutes: 55`는 runner/job 전체에 대한 플랫폼 관리 한계이며 모델 또는 provider timeout이 아닙니다. 따라서 정상 provider 종료와 사용자 취소, GitHub의 administrative job timeout을 같은 모델 실패로 해석하거나 다음 모델 선택의 근거로 사용하지 않습니다. 세션이 자체 오류로 끝나더라도 Noema에서 다음 모델을 고르지 않습니다.

공유 스크립트 `scripts/verify-orchestrator-gateway.mjs`가 리뷰와 동일한 사전 점검을 수행합니다. 인증 없이 `/healthz`가 `service=contextual-orchestrator`를 반환해야 하며, 알려진 직접 공급자 호스트는 거부합니다. 같은 계약은 `contracts/orchestrator-gateway.json`으로 공개되며 `ContextualWisdomLab/naruon`의 판단·결정 에이전트도 1급 소비자입니다. naruon 배선은 이 저장소가 아니라 별도 PR에서 합니다.

## 세 runner의 자격 증명 분리

첫 번째 제안 runner는 읽기 권한만 가지며 OpenCode subprocess에는 게이트웨이 추론 토큰만 전달합니다. GitHub 토큰, OIDC 값, Actions 런타임 토큰, 캐시 토큰, runner 명령 파일 채널을 제거합니다. 변경은 40개 파일과 500,000바이트로 제한하고 공백 오류, 심링크 모드 `120000`, gitlink 모드 `160000`을 원본 모드와 대상 모드 양쪽에서 검사합니다. 결과는 정확한 base SHA, 파일 수, 바이트 수, SHA-256에 결합된 binary full-index `proposal.patch`로 저장합니다. 제안 프롬프트는 열린 PR의 대기 상태를 전역 중단 사유로 취급하지 않되, 기존 활성 PR과 같은 작업을 의도적으로 중복하지 말 것을 요구합니다. 실제 비중첩성 판정은 모델의 주장에 의존하지 않고 게시 runner가 수행합니다.

두 번째 검증 runner는 게이트웨이 키와 Maintainer App 키가 없는 새 실행기입니다. `actions: read`, `contents: read`, `pull-requests: read`만 사용합니다. artifact ID, 이름, 만료 여부, 원본 workflow run, digest, patch 크기와 해시, base SHA를 독립적으로 확인합니다. 패치를 적용한 뒤 격리된 임시 홈과 제거된 GitHub·OIDC·Actions 채널에서 `npm run release:verify`를 실행하고 검증 전후 staged patch digest가 동일한지 확인합니다. 이 runner는 제안 코드를 실행하지만 게시 권한을 받지 않습니다.

`publish_product_increment`는 **세 번째 새 게시 runner**입니다. 제안 코드를 실행하지 않고 게이트웨이 키도 받지 않습니다. 기본 브랜치에서 신뢰된 PR 메타데이터 파서를 먼저 보존한 뒤 동일한 artifact ID와 digest-bound patch를 다시 검증합니다. 그 다음에만 full SHA로 고정된 액션이 짧은 수명의 Maintainer App 토큰을 발급합니다. 토큰 범위는 Noema 저장소의 metadata read, contents write, pull-request write로 제한됩니다.

App 토큰 발급 후 게시 runner는 proposal의 staged 경로를 NUL 구분으로 읽고 base64로 정규화한 뒤, GitHub의 완전한 open-PR inventory와 각 PR의 paginated changed-file inventory를 다시 읽습니다. 각 PR의 `changed_files` 수와 실제 조회 파일 수가 일치해야 하고, GitHub API가 지원하는 3,000-file 상한을 넘는 PR은 안전하게 비교할 수 없으므로 실패 폐쇄합니다. proposal 경로와 기존 PR 경로의 교집합이 비어 있어야 하며 `main` SHA도 proposal base와 같아야 원격 브랜치를 만들 수 있습니다. PR을 생성한 뒤에는 방금 생성한 PR을 비교 대상에서 제외하고 나머지 열린 PR 전부에 대해 같은 경로 격리를 다시 검사합니다. 그 사이 새 충돌 PR이 생겼다면 생성한 PR과 전용 브랜치를 정리하고 종료합니다.

## 신뢰할 수 없는 입력과 게시

모델이 만든 `PR_MESSAGE.md`는 신뢰할 수 없는 입력입니다. 파서는 심링크를 거부하고 `O_NOFOLLOW`, inode 안정성, 엄격한 UTF-8, 제어 문자와 양방향 제어 문자 제한, 제목 120바이트, 본문 20,000바이트를 적용합니다. 신뢰된 출력은 mode `0600`으로 기록하고 원본은 commit 전에 삭제합니다.

게시 단계는 실행별 고유 브랜치를 한 번 만들고 한 번 push한 뒤 PR을 한 번 생성합니다. PR 생성 실패 시 orphan 브랜치를 제거합니다. 생성한 PR 번호·head SHA·base SHA와 publication marker를 다시 확인하며, 생성 후 queue inventory에 해당 PR이 정확히 한 번 존재해야 합니다. 다른 열린 PR의 존재 자체는 오류가 아니지만 변경 경로 겹침은 오류입니다. merge, release, publish, deploy 명령은 없습니다. 생성된 PR은 CodeRabbit, OpenCode review, Noema review, `ci`, `reviewer-ci`, Security Scan, branch protection, unresolved-thread 검사와 exact-head 병합 루프로 인계됩니다.

## 운영 위험과 롤백

게이트웨이 토큰은 OpenCode 프로세스 안에 존재하므로 명령 거부만으로 microVM egress 경계를 주장하지 않습니다. 지원 가능한 주장은 모델과 쓰기 가능한 저장소 토큰이 공존하지 않고, 신뢰할 수 없는 코드는 게시 자격 증명이 없는 runner에서만 실행되며, 게시 runner는 동일한 immutable patch를 실행 없이 재구성한다는 것입니다. OpenCode는 commit된 저장소 문맥을 오케스트레이터로 보낼 수 있으므로 기밀성, 데이터 보존, 지역, 계약 요건을 별도로 평가해야 합니다. 상위 공급자 선택, 허용 목록, 예산, 회로 차단, 감사는 오케스트레이터에 남습니다.

GitHub에는 "열린 PR들과 경로가 겹치지 않을 때만 새 PR을 생성"하는 원자적 트랜잭션이 없습니다. 게시 직전과 생성 직후의 완전한 경로 inventory 재검증, 정확한 base SHA, 고유 브랜치 이름, force-with-lease, branch protection, exact-head 리뷰가 경쟁 위험을 줄입니다. 다만 서로 다른 파일이 같은 invariant를 깨는 의미적 충돌은 경로 비교만으로 잡을 수 없습니다. 그래서 새 PR도 일반 review→repair→exact-head Checks 절차를 그대로 거치며, 경로 격리를 병합 안전성의 대체물로 사용하지 않습니다. 모델 실행을 중지하려면 워크플로를 비활성화하거나 `NOEMA_LLM_API_KEY`를 폐기합니다. 게시만 중지하려면 Maintainer App 키를 폐기합니다. `main`에서 워크플로를 제거하는 것이 코드 롤백이며 기존 `/exchange`, 리뷰, 릴리스, 배포 경로에는 영향을 주지 않습니다.
