# Noema UML and Control-Flow Views

이 문서는 `ARCHITECTURE.md`를 그림으로 보완합니다. Mermaid diagram은 **현재 구현**, **active proposed control**, **external authority**를 구분해서 읽어야 합니다. active PR에서 구현된 동작은 protected-main에 병합되기 전 배포된 것으로 간주하지 않습니다.

## 1. Bounded-context / component view

```mermaid
flowchart LR
  subgraph Runtime[Noema runtime]
    RE[runtime-entrypoint]
    EE[security entrypoint]
    WK[credential worker]
    CORE[OIDC and GitHub App core]
    READY[runtime readiness]
    RATE[NoemaRateLimiter]
    REPLAY[NoemaOidcReplayGuard]
  end

  subgraph ReviewPlane[Review and model plane]
    CENTRAL[central-review workflow]
    ORCH[contextual-orchestrator]
    REVIEWER[Reviewer GitHub App]
  end

  subgraph MaintenancePlane[Maintenance plane]
    COMM[hourly commercial readiness]
    DEV[hourly product development]
    MAINT[Maintainer GitHub App]
  end

  subgraph EvidencePlane[Evidence plane]
    CHECKS[check evidence]
    STATUS[status evidence]
    REVIEWS[formal review evidence]
    SCANS[scanner evidence]
    MODEL[model judgement]
    RELEASE[release evidence]
    DEPLOY[deployment evidence]
    ACQ[acquisition evidence]
  end

  CALLER[GitHub Actions caller] --> RE
  RE --> READY
  RE --> EE --> WK --> CORE
  WK --> RATE
  WK --> REPLAY
  CORE --> CALLER

  CENTRAL --> RE
  CENTRAL --> ORCH --> CENTRAL
  CENTRAL --> REVIEWER
  REVIEWER --> REVIEWS

  COMM --> CHECKS
  COMM --> STATUS
  COMM --> REVIEWS
  COMM --> SCANS
  COMM --> MAINT
  DEV --> ORCH
  DEV -. verified proposal .-> MAINT

  CHECKS --> RELEASE
  SCANS --> RELEASE
  REVIEWS --> RELEASE
  RELEASE --> DEPLOY --> ACQ
  MODEL -. diagnostic only .-> REVIEWS
```

`model judgement`에서 formal review/merge authority로 직접 가는 화살표가 없는 것이 의도입니다.

## 2. Credential exchange sequence

```mermaid
sequenceDiagram
  autonumber
  participant Caller as GitHub Actions caller
  participant Ready as runtime-entrypoint / entrypoint
  participant Rate as NoemaRateLimiter
  participant Trust as worker trust policy
  participant Core as OIDC + GitHub App core
  participant Replay as NoemaOidcReplayGuard
  participant GitHub as GitHub API

  Caller->>Ready: POST /exchange + OIDC + target_repository
  Ready->>Ready: bound bearer/body/origin/redirect policy
  Ready->>Rate: distributed pre-auth decision
  Rate-->>Ready: allow or reject
  Ready->>Trust: exact workflow ref + paired workflow SHA
  Trust->>Core: validated request
  Core->>GitHub: discovery/JWKS and App exchange as required
  GitHub-->>Core: verified metadata / installation token response
  Core->>Replay: claim validated OIDC jti
  Replay-->>Core: first-use or reject
  Core-->>Caller: repository-scoped short-lived token
```

어느 단계든 identity/config/network/state가 불완전하면 후속 단계로 진행하지 않습니다.

## 3. PR maintenance sequence

```mermaid
sequenceDiagram
  autonumber
  participant Loop as Commercial readiness loop
  participant GitHub as GitHub APIs
  participant Review as Central Noema review
  participant App as Reviewer App
  participant Maint as Maintainer App

  Loop->>GitHub: paginate open PRs
  loop each current PR
    Loop->>GitHub: fresh head/base/checks/statuses/reviews/threads
    GitHub-->>Loop: revision-bound evidence
    alt valid source defect or failing gate
      Loop-->>Loop: blocked/defer for repair owner
    else Noema review missing and deterministic gates permit review
      Loop->>GitHub: verify no same-head review run
      Loop->>Review: dispatch exact repo/PR/head
      Review->>App: publish formal review after independent analysis
    else merge candidate
      Loop->>GitHub: re-read current PR and evidence
      Loop->>Maint: request SHA-bound squash merge
      Maint->>GitHub: merge expected head only
    end
  end
  Loop->>GitHub: fresh remaining queue count
```

A queued check or review does not become success. A pending item can be deferred while another item is processed.

## 4. Work-conserving autonomous state machine

```mermaid
stateDiagram-v2
  [*] --> FreshEvidence
  FreshEvidence --> ExecutableQueue: build priority queue
  ExecutableQueue --> Act: execute_now candidate exists
  ExecutableQueue --> ExitSweep1: no executable candidate

  Act --> Verify
  Verify --> FreshEvidence: success or meaningful state change
  Verify --> RCA: failure / unexpected result

  RCA --> Hypothesis
  Hypothesis --> Remedies
  Remedies --> Feasibility
  Feasibility --> Act: execute_now
  Feasibility --> ExecutableQueue: defer_until_trigger / read_only_dependency / external_only
  Feasibility --> Hypothesis: reject and another hypothesis remains
  Hypothesis --> ArchitectureReview: three distinct hypotheses failed
  ArchitectureReview --> ExecutableQueue: contract decision made

  ExitSweep1 --> FreshEvidence: actionable work discovered
  ExitSweep1 --> ExitSweep2: first sweep clean
  ExitSweep2 --> FreshEvidence: material state changed or work found
  ExitSweep2 --> [*]: budget exhausted or second sweep proves no safe action
```

