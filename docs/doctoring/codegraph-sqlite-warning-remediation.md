# CodeGraph SQLite Warning Remediation

## Decision

Noema's direct CodeGraph sandbox launchers must not pass `--disable-warning=ExperimentalWarning` merely to keep hosted logs quiet. The current lock remains `@colbymchenry/codegraph` 1.4.1; the repair removes only Noema's obsolete warning suppression and retains the upstream-required `--liftoff-only` V8 flag.

## Exact root cause and runtime evidence

CodeGraph v1.4.1 is published as a self-contained bundle. Its tagged `scripts/build-bundle.sh` defaults the embedded runtime to Node `v24.16.0`, and the tagged release workflow invokes that build script without overriding the Node version for each platform. This means the lock-pinned Linux package Noema mounts into its quarantine boundary carries Node v24.16.0 rather than inheriting an ambient host Node.

Node changed `node:sqlite` from experimental Stability 1.1 to release-candidate Stability 1.2 in v24.15.0. The exact Node v24.14.0 `lib/sqlite.js` still imports `emitExperimentalWarning` and calls `emitExperimentalWarning('SQLite')`; the exact Node v24.16.0 file contains only the internal SQLite binding export and no warning emitter. Noema's canonical hosted development runtime is newer again, Node v24.19.0, and the executable regression loads `node:sqlite` in that exact hosted runtime and rejects either `ExperimentalWarning` or the former `SQLite is an experimental feature` diagnostic.

Therefore a CodeGraph version bump is neither necessary nor sufficient for this warning repair. The warning source disappeared in the embedded Node line before the currently pinned CodeGraph 1.4.1 bundle was published. Upstream CodeGraph main still carries compatibility warning-suppression logic for other launch paths and older Node lines; that does not justify keeping a blanket suppression in Noema's reviewed direct launcher when Noema's pinned bundle identity already excludes the emitting runtime.

## Boundary

This decision does not change CodeGraph's graph semantics, its version, telemetry/network policy, the quarantine container, source-copy limits, process/output/time quotas, credential stripping, or the `--liftoff-only` mitigation for V8 tree-sitter WASM compilation. It also does not authorize provider routing, security verdict ownership, release/deployment authority, or a mutable foreign dependency.

If a future pinned CodeGraph bundle changes its embedded Node line and an `ExperimentalWarning` reappears, the hosted regression must fail visibly. The response is to identify and repair the new emitting API/runtime or link the owning upstream defect; reintroducing category-wide warning suppression is not the default remediation.

## Traceability

- CodeGraph v1.4.1 tagged bundle recipe: `scripts/build-bundle.sh` defaults `NODE_VERSION` to `v24.16.0`.
- CodeGraph v1.4.1 tagged release workflow: `.github/workflows/release.yml` calls `bash scripts/build-bundle.sh "$t"` for every platform without a Node-version override.
- Node v24.14.0 `lib/sqlite.js`: emits the `SQLite` experimental warning.
- Node v24.16.0 `lib/sqlite.js`: no experimental-warning emitter remains.
- Node v24.16.0 SQLite documentation records the v24.15.0 promotion to Stability 1.2 (release candidate).
- Noema `.github/workflows/ci.yml` pins the canonical hosted Node toolchain to v24.19.0.

## References

Node.js Contributors. (2026). *SQLite: Node.js v24.16.0 documentation*. OpenJS Foundation. https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html

Node.js Contributors. (2026). *lib/sqlite.js (v24.14.0)*. `nodejs/node`. https://github.com/nodejs/node/blob/v24.14.0/lib/sqlite.js

Node.js Contributors. (2026). *lib/sqlite.js (v24.16.0)*. `nodejs/node`. https://github.com/nodejs/node/blob/v24.16.0/lib/sqlite.js

McHenry, C. (2026). *CodeGraph v1.4.1 build bundle recipe*. `colbymchenry/codegraph`. https://github.com/colbymchenry/codegraph/blob/v1.4.1/scripts/build-bundle.sh

McHenry, C. (2026). *CodeGraph v1.4.1 release workflow*. `colbymchenry/codegraph`. https://github.com/colbymchenry/codegraph/blob/v1.4.1/.github/workflows/release.yml
