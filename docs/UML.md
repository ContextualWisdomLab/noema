# Noema UML Views

## Status

**Proposed canonical UML rebuilt on protected `main` `382c78f2e9eeac4f24b3a825f192b34943e30c9a`.** Diagrams describe current protected truth unless a node is explicitly marked Proposed/External. They do not elevate stale PR behavior to implementation authority.

## Component view

```mermaid
flowchart TB
  subgraph GH[GitHub]
    GA[Actions caller]
    API[GitHub API]
    PR[Pull request / review / checks]
    RULES[Live rulesets]
  end

  subgraph NOEMA[Noema repository/runtime]
    W[Cloudflare Worker]
    RL[NoemaRateLimiter DO]
    RG[NoemaOidcReplayGuard DO]
    CR[central-review workflow]
    MR[maintenance/readiness workflows]
    RE[release evidence tooling]
    KP[KPI/readiness/acquisition tooling]
  end

  subgraph EXT[Read-only / external authorities]
    CENTRAL[central .github Security Scan]
    CO[contextual-orchestrator]
    CF[Cloudflare environment/deployment]
    LEGAL[Owner/legal/IP evidence]
    COMM[Customer/revenue evidence]
  end

  GA -->|OIDC bearer| W
  W --> RL
  W --> RG
  W --> API
  CR --> CO
  CR --> PR
  MR --> API
  MR --> CENTRAL
  MR --> RULES
  RE --> API
  RE --> CF
  KP --> CF
  KP --> LEGAL
  KP --> COMM
```

The central `.github`, `contextual-orchestrator` and external evidence providers are dependencies. Noema's writer must not mutate them merely to satisfy Noema acceptance.

## Credential-exchange sequence

```mermaid
sequenceDiagram
  autonumber
  actor Caller as GitHub Actions
  participant Worker as Noema Worker
  participant Rate as RateLimit DO
  participant OIDC as GitHub OIDC/JWKS
  participant Replay as Replay DO
  participant API as GitHub API

  Caller->>Worker: POST /exchange + bearer + target_repository
  Worker->>Rate: evaluate bounded distributed rate state
  alt rate unavailable/malformed/exceeded
    Rate-->>Worker: non-passing
    Worker-->>Caller: fail closed
  else allowed
    Worker->>OIDC: discovery/JWKS when required
    OIDC-->>Worker: bounded identity material
    Worker->>Worker: verify signature, issuer, audience, workflow identity, time, target
    Worker->>Replay: coordinate verified replay identity
    alt replay conflict/unavailable
      Replay-->>Worker: non-passing
      Worker-->>Caller: fail closed
    else accepted according to current protected source
      Worker->>API: resolve installation / create scoped token
      API-->>Worker: installation token
      Worker-->>Caller: bounded no-store response
    end
  end
```

Issue #81 / stale Draft #83 proposes a stricter invariant in which the verified replay claim is guaranteed to complete before token creation. Until rebuilt and integrated after canonical shared-source convergence, that stricter ordering remains Proposed, not protected-main truth.

## Evidence and merge decision sequence

```mermaid
sequenceDiagram
  autonumber
  participant Writer
  participant PR as GitHub PR
  participant CI as Noema CI
  participant SEC as Central Security Scan
  participant REV as Formal reviews/threads
  participant GOV as Live ruleset
  participant MERGE as Merge API

  Writer->>PR: refetch exact head + stored base
  Writer->>PR: independently resolve live base/ancestry/mergeability
  Writer->>CI: collect exact-head check/run/checkout SHA evidence
  Writer->>SEC: collect eligible exact-head/live-base scanner evidence
  Writer->>REV: collect reviews + unresolved findings
  Writer->>GOV: refetch live required-workflow/approval rules
  Writer->>PR: immediately revalidate head/base/writer state
  alt any missing/pending/stale/failed/neutral/skipped/unresolved/governance gap
    Writer-->>Writer: defer only this lane and rotate
  else unchanged and all applicable gates pass
    Writer->>MERGE: merge unchanged exact head
    MERGE-->>Writer: protected integration identity
    Writer->>PR: refetch protected main and downstream evidence
  end
```

