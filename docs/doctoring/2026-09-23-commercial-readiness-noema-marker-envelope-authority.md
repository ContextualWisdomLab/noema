# Noema marker-envelope authority

Status: Proposed

## Problem

`parseNoemaReviewDecision()`은 canonical `noema-review-gate` 정규식에 일치한 marker 개수만 세고 있었습니다. 따라서 trusted exact-head review body에 canonical `approve` marker 하나와 대문자 decision 또는 추가 attribute를 가진 두 번째 marker-like HTML comment가 함께 있어도 두 번째 envelope는 보이지 않았습니다. Canonical match 수는 1로 남아 이전 구현이 `approve` authority를 부여할 수 있었습니다.

이 동작은 “review body가 하나의 정확한 Noema gate serialization만 운반한다”는 cardinality 경계보다 약합니다. Marker-like envelope가 추가로 존재하면 producer가 어떤 envelope를 authoritative하게 의도했는지 parser가 추정해서는 안 됩니다.

Fresh independent review of `7f29b3eb6ae1c0d25c3dfab48b42efb9aaab18e1`에서 후속 false-PASS가 확인됐습니다. Canonical marker parser는 대소문자를 엄격히 구분했지만 marker-like envelope detector도 같은 방식으로 case-sensitive여서, canonical `approve`와 `<!-- NOEMA-REVIEW-GATE ... decision=blocked -->`가 함께 있는 body에서는 두 번째 envelope가 cardinality에 포함되지 않았습니다. 즉 operator contract는 대소문자 변형 envelope를 거부한다고 명시했지만 production detector가 그 변형을 관측하지 못했습니다.

## Constraints

- GitHub Pull Request Reviews의 chronological list order, exact `review.commit_id`, platform review `state` authority를 그대로 보존합니다.
- `Reviewer credential: noema-github-app`이 없는 canonical gate successor가 prior approval을 revoke하는 기존 계약을 약화하지 않습니다.
- Credential과 marker-like envelope가 모두 없는 ordinary exact-head review comment는 prior Noema gate decision을 바꾸지 않습니다.
- Canonical marker grammar 자체를 case-insensitive하게 만들지 않습니다. 넓어지는 것은 non-authoritative envelope 관측뿐이며 authority-bearing marker는 계속 exact serialization만 허용합니다.
- Noema-owned marker serialization만 다룹니다. GitHub review identity/state, LLM routing, quarantine/security, outbound, release/deployment authority를 가져오지 않습니다.

## Alternatives

1. Canonical regex match 수만 계속 사용: 기각. Canonical marker와 malformed marker-like envelope의 혼재를 감지하지 못합니다.
2. Marker grammar를 느슨하게 만들어 모든 변형을 decision token으로 해석: 기각. Noncanonical serialization을 authority-bearing token으로 승격할 위험이 있습니다.
3. Marker-like envelope를 별도로 관측하고, 정확히 하나의 envelope가 존재하며 그 envelope 전체가 canonical regex match와 byte-for-byte 같을 때만 authority를 인정: 선택.
4. Envelope detector와 canonical marker parser를 모두 case-insensitive하게 전환: 기각. 대소문자 변형을 단순 ambiguity evidence가 아니라 valid authority token으로 승격해 기존 exact-serialization 경계를 약화합니다.

## Decision and implementation

RED `598427fb88bc88aac3de52498f0ab39602c8412b`은 canonical approval marker와 함께 (a) `decision=BLOCKED` 대소문자 변형, (b) `source=duplicate` 추가 attribute를 가진 marker-like envelope가 존재하는 두 hostile body를 추가하고 둘 다 `null`을 요구합니다. Predecessor semantics에서는 두 경우 모두 canonical match 하나만 보이므로 `approve`가 반환됩니다.

