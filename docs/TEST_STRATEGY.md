# Noema Test Strategy

## 1. Goal

Noema의 테스트는 “함수가 실행됐다”가 아니라 **credential/review/merge/release 경계가 현실적인 공격·경쟁·실패 상황에서도 의도한 authority만 행사한다**는 것을 증명해야 합니다. 테스트와 coverage는 evidence이며 merge authority 자체는 아닙니다.

## 2. Quality gates

- owned production statements: **100%**.
- owned production branches: **100%**.
- functions/lines: tooling이 노출하는 범위에서 **100%**.
- reviewer Python: line/branch **100%**, public docstring **100%**.
- public TypeScript API는 beginner-readable 설명을 코드/문서에 유지합니다.
- skipped/ignored/quarantined test로 required release gate를 우회하지 않습니다.
- dependency audit 또는 security scan 실패를 coverage success로 덮지 않습니다.

Coverage 대상과 제외는 `vitest.config.ts` 및 reviewer CI가 source of truth입니다. 새 production source가 생기면 coverage exclusion으로 숨기는 것보다 실제 branch를 테스트합니다.

## 3. Test pyramid adapted to Noema

### 3.1 Pure unit / property contracts

대상:

- bounded input parsers;
- URL/origin/ref/SHA validators;
- review/check/status reduction logic;
- duplicate-key/UTF-8/path validators;
- KPI/evidence schema logic;
- Tool / Capability external-extension admission, explicit Policy / Approval, activation provenance, causally ordered invocation receipts, and lifecycle event canonicalization/digest validation.

핵심은 attacker-controlled input에 대한 closed-set acceptance입니다.

### 3.2 Stateful component tests

대상:

- `NoemaRateLimiter` fixed-window transaction and alarm;
- `NoemaOidcReplayGuard` single-use claim and alarm;
- current-state reschedule after delayed/retried alarm;
- malformed Durable Object decision fail-closed behavior;
- external-extension lifecycle expected-version/prior-state/head CAS, exact duplicate replay, same-ID/different-semantics conflict, and restart reconstruction;
- lifecycle current projection versus complete audit-chain verification;
- lifecycle evidence-verifier races where a competing exact activation commits before another writer's fresh Policy / Approval or owner-evidence check fails.

시간 테스트는 과거 alarm이 새 window/claim을 제거하지 않는지 확인합니다. Lifecycle 테스트는 새 `active` 권한과 이미 commit된 historical evidence를 구분합니다. 새 activation은 fresh owner evidence 없이는 실패해야 하지만, exact durable replay는 이후 mutable owner-state 변화 때문에 소급 무효화되지 않습니다.

### 3.3 Runtime API integration tests

대상:

- `/health`, `/ready`, `/exchange` method/schema/header separation;
- missing/malformed authorization;
- oversized body and chunked/no-Content-Length body;
- exact GitHub API origin and redirect rejection;
- request/response timeout and bounded response;
- workflow ref/SHA identity;
- GitHub App installation response validation;
- no secret reflection/logging.

### 3.4 Workflow contract tests

YAML을 텍스트로만 lint하는 데 그치지 않고 privilege/order/source identity를 검증합니다.

- immutable Action source SHA;
- exact checkout before repository code execution;
- `persist-credentials: false` where required;
- job-level permission boundary;
- uncredentialed model runner vs credential-bearing publisher;
- artifact ID/digest/base/patch binding;
- full pagination markers;
- stale-head refusal;
- no `.github/workflows/repair-*` or self-patching workflow;
- publisher conditional ref mutation and cleanup ordering.

### 3.5 GitHub evidence-policy tests

Synthetic fixtures는 다음을 포함해야 합니다.

- current success + predecessor failure;
- current pending + predecessor success;
- same check name from different App;
- same name across multiple suites/attempts;
- status/check name collision;
- `COMMENTED` vs `APPROVED` formal review;
- stale approval after head movement;
- unresolved threads beyond first page;
- 100+ check/status/review items;
- scanner exact-head/base/synthetic-merge revision distinction;
- stacked base movement.

### 3.6 Fresh-runner packaging / supply-chain tests

- deterministic `npm ci` under reviewed Node/npm identity;
- lockfile graph and package-object drift policy;
- install-script allow/deny authority;
- package archive/content verification if Noema becomes publishable;
- SBOM/provenance/release receipt validation;
- Action pins resolve to intended immutable source.

### 3.7 Operational acceptance tests

Code test만으로 끝나지 않는 변경은 protected-main에서 실제 control plane을 검증합니다.

Examples:

- Maintainer App token scope and identity;
- pre-activation maintenance skip;
- activated dry safe run;
- App-authored merge triggers downstream main workflows;
- production environment reviewer/protection;
- deployed `/ready`/`/exchange` smoke;
- rollback/disable path;
- external-extension lifecycle current-state/restart recovery against the actual Durable Object storage backend;
- lifecycle stream contention, storage growth, early-event audit continuity, suspension/rollback recovery, and compact projection rebuild.