No check/status/model output substitutes for formal approval if live policy requires approval. Conversely, approval is not invented as a requirement when the live ruleset does not require it.

## Review publication trust-domain view

```mermaid
flowchart LR
  T[Exact target PR/head] --> C[Context construction]
  C --> M[Model gateway request]
  M --> V[Untrusted model evidence]
  V --> R[Bounded reviewer policy]
  R --> P[Reviewer App publication]

  CO[contextual-orchestrator] --> M
  APP[Reviewer App capability] --> P

  T -. no write credential .-> M
  M -. cannot merge .-> P
  P -. no release/deploy authority .-> X[GitHub review]
```

The model/provider plane cannot receive a maintainer publication token or turn its output directly into merge authority.

## Work-conserving repository state machine

```mermaid
stateDiagram-v2
  [*] --> Inventory
  Inventory --> MergeCandidate: exact unchanged candidate exists
  Inventory --> DefectLane: current bounded defect exists
  Inventory --> BlockerLane: Noema-owned blocker exists
  Inventory --> DocsLane: canonical graph gap exists
  Inventory --> BuyerLane: highest-impact bounded buyer gap exists
  Inventory --> Sweep: no immediately executable lane

  MergeCandidate --> Validate
  DefectLane --> Red
  Red --> Green
  Green --> Validate
  BlockerLane --> RCA
  RCA --> Remedy
  Remedy --> Validate
  DocsLane --> DocsToCode
  DocsToCode --> Validate
  BuyerLane --> Validate

  Validate --> Mutate: proof permits bounded action
  Validate --> Deferred: exact lane blocked
  Mutate --> Inventory
  Deferred --> Inventory
  Sweep --> Inventory: safe action discovered
  Sweep --> CleanSweep1: no safe action
  CleanSweep1 --> Inventory: safe action discovered
  CleanSweep1 --> CleanSweep2: second fresh clean sweep
  CleanSweep2 --> [*]
```

Prompt edits, inventory, documentation, one RED/GREEN test, one commit, one PR update or one blocker are intermediate states when another safe action exists.

## Release/deployment authority view

```mermaid
flowchart LR
  S[Protected source SHA] --> Q[Quality/package verification]
  Q --> R[Immutable release evidence]
  R --> SB[SBOM/provenance/rights consistency]
  SB --> D[Protected deployment approval]
  D --> SM[Smoke / runtime verification]
  SM --> K[Production KPI evidence]
  K --> A[Acquisition evidence]

  L[Owner/legal/IP evidence] --> SB
  C[Customer/revenue evidence] --> A

  Q -. does not prove .-> D
  R -. does not prove .-> K
  K -. does not prove .-> L
```

Each stage has independent authority. Current scheduled readiness/acquisition audits may successfully execute while retaining a `NOT_READY` verdict because production/commercial evidence is absent.

## Deployment view

```mermaid
flowchart TB
  DEV[Reviewed protected source] --> GA[GitHub Actions release/deploy workflows]
  GA --> PKG[Verified package/artifact]
  GA --> AT[SBOM/provenance/attestation evidence]
  PKG --> CF[Cloudflare Worker production environment]
  CF --> DO1[Rate-limit Durable Object]
  CF --> DO2[OIDC replay Durable Object]
  CF --> API[GitHub API]
  CF --> OBS[Production logs / KPI source]
  OBS --> AUDIT[Strict KPI/readiness audit]
```

Live environment-review controls, Cloudflare deployment receipts and real production log provenance are external evidence. Documentation or CI cannot fabricate them.

## Data/state view

See `docs/ERD.md`. Runtime persistence is Durable Object state only; GitHub/release/deployment/KPI/legal/acquisition records are external or retained evidence concepts rather than one Noema-owned relational database.

## Current/proposed boundary

Current protected facts include package/install-script/lockfile controls through #91, deployment evidence byte/path integrity through #121, KPI exact-byte/provenance integrity through #250, and maintainer live-governance binding through #254.

The following remain Proposed or incomplete: active Drafts #252/#253, issue #255 action-runtime migration, issue #155 release attestation/lifecycle isolation, stale #83 replay ordering, stale #69 acquisition-manifest integrity, issue #84 broad coverage-exclusion truthfulness, and external production/legal/commercial evidence gaps.
