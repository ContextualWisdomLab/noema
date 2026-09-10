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
    TOOL[tool-capability admission]
    LIFE[external-extension lifecycle\nprotected source]
    PROC[procedural graph advisory\nprotected source]
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
    RUNNER[runner assignment evidence]
    STATUS[status evidence]
    REVIEWS[formal review evidence]
    SCANS[scanner evidence]
    MODEL[model judgement]
    RELEASE[release evidence]
    DEPLOY[deployment evidence]
    ACQ[acquisition evidence]
  end

  subgraph ForeignAuthority[Foreign owner authority]
    POLICY[Noema Policy / Approval port]
    APP[AppGuardrail]
    QUAR[quarantine-sandbox-runtime]
    EGRESS[EgressWeave]
    CGC[context-graph-contracts\nreleased schema owner]
    EA[enterprise-architecture-core\nadoption/decision owner]
  end

  CALLER[GitHub Actions caller] --> RE
  RE --> READY
  RE --> EE --> WK --> CORE
  WK --> RATE
  WK --> REPLAY
  CORE --> CALLER

  TOOL --> LIFE
  POLICY -->|fresh approval/scope identity for new active| LIFE
  APP -. immutable evidence reference/digest .-> LIFE
  QUAR -. immutable evidence reference/digest .-> LIFE
  EGRESS -. immutable policy reference .-> LIFE

  AGENT[Agent Runtime caller] -->|tenant/task/execution + graph digest| PROC
  LIFE -. caller-supplied fresh authenticated lifecycle snapshot .-> PROC
  CGC -. future immutable released wire contract .-> PROC
  EA -. adoption/decision evidence, not runtime authority .-> PROC

  CENTRAL --> RE
  CENTRAL --> ORCH --> CENTRAL
  CENTRAL --> REVIEWER
  REVIEWER --> REVIEWS

  COMM --> CHECKS
  COMM --> RUNNER
  COMM --> STATUS
  COMM --> REVIEWS
  COMM --> SCANS
  COMM --> MAINT
  DEV --> ORCH
  DEV -. verified proposal .-> MAINT

  RUNNER -. operational diagnostic only .-> CHECKS
  CHECKS --> RELEASE
  SCANS --> RELEASE
  REVIEWS --> RELEASE
  RELEASE --> DEPLOY --> ACQ
  MODEL -. diagnostic only .-> REVIEWS
```

`model judgement`에서 formal review/merge authority로 직접 가는 화살표가 없는 것이 의도입니다. `runner assignment evidence` 역시 job을 실행할 수 있는 runner가 배정됐는지를 나타내는 operational evidence일 뿐 check success로 직접 승격되지 않습니다. 외부 Tool Capability evidence 화살표도 reference/digest 전달만 뜻하며 AppGuardrail, quarantine runtime, Egress authority가 Noema로 이전된다는 뜻이 아닙니다. Procedural graph의 외부 화살표도 released schema/adoption evidence 경계만 나타내며 graph content, model routing, credentials 또는 activation authority를 Noema로 이전하지 않습니다. Lifecycle에서 procedural graph로 향하는 점선은 #586 adapter가 caller-supplied snapshot을 소비한다는 뜻일 뿐 Noema가 별도의 durable revocation authority를 graph aggregate 안에 복제한다는 뜻이 아닙니다.

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

### 2.1 External-extension lifecycle append

```mermaid
sequenceDiagram
  autonumber
  participant Caller as Noema Tool Capability caller
  participant Repo as Durable lifecycle repository
  participant Head as Compact head + audit tail
  participant Approval as Noema Policy / Approval verifier
  participant Store as Durable Object storage transaction

  Caller->>Repo: append exact stream + transition request
  Repo->>Repo: canonicalize + validate legal edge + hash request
  Repo->>Repo: verify exact duplicate replay index if present
  Repo->>Head: readCurrent exact head + tail
  Head-->>Repo: verified state/version/head or fail closed
  alt genuinely new next_state = active
    Repo->>Approval: re-read current approval/scope + owner evidence
    Approval-->>Repo: verified or reject
  end
  Repo->>Store: transaction expected version/state/head CAS
  alt exact duplicate committed concurrently
    Store-->>Repo: replay candidate only
    Repo->>Repo: verify immutable request/event/head/tail after transaction
    Repo-->>Caller: replay
  else CAS winner
    Store->>Store: append event + transition index + head
    Store-->>Repo: accepted snapshot
    Repo-->>Caller: accepted
  else stale/conflicting writer
    Store-->>Repo: conflict
    Repo-->>Caller: fail closed; no auto-rebase
  end
```

Digest 계산과 Web Crypto replay 검증을 짧은 storage transaction 밖에서 수행하는 것이 의도입니다. 새 `active`만 현재 owner evidence를 다시 읽고, 이미 commit된 exact replay는 이후 mutable authority 변화 때문에 역사에서 제거되지 않습니다.

### 2.2 Protected procedural graph session, screening, and lifecycle projection

```mermaid
sequenceDiagram
  autonumber
  participant Caller as Agent Runtime caller
  participant Admit as Procedural graph admission
  participant Session as Execution-pinned session
  participant Lifecycle as Caller lifecycle authority
  participant Screen as Candidate screening port
  participant Approval as Independent Policy / Approval boundary

  Caller->>Admit: exact tenant/task/graph record
  Admit->>Admit: descriptor-safe copy + bounds + canonical order + SHA-256
  Admit-->>Caller: deep-frozen locally admitted graph
  Caller->>Session: admitted graph + tenant/task/execution + expected digest
  Session->>Session: exact scope/identity match
  Session-->>Caller: locally admitted advisory-only session
  Caller->>Lifecycle: acquire fresh authenticated lifecycle snapshot
  Lifecycle-->>Caller: same-execution lifecycle snapshot
  Caller->>Session: session + lifecycle + last procedure + hops + maxEdges
  alt lifecycle = running and known node within budget
    Session-->>Caller: bounded localized advisory context
  else accepted/cancellation/terminal, unknown node, or budget exceeded
    Session-->>Caller: suppression or explicit abstention
  end

  Caller->>Screen: admitted baseline/direct child + evaluation plan + paired receipts
  Screen->>Screen: lineage/context/case/leakage/score/safety/non-regression checks
  alt validation non-regression
    Screen-->>Caller: eligibleForApproval=true, activationAuthorized=false
    Caller-->>Approval: separate evidence only
  else unchanged/rejected/safety/score failure
    Screen-->>Caller: eligibleForApproval=false, activationAuthorized=false
  end
```

Protected procedural graph/session admission and candidate screening remain process-local, and #586 adds only a pure projection over caller-supplied current lifecycle evidence. Evaluation receipt authenticity, durable lifecycle freshness/revocation, graph persistence, approval CAS, canary/rollback, tool invocation and production activation remain outside this sequence as separate authorities.

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