Production repair `c5ea67c5d2fd44c91d1849afc73c8ed974b15790`은 canonical marker regex와 별도로 `noema-review-gate` marker-like HTML envelope를 수집합니다. Authority를 부여하려면 marker-like envelope가 정확히 하나이고 canonical marker도 정확히 하나이며, 두 전체 match가 동일하고 marker head가 expected exact head와 같아야 합니다. 추가·변형 envelope가 하나라도 있으면 current decision을 `null`로 유지합니다. RED→repair production diff는 `scripts/hourly-commercial-readiness.mjs` 한 파일 `+15/-3`입니다.

Operator-guide RED `bb48c06e3f2d11a7241d20ab63ffd123111a9c17`은 review/head-binding section이 marker-like envelope ambiguity를 명시하도록 먼저 요구합니다. Guide repair `49d10aeb38a9885192ca810dbef5939749547507`은 canonical marker 하나가 있어도 다른 malformed marker-like envelope가 공존하면 authoritative Noema decision으로 인정하지 않는다고 기록합니다.

Fresh current finding의 executable RED `bef24b5af9143a8b312b351ce885dcffdc04c016`은 기존 hostile matrix에 대문자 marker tag `NOEMA-REVIEW-GATE`가 canonical approval과 공존하는 경우를 추가하고 `null`을 요구합니다. Production repair `8f44bc90d6c23210a3c329568dd99de483f5e45e`은 `noemaMarkerEnvelopePattern`에만 case-insensitive envelope observation을 적용하고 canonical `noemaMarkerPattern`은 그대로 exact/case-sensitive하게 유지합니다. RED→repair diff는 `scripts/hourly-commercial-readiness.mjs` 한 줄 `+1/-1`이며, noncanonical tag는 authority token으로 해석되지 않고 추가 marker-like envelope로만 관측되어 fail closed합니다.

이 수리는 기존 operator guide의 “대소문자 변형 등 다른 marker-like envelope가 함께 있으면 거부” 계약을 production과 다시 일치시킵니다. 따라서 guide 문구나 owner boundary를 넓히지 않습니다. Hosted exact-head terminal GREEN 전에는 source-level repair만 주장합니다.

## Evidence and TRACEABILITY

GitHub REST Pull Request Reviews API는 review 목록을 chronological order로 반환하고 각 review에 body, `state`, `commit_id`를 제공합니다. Noema는 이 platform authority 위에 자체 body marker serialization을 추가하므로, marker grammar와 cardinality는 Noema owner가 fail closed로 정의해야 합니다.

- GitHub. (2026). *REST API endpoints for pull request reviews*. GitHub Docs. https://docs.github.com/en/rest/pulls/reviews
- Initial executable RED: `test/commercial-readiness-noema-marker-cardinality-authority.test.ts` @ `598427fb88bc88aac3de52498f0ab39602c8412b`
- Initial production repair: `scripts/hourly-commercial-readiness.mjs` @ `c5ea67c5d2fd44c91d1849afc73c8ed974b15790`
- Operator contract: `docs/hourly-commercial-readiness-loop.md` @ `49d10aeb38a9885192ca810dbef5939749547507`
- Case-variant envelope RED: `test/commercial-readiness-noema-marker-cardinality-authority.test.ts` @ `bef24b5af9143a8b312b351ce885dcffdc04c016`
- Case-variant envelope production repair: `scripts/hourly-commercial-readiness.mjs` @ `8f44bc90d6c23210a3c329568dd99de483f5e45e`

## Risk and follow-up

Marker-like envelope detection is intentionally conservative. A trusted bot body containing an accidental second `noema-review-gate` HTML envelope, including a tag-name case variant, will require a fresh canonical review rather than guessing intent. That is acceptable for merge authority. The envelope detector may observe more malformed comments than before, but only to revoke/withhold authority; the canonical marker parser remains strict and cannot grant authority to those variants.

Fresh exact-head application CI, reviewer-ci, required Security Scan, patch-validator-image and formal Noema current-head review remain mandatory before Ready/merge. This source repair does not establish an immutable release or deployment evidence.
