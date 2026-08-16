# 시간별 contextual-orchestrator 제품 개발 운영

## 목적과 책임 경계

`.github/workflows/hourly-product-development.yml`은 **열린 PR 0개** 상태에서만 Noema의 다음 구매자 가시적 제품 증분을 제안합니다. OpenCode 1.17.13은 코딩 에이전트로만 남고, 모델 호출은 리뷰와 같은 `contextual-orchestrator` 게이트웨이 계약을 사용합니다. 리뷰, 승인, 병합, 릴리스, 배포는 수행하지 않습니다. 정확한 현재 HEAD의 리뷰, 필수 Checks, 미해결 스레드, 저장소 규칙, 병합 가능성 판단은 기존 `hourly-commercial-readiness`가 계속 담당합니다. 자동 개발은 후보 PR을 만드는 역할만 하며 최종 거버넌스 권한을 획득하지 않습니다.

워크플로는 매시 47분에 실행되고 수동 `dry_run=true`를 지원합니다. 드라이 런은 실제 PR 목록과 작업 계약만 확인하며 checkout, 모델 호출, 아티팩트 업로드, 브랜치 push, PR 생성을 하지 않습니다. GitHub 예약 실행은 정시 SLA가 아니므로 각 실행은 이전 상태를 믿지 않고 열린 PR 목록, 기본 브랜치 SHA, 필요한 자격 증명을 다시 확인합니다. 목록 조회 실패, 기존 PR 발견, 게이트웨이 부재는 모두 실패 폐쇄 사유입니다.

## 게이트웨이 계약과 시간 예산

공식 OpenCode 아카이브는 고정 버전과 SHA-256으로 검증합니다. 공급자는 `contextual-orchestrator` 한 곳만 허용합니다. `NOEMA_LLM_API_URL`은 `/v1`로 끝나는 HTTPS OpenAI 호환 주소여야 하고, `NOEMA_LLM_MODEL`은 보통 라우팅 별칭 `contextual-orchestrator`이며, `NOEMA_LLM_API_KEY`는 전용 게이트웨이 추론 토큰입니다. 상위 공급자 키(`NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_API_KEY_SUB`, `BYTEZ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`)는 오케스트레이터 KV에만 두고 Noema 런타임에 넣지 않습니다.

Noema는 모델 후보를 순서대로 시도하지 않습니다. 최소 비용과 최대 성능 선택은 오케스트레이터의 책임입니다. 직접 NVIDIA NIM, OpenAI, GitHub Models, OpenRouter, Bytez 호스트로 폴백하지 않습니다. 세션은 **한 번**이며 2,700초와 강제 종료 유예 30초를 적용합니다. 최초 설정과 최종 진단에 300초를 예약하면 총 3,030초이며, 3,300초인 55분 제안 job 예산 안에 270초의 명시적 여유를 남깁니다. 세션이 실패하면 다음 모델을 고르지 않고 안정적인 실패 진단으로 종료합니다.

공유 스크립트 `scripts/verify-orchestrator-gateway.mjs`가 리뷰와 동일한 사전 점검을 수행합니다. 인증 없이 `/healthz`가 `service=contextual-orchestrator`를 반환해야 하며, 알려진 직접 공급자 호스트는 거부합니다.

## 세 runner의 자격 증명 분리

첫 번째 제안 runner는 읽기 권한만 가지며 OpenCode subprocess에는 게이트웨이 추론 토큰만 전달합니다. GitHub 토큰, OIDC 값, Actions 런타임 토큰, 캐시 토큰, runner 명령 파일 채널을 제거합니다. 변경은 40개 파일과 500,000바이트로 제한하고 공백 오류, 심링크 모드 `120000`, gitlink 모드 `160000`을 원본 모드와 대상 모드 양쪽에서 검사합니다. 결과는 정확한 base SHA, 파일 수, 바이트 수, SHA-256에 결합된 binary full-index `proposal.patch`로 저장합니다.

