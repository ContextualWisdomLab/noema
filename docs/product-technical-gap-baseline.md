# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 protected source, active candidate, transient workflow evidence와 foreign-owner authority를 분리한다. Open PR exact head, protected base, required workflow, review thread, release와 central dependency는 mutation·merge·release 직전에 다시 읽는다. predecessor GREEN, queued/pending/in-progress/skipped/cancelled run, 오래된 PR base snapshot과 scanner/model judgement는 다음 revision의 merge authority로 전용하지 않는다. queued는 GREEN이 아니다.

Current protected source는 GitHub-verified protected `main@36e5cf957ee20a8bb3e19ff50fea6c97771d2ba1`다. Current source SHA는 moving observation이며 future merge 뒤 evergreen identity로 취급하지 않는다. 이 protected revision에는 merged PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`의 producer-authenticated exact-claim evidence admission과 non-vacuous reviewer publication contract가 포함돼 있다.

Moving central control-plane snapshot은 central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`다. Noema runtime의 reviewed immutable central consumer pin은 `c9052e607e5f3cc76e73207e7786b21500721b79`이고 runtime authority 표현은 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`다. Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않으며 central moving head가 전진했다고 consumer pin을 자동 승격하지 않는다.

Protected history에는 merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`, merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`, merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`, merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`, merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`, merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`, merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`, merged PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`가 포함돼 있다. 이 SHA들은 역사 증거이지 open-candidate authority가 아니다.

#559가 `docs/product-technical-gap-baseline.md`와 executable documentation-authority tests의 sole writer다. 다른 feature lane의 과거 baseline blob은 ordinary/non-force semantic convergence 때 current authority로 승계하지 않는다.

## Canonical product boundary

Noema Core Domain은 Agent Runtime과 Workflow / Task Execution이다. Tool / Capability Boundary, State / Checkpoint, Isolation Integration, Policy / Approval, Observability, Recovery는 명시적 bounded context다. Execution identity, side-effect authority, claim/checkpoint CAS, cancellation/recovery invariant와 Noema-owned product/role/time approval issuance는 Noema 경계에 남긴다.

`contextual-orchestrator`는 provider/model discovery, routing, retry/failover, test-time compute와 provider credential을 소유한다. Noema는 released gateway contract와 canonical `orchestrator/free` alias를 소비하며 direct provider SDK, provider key, provider/model/group fallback policy를 소유하지 않는다. `.github`는 organization reusable workflow/control-plane source다. Keyverse는 identity backend다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave, AppGuardrail은 각자의 isolation/security/outbound/scanning truth를 소유한다. Noema는 그 owner evidence를 reference/pin으로 소비할 뿐 foreign implementation이나 domain table을 복제하지 않는다. Cross-service SQL과 mutable sibling PR dependency는 금지한다.

Baseline의 요구·설계·데이터·경계 authority는 `docs/PRD.md`, `docs/TRD.md`, `docs/UML.md`, `docs/ERD.md`, `docs/CONTEXT_MAP.md`다. 이 register는 그 문서와 ADR을 대체하지 않고 current Gap/Action/Status를 exact source·PR·workflow evidence에 결합한다. PR #560의 ADR 0015는 candidate-only `Proposed`이며 protected ADR authority로 승격하지 않는다.

## Integrated exact-claim evidence — issue #555 / merged PR #556

PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`는 unchanged exact-head application CI `34197596549`, reviewer-ci `34197596588`, required Security Scan `34197596536`, patch-validator-image `34197596517` terminal SUCCESS와 clean review authority를 충족한 뒤 normal merge됐다. Resulting protected merge는 GitHub-verified `36e5cf957ee20a8bb3e19ff50fea6c97771d2ba1`이다.

Protected source는 raw source receipt를 context authority로만 취급하고, `ClaimEvidenceRequirement`와 producer-authenticated receipt의 kind/identity/coordinates/digest가 일치해야 finding/publication authority가 되도록 한다. `produce_source_claim_receipt()`는 exactly-one-line UTF-8 source bytes와 claim equality를 요구하며 paraphrase, embedded multiline, invalid UTF-8을 거부한다. Model `request_changes`/`blocked`는 producer-authenticated finding 없이 publication될 수 없다. Source integration은 execution stdout/stderr producer, research producer, immutable release, released central consumer까지 자동으로 증명하지 않는다.