**No early stop** means `queued`, `pending`, `rate_limited`, `missing_approval`, `active_writer` 같은 상태가 한 work item의 defer reason이지 전체 state machine의 terminal state가 아니라는 뜻입니다.

## 5. Evidence and authority state machine

```mermaid
stateDiagram-v2
  [*] --> SourceObserved
  SourceObserved --> DeterministicChecks
  DeterministicChecks --> Blocked: missing/pending/failed/stale evidence
  DeterministicChecks --> ReviewRequired: deterministic gates ready
  ReviewRequired --> Blocked: unresolved thread or changes requested
  ReviewRequired --> MergeCandidate: applicable formal approval and review policy satisfied
  MergeCandidate --> Blocked: live head/base/ruleset changed
  MergeCandidate --> Merged: protected SHA-bound merge succeeds
  Merged --> ReleaseCandidate: release acceptance inputs complete
  Merged --> NotReleased: release inputs incomplete
  ReleaseCandidate --> Released: package/provenance/SBOM/receipt verified
  Released --> DeploymentCandidate: protected environment inputs complete
  DeploymentCandidate --> Deployed: production receipt/smoke/governance verified
  Deployed --> AcquisitionCandidate: real commercial/transfer evidence complete
  AcquisitionCandidate --> AcquisitionReady: final audit passes
```

각 state 전이는 별도 evidence plane을 요구합니다. `Merged`는 `Released`나 `Deployed`의 동의어가 아닙니다.

## 6. Product-development proposal sequence

현재 protected-main document는 three-runner isolation을 설명하고, PR #80은 publication race를 더 좁게 만드는 active proposed implementation입니다.

```mermaid
sequenceDiagram
  autonumber
  participant Gate as Zero-PR / credential gate
  participant Agent as Uncredentialed OpenCode runner
  participant Artifact as Immutable proposal artifact
  participant Verify as Fresh verifier runner
  participant Publish as Non-executing publisher
  participant App as Maintainer App
  participant GitHub as GitHub

  Gate->>GitHub: read open PR queue + main identity
  Gate-->>Agent: one bounded task if safe
  Agent->>Agent: test-first change with NVIDIA NIM only
  Agent->>Artifact: patch + base + digest + file/byte evidence
  Artifact->>Verify: exact artifact
  Verify->>Verify: apply, release:verify, compare digest
  Verify-->>Publish: success permits publication stage
  Artifact->>Publish: same immutable patch
  Publish->>Publish: reconstruct without executing proposal
  Publish->>GitHub: revalidate queue/base
  Publish->>App: mint late-bound scoped token
  App->>GitHub: conditionally create proposal branch
  App->>GitHub: create PR
  App->>GitHub: re-read server head/base and queue
  GitHub-->>Publish: exact PR identity
```

후속 review/merge는 이 sequence의 일부가 아니라 commercial-readiness control plane의 책임입니다.

## 7. Reviewer and merge authority flow

```mermaid
flowchart TD
  Model[Model judgement] -->|diagnostic input| ReviewWorkflow[Review workflow]
  Checks[Required check runs] --> Gate[Deterministic merge gate]
  Statuses[Commit statuses] --> Gate
  Scanner[Scanner revision evidence] --> Gate
  Threads[Review threads] --> Gate
  Formal[Eligible formal reviews] --> Gate
  ReviewWorkflow --> Formal
  Ruleset[Live ruleset / branch protection] --> Gate
  Gate -->|all applicable conditions| MergeAPI[SHA-bound merge authority]
  MergeAPI --> Main[Protected main]

  Model -. no direct authority .-> MergeAPI
  Checks -. no direct authority .-> MergeAPI
```

## 8. Deployment / control-plane topology

```mermaid
flowchart TB
  subgraph GitHubCloud[GitHub]
    Target[Noema repository]
    Org[ContextualWisdomLab/.github]
    Actions[GitHub Actions]
    ReviewerApp[Reviewer App]
    MaintainerApp[Maintainer App]
  end

  subgraph Cloudflare[Cloudflare]
    Worker[Noema Worker]
    RateDO[Rate-limit Durable Object]
    ReplayDO[Replay Durable Object]
  end

  subgraph CWL[CWL services]
    Orch[contextual-orchestrator]
    Naruon[naruon / consumers]
  end

  Actions -->|GitHub OIDC| Worker
  Worker --> RateDO
  Worker --> ReplayDO
  Worker -->|scoped installation token| Actions
  Actions --> Orch
  Actions --> ReviewerApp
  Actions --> MaintainerApp
  ReviewerApp --> Target
  MaintainerApp --> Target
  Naruon -. versioned protocol consumer .-> Worker
  Org --> Actions
```

Failure domain은 의도적으로 분리합니다. Orchestrator/model 장애가 credential trust를 약화시키지 않고, Noema credential exchange 장애가 다른 CWL 서비스의 내부 데이터베이스를 직접 손상시키지 않아야 합니다.

## 9. Diagram maintenance rules

- source behavior가 바뀌면 해당 diagram과 executable contract를 같은 PR에서 갱신합니다.
- unmerged active PR 동작은 “현재 배포”로 표시하지 않습니다.
- identity/authority arrow는 convenience 때문에 추가하지 않습니다.
- persistent entity가 실제 저장소에 없는 경우 ERD의 conceptual entity와 혼동하지 않습니다.