두 번째 검증 runner는 게이트웨이 키와 Maintainer App 키가 없는 새 실행기입니다. `actions: read`, `contents: read`, `pull-requests: read`만 사용합니다. artifact ID, 이름, 만료 여부, 원본 workflow run, digest, patch 크기와 해시, base SHA를 독립적으로 확인합니다. 패치를 적용한 뒤 격리된 임시 홈과 제거된 GitHub·OIDC·Actions 채널에서 `npm run release:verify`를 실행하고 검증 전후 staged patch digest가 동일한지 확인합니다. 이 runner는 제안 코드를 실행하지만 게시 권한을 받지 않습니다.

`publish_product_increment`는 **세 번째 새 게시 runner**입니다. 제안 코드를 실행하지 않고 게이트웨이 키도 받지 않습니다. 기본 브랜치에서 신뢰된 PR 메타데이터 파서를 먼저 복사한 뒤 동일한 artifact ID와 digest-bound patch를 다시 검증합니다. 그 다음에만 full SHA로 고정된 액션이 짧은 수명의 Maintainer App 토큰을 발급합니다. 토큰 범위는 Noema 저장소의 metadata read, contents write, pull-request write로 제한됩니다. App 토큰 발급 후에도 열린 PR 큐와 실제 `main` SHA를 다시 읽고, 새 PR이나 base 전진이 있으면 원격 변경 전에 종료합니다.

## 신뢰할 수 없는 입력과 게시

모델이 만든 `PR_MESSAGE.md`는 신뢰할 수 없는 입력입니다. 파서는 심링크를 거부하고 `O_NOFOLLOW`, inode 안정성, 엄격한 UTF-8, 제어 문자와 양방향 제어 문자 제한, 제목 120바이트, 본문 20,000바이트를 적용합니다. 신뢰된 출력은 mode `0600`으로 기록하고 원본은 commit 전에 삭제합니다.

게시 단계는 실행별 고유 브랜치를 한 번 만들고 한 번 push한 뒤 PR을 한 번 생성합니다. PR 생성 실패 시 orphan 브랜치를 제거합니다. merge, release, publish, deploy 명령은 없습니다. 생성된 PR은 CodeRabbit, OpenCode review, Noema review, `ci`, `reviewer-ci`, Security Scan, branch protection, unresolved-thread 검사와 exact-head 병합 루프로 인계됩니다.

## 운영 위험과 롤백

게이트웨이 토큰은 OpenCode 프로세스 안에 존재하므로 명령 거부만으로 microVM egress 경계를 주장하지 않습니다. 지원 가능한 주장은 모델과 쓰기 가능한 저장소 토큰이 공존하지 않고, 신뢰할 수 없는 코드는 게시 자격 증명이 없는 runner에서만 실행되며, 게시 runner는 동일한 immutable patch를 실행 없이 재구성한다는 것입니다. OpenCode는 commit된 저장소 문맥을 오케스트레이터로 보낼 수 있으므로 기밀성, 데이터 보존, 지역, 계약 요건을 별도로 평가해야 합니다. 상위 공급자 선택, 허용 목록, 예산, 회로 차단, 감사는 오케스트레이터에 남습니다.

GitHub에는 다른 PR이 없을 때만 PR을 생성하는 원자적 트랜잭션이 없습니다. 최종 큐와 base 재검증, 고유 브랜치 이름, branch protection, exact-head 리뷰가 남은 경쟁 위험을 통제합니다. 모델 실행을 중지하려면 워크플로를 비활성화하거나 `NOEMA_LLM_API_KEY`를 폐기합니다. 게시만 중지하려면 Maintainer App 키를 폐기합니다. `main`에서 워크플로를 제거하는 것이 코드 롤백이며 기존 `/exchange`, 리뷰, 릴리스, 배포 경로에는 영향을 주지 않습니다.