## Active external-extension candidate — issue #545 / PR #560

Observed PR #560 exact `f8703e6628961d380df59e4e90b600ebad215c11`는 Draft이며 protected `main@36e5cf957ee20a8bb3e19ff50fea6c97771d2ba1`을 base로 한다. Compare authority는 `behind_by=0`, merge base exact protected main이다. #556 merge 뒤 feature lane은 protected `.github`와 `reviewer` owner source를 그대로 승계하고 `docs/product-technical-gap-baseline.md`는 #559에 남겨 두었다. Ordinary/non-force history를 유지하며 force push나 destructive rebase를 쓰지 않는다.

Earlier Policy / Approval RED `7ca9aebee6f92053913c0bbc665c8de77650891f`의 hosted application CI `34206149899`, job `101995980303`은 valid catalog/AppGuardrail/quarantine evidence만으로 descriptor가 active/product/role grant를 self-broaden할 수 없음을 고정했다. Subsequent production source separates source/catalog/scanner authority from Noema Policy / Approval issuance, keeps the source-issued grant at a pilot ceiling, seals admission/activation/receipt provenance, revalidates the full six-field catalog identity and live scanner receipts, and rejects impossible pre-activation invocation chronology.

Fresh hostile-input RED `f30f67328efbcd0b8bed7ac89f7c64c40528ea44` / hosted application CI `34218780676`, job `102036728526` proved that a revoked descriptor-list Proxy could leak a raw JavaScript exception through public admission. Production `802b0bff0f32c170ada328b04e87e0db43ee7cd4` normalized that public boundary without weakening descriptor/list/capability validation.

Fresh Tool / Capability review then found a distinct expiry-authority gap: `activated_at` and `invoked_at` are caller event timestamps, so comparing the validity window only against those fields allowed a caller to backdate an operation after actual expiry. Test-only exact `4be371ec08b852f4d00829ba5aa6936df6564b5e` advances the runtime clock beyond `valid_to` while retaining an in-window event timestamp. Hosted application CI `34221586992`, job `102045717213` passed exact checkout, live-base guard, lockfile control, install and release typecheck, then failed at release tests: this is the current causal RED. Production `2b50b35b7bdbb834f571dfcae50dceb05766244c` requires the Noema runtime wall clock to remain inside both the admitted descriptor and independently issued Policy / Approval validity windows for activation and invocation. Exact `83e3130f1894e879769e014c76e28ffc982a2063` covers the pre-window edge; current exact `f8703e6628961d380df59e4e90b600ebad215c11` records the authority distinction in ADR 0015, which remains `Proposed`.

Current exact-head generation is application CI `34222306594`, reviewer-ci `34222306710`, required Security Scan `34222306581`, and patch-validator-image `34222306823`. These runs are revision-local and predecessor GREEN does not transfer; queued/pending/in-progress status is not merge authority.

AppGuardrail/quarantine receipts는 scanner/provenance evidence이지 Noema approval이 아니다. EgressWeave/quarantine references는 outbound/isolation operation의 대체물이 아니다. Anthropic marketplace review는 discovery evidence이지 CWL product authority가 아니다. `context-graph-contracts#27`이 immutable shared external-capability contract를 release하기 전까지 이 local port는 fail-closed ACL/test double이며 live plugin installation 또는 buyer completion을 주장하지 않는다. `context-graph-contracts#27`과 `appguardrail#1099`의 owner evidence를 Noema가 합성하지 않는다.

## Evidence and merge rules

Review resolution, CI, reviewer-ci, required Security, image/SBOM/provenance, branch ancestry, release는 separate evidence classes다. Every source mutation/restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale 또는 absent-required evidence는 passing이 아니다.

Normal merge requires unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates and no foreign-owner/protected-contract regression. Concurrent commits나 pushes 자체를 race로 단정하지 않는다. Wrong base/conflict, stale ADR, mutable dependency, missing fixture/contract, single-writer 위반은 force push나 destructive rebase가 아니라 ordinary/non-force semantic convergence로 수리한다.