이 evidence가 없으면 code branch의 GREEN을 operational completion으로 표현하지 않습니다. Lifecycle unit tests의 in-memory storage adapter와 O(1) storage-cardinality proof는 실제 Durable Object p95나 transaction compatibility를 대체하지 않습니다.

## 4. Test-first workflow

모든 behavior/security defect는 가능한 한 다음 순서로 처리합니다.

```text
exact failing evidence
→ smallest realistic RED reproduction
→ verify RED fails for expected reason
→ smallest root-cause implementation
→ focused GREEN
→ full release verification
→ exact-head GitHub checks
→ protected/operational proof when applicable
```

테스트가 실제 behavior를 검증하지 않고 문자열을 과하게 고정해 valid implementation을 막는다면 test contract 자체의 root cause를 설명하고 좁게 수정합니다. 테스트를 GREEN으로 만들기 위해 security requirement를 낮추지는 않습니다.

External-extension lifecycle 변경은 특히 다음 RED를 보존합니다: illegal edge, stale/gapped expected version, concurrent CAS, cross-extension/artifact substitution, >128-transition audit continuity, malformed/truncated/tampered head/event/snapshot, retention of forbidden secret/product/reasoning content, current projection tail loss, transaction-time idempotency race, old exact replay after later head movement, and preflight miss → competing exact activation commit → fresh evidence failure. Digest 작업을 짧은 storage transaction 내부로 옮겨 race test를 GREEN으로 만드는 것도 허용하지 않습니다.

## 5. Exact-head acceptance

GitHub CI가 acceptance evidence가 되려면:

1. PR의 current `head.sha`를 fresh read합니다.
2. checkout은 그 exact SHA를 지정합니다.
3. repository code 실행 전 `git rev-parse HEAD` equality를 확인합니다.
4. workflow conclusion이 terminal success여야 합니다.
5. check가 실제로 실행한 revision을 분류합니다.
6. head가 바뀌면 predecessor run은 historical diagnostic evidence로만 유지합니다.

Synthetic merge revision test는 통합 호환성에 유용하지만 immutable-head evidence로 mislabel하지 않습니다.

## 6. Live-base and stack testing

base-sensitive logic은 PR event의 snapshot만 사용하지 않습니다.

- named base branch live tip을 independently resolve;
- initial validation과 final acceptance 사이 base movement 검출;
- stacked PR의 immediate predecessor tip 확인;
- early retarget을 이용해 check를 인위적으로 생성하지 않음;
- base vulnerability는 baseline, head-introduced vulnerability는 regression으로 분류.

## 7. Security test catalog

### Authentication / authorization

- wrong issuer/audience/owner/repository;
- exact ref mismatch;
- paired workflow SHA mismatch;
- reusable claim orphan/mixing;
- expired/replayed token;
- missing App installation;
- wrong reviewer App identity;
- insufficient maintainer permission.

### Input / parsing

- oversized JWT segments;
- malformed base64url;
- oversized/chunked JSON;
- duplicate JSON keys in retained evidence;
- malformed UTF-8;
- bidi/control characters in model-created metadata;
- symlink/hardlink/path traversal/race-prone files;
- external-extension lifecycle payloads containing forbidden prompt plaintext, raw product data, secret-like values, hidden reasoning, or provider credentials;
- forged lifecycle stream/artifact identity, digest, transition ID, persisted request digest, event digest, current head, or audit tail.

### Network / egress

- non-GitHub lookalike origin;
- userinfo/port/path/query/fragment confusion;
- redirect;
- stalled upstream;
- overlarge/unknown-length response body.

### Automation / supply chain

- mutable Action refs;
- stale workflow source;
- repair-workflow resurrection;
- model runner receiving repository credential;
- artifact substitution;
- patch changed between runners;
- unreviewed lifecycle script execution.

## 8. Reliability and concurrency tests

- concurrent rate-limit requests consume one transactional budget;
- delayed alarm does not delete active new state;
- publisher branch raced before creation → expected-absence lease rejects;
- branch advanced before cleanup → exact-head deletion lease rejects;
- PR create response lost/malformed → cleanup recovers only uniquely owned identity;
- PR queue changes after generation → publication fails closed;
- base moves after proposal → publication fails closed;
- another writer moves target branch before repository edit → stale mutation rejected;
- two external-extension lifecycle writers that observed the same version/head yield one CAS winner; the loser cannot auto-rebase;
- exact same lifecycle transition racing through preflight yields one accepted event plus a cryptographically verified replay, not two appends;
- same lifecycle transition ID with different semantics conflicts even when both writers pass preflight;
- if a competing exact `active` transition commits while another writer is awaiting fresh Policy / Approval or owner evidence, the latter rechecks durable exact replay before propagating evidence failure; a non-identical or unverifiable transition remains failed closed;
- full audit verification catches retained-prefix truncation while current projection stays O(1) by verifying only its exact bound tail.

## 9. LLM-dependent tests

Live model tests are scheduled/bounded and use `NVIDIA_NIM_API_KEY`, never `COPILOT_GITHUB_TOKEN`.

- deterministic security/governance gates must not depend solely on live model availability.
- model output is untrusted and schema/budget/evidence-bound.
- provider/model/reasoning changes are versioned evidence where material.
- `contextual-orchestrator` routing should be preferred for production model paths without widening Noema credential boundaries.
- model test failure due provider outage is classified separately from deterministic source regression.

## 10. Realistic acceptance scenarios

### Scenario A — stale successful CI

Given PR head B and successful CI only for head A, merge decision must remain blocked.

### Scenario B — same-name foreign check

A third-party App publishes `verify: success`; required GitHub Actions `verify` is absent. Merge remains blocked.

### Scenario C — model says approve

CodeRabbit/LLM returns `approve` text/status but no eligible formal review exists. Model evidence is retained; applicable approval requirement remains unsatisfied.

### Scenario D — stack base advances

Head is unchanged but predecessor/base tip moves. Base-sensitive validation is rerun; old base evidence is not called current.

### Scenario E — pending review with other work

One PR waits for reviewer. Scheduler defers that action and continues another PR/docs/security/product task in the same invocation.

### Scenario F — concurrent proposal publication

Another actor creates or advances the intended proposal ref. Conditional push/delete prevents overwrite or foreign-ref deletion.

### Scenario G — lifecycle restart and replay

A lifecycle reaches `active`, the process/repository object is reconstructed on the same Durable Object storage, and current state plus complete audit remain verifiable without client-supplied current state or mutable issue prose. Replaying an older exact transition returns that historical event/snapshot; new activation still rechecks live owner evidence.

### Scenario H — lifecycle evidence drift race

Two exact activation writers both miss the transition index. Writer A verifies current evidence and commits. Before writer B's live evidence check completes, the owner evidence is revoked. Writer B returns verified immutable replay of A rather than retroactively invalidating the historical event. If A committed different semantics or the durable event/head/tail fails integrity, B fails closed.

## 11. Documentation tests

Canonical architecture documentation is executable product surface because agents/operators use it to make security decisions.

`test/documentation-architecture-contract.test.ts` requires the PRD, TRD, root Architecture, ADR index, UML, ERD, traceability, test strategy and operability documents. Additional architecture tests bind route claims to actual source modules and Wrangler bindings.

Documentation test should verify **material invariants**, not unstable prose formatting or temporary run IDs. External-extension lifecycle docs must distinguish protected admission behavior from Draft lifecycle evidence, foreign-owner references from Noema truth, compact projection from full audit/recovery, and source integration from real Durable Object/performance/release/pilot evidence.

## 12. Release acceptance

`npm run release:verify` is necessary but not sufficient for release. A release additionally requires all repository policy/security/review/package/provenance gates on the same integrated protected source. Production release/deploy evidence cannot be replaced by non-strict KPI skip output.

No version bump is appropriate for documentation or an isolated PR branch while protected integrated release acceptance remains incomplete.

## 13. Failure triage

For any failed gate:

1. read full logs/error and executed revision;
2. reproduce/isolate the first failing boundary;
3. identify recent relevant source/config/base changes;
4. form one falsifiable hypothesis;
5. enumerate distinct remedies and verify feasibility;
6. test-first implement the smallest source fix;
7. re-run focused test, full verification and exact-head check;
8. if the item is waiting, rotate to other safe work.

Flake, infrastructure, provider and product regressions are not conflated without evidence.

## 14. Credential-exchange coverage truth

Issue #84's historical broad V8 coverage exclusions are no longer protected-main truth. Protected `main` `15ccf1226fe92468dc0a0e3761f3fe8bb328f2a9` contains no `v8 ignore` directive in `src/index.ts` after the bounded #404, #405, #406 and #408 coverage/security slices.

The surviving test contract is therefore stricter than the historical plan:

- credential-exchange, OIDC, replay/request, and GitHub App runtime branches remain ordinary owned production coverage targets;
- a newly introduced broad `/* v8 ignore start */` / `/* v8 ignore stop */` region in owned credential/security code is a regression, not an acceptable way to restore 100%;
- residual unreachable branches should be removed or their contracts tightened when proven impossible rather than excluded;
- realistic public `/exchange` paths are preferred over exporting private helpers solely for coverage;
- malformed OIDC/JWKS/GitHub upstream material must keep its fail-closed error classification while being measured;
- protected-main coverage acceptance still requires exact configured 100% statement/branch/function/line evidence on the current source head; predecessor #404/#405/#406/#408 results remain historical once source moves.

Canonical traceability and documentation-fitness records must describe this as implemented protected-source behavior, not as an active broad-exclusion gap. This documentation correction does not by itself close issue #84 until the surviving canonical graph integrates and the protected-main documentation/coverage contract is exercised.