PR 0은 useful work를 닫아 제조하지 않는다. Open lane은 normal merge 또는 verified successor가 모든 유효 delta/test/fixture/contract/evidence를 완전히 승계한 경우에만 사라진다. Blocked lane은 자기 lane만 막고 unrelated safe review, owner-path repair, docs-to-code repair와 buyer-gap work는 계속한다.

## Commercial gap register

| Priority | Gap | Buyer/operator impact | Current owner | Status | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Exact-claim evidence supply chain | Tool/research claim이 producer evidence 없이 reviewer authority가 될 위험 | protected #556 + release/consumer lanes | Source integrated; producer/release/consumer open | protected source + execution/research producer + immutable Noema release + released central consumer corpus RED→GREEN | release/producer evidence를 별도 lane에서 완성 |
| P0 | External extension capability admission | third-party plugin metadata, self-asserted grant 또는 backdated event time이 runtime authority가 될 위험 | issue #545 / PR #560 | Draft; ADR 0015 Proposed; runtime-clock RED repaired, exact-head gates open | immutable source + independent scan + Noema-issued Policy / Approval grant + public hostile-input normalization + runtime-current expiry enforcement + live revalidation + fresh four-GREEN + normal merge + immutable shared contract/live pilot evidence | `f8703e6...` unchanged-head gates와 fresh review를 검증하고 실패 시 해당 causal lane 즉시 수리 |
| P0 | Protected-main governance closure | required Security workflow만으로 PR/review/history/deletion/bypass 통제를 증명했다고 오인할 위험 | issue #27 | Open; external control evidence absent | fresh live ruleset + required PR/review/conversation/history/deletion controls + independent bypass/break-glass evidence + protected-source governance receipt | source가 만들 수 없는 organization/admin control은 issue #27에서 독립 검증 |
| P0 | Strict orchestrator/free consumer release | source 통합만으로 immutable consumer activation을 증명할 수 없음 | merged #535 + release lane | Source integrated; release/consumer open | version/tag/package/SBOM/provenance/reproducibility/rollback + released consumer | release-ready protected head에서만 publication |
| P0 | Patch-validator operational publication | source/image CI success만으로 reusable immutable runtime을 증명할 수 없음 | issue #66 | Open; publication evidence absent | protected execution + immutable image/signature/SBOM/provenance/reproducibility/rollback | immutable publication evidence와 결합 |
| P0 | Authentic production KPI evidence | fixture·synthetic 또는 source-level KPI 검증이 실제 운영 성능을 대체할 위험 | issue #3 | Open; production window absent | authenticated production-window records + strict provenance + buyer-relevant KPI gate | 실제 production evidence 없이는 readiness를 승격하지 않음 |
| P0 | Acquisition coordination | source/docs 완료를 buyer·legal·transfer readiness로 잘못 승격할 위험 | issue #5 | Open; evidence families incomplete | exact protected revision + applicable release/deployment/operational/buyer/legal evidence family | 남은 evidence family를 owner별로 수렴하고 source claim과 분리 |
| P0 | External Maintainer/Reviewer App identity | source capability-file 계약이 실제 App 설치·키 custody·rotation·권한·reviewer identity를 대체할 위험 | issues #29 / #227 | Open; live identity evidence absent | live installation + key custody/rotation + repository permission + eligible reviewer/publication identity evidence | 외부 App authority는 해당 issue owner에서 독립 검증 |
| P0 | Durable workflow/state production evidence | source Durable Object logic이 실제 deployed transaction/recovery를 증명하지 않음 | merged #542 / ADR 0013 | Source integrated; ADR 0013 Proposed | deployment compatibility + recovery/rollback receipt + immutable release | deployed runtime evidence 확보 전 ADR 0013 `Proposed` 유지 |

## Release boundary

GitHub release collection에 immutable Noema release가 실제 존재하기 전 version/tag/package/SBOM/provenance/reproducibility/rollback completion을 주장하지 않는다. Release-ready exact protected head에서만 publication하고, consumer는 released/versioned contract만 bump한다.
