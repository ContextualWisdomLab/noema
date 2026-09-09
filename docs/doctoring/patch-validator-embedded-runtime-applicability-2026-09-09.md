# Patch-validator embedded-runtime applicability review — 2026-09-09

## Problem and exact evidence

Noema patch-validator image run `34328891694` on exact source `b1c33d1c0d3ff0dc6d3d5fae6d4d8dd1ea56270d` completed authenticated BuildKit cache import/hit/export, exact image build, static-runtime inspection, isolated smoke execution, SBOM generation, and raw binary/embedded-runtime scans before the final exact-receipt verifier failed. The retained verification artifact is `10095371779` with artifact digest `sha256:21d9d7a7403ae4be1af21b4a769baa23d77714b2239cbc4c7975ac498728c7b4`.

The raw Grype receipt contained five distinct classes that must not be handled as one generic scanner exception:

- c-ares `1.34.6` → `CVE-2026-33630`;
- SQLite `3.53.3` → `BIT-sqlite-2024-0232`, `BIT-sqlite-2025-29088`, and `BIT-sqlite-2025-6965`;
- V8 `13.6.233.17-node.51`, normalized to reviewed CPE version `13.6.233.17` → `CVE-2026-85046` plus three already reviewed legacy advisories;
- zlib `1.3.2.1-motley-3246f1b` → `GHSA-g857-hhfv-j68w`;
- nghttp2 `1.69.0` → the already reviewed nghttpx-only `CVE-2026-58055`.

Raw scanner evidence remains retained. Applicability review creates a derived receipt and is permitted only when exact component identity, CPE provenance, scanner identity, finding ID, and independently reviewed evidence all agree.

## Decisions

### c-ares: repair the vulnerable component; do not suppress the finding

Upstream c-ares 1.34.7 is explicitly a security release fixing `CVE-2026-33630`, a remotely triggerable use-after-free/double-free in `ares_getaddrinfo()` over TCP. The exact validator runtime contains c-ares 1.34.6, so the finding is applicable. c-ares 1.34.8 retains the security fix and restores API compatibility after 1.34.7's unintended callback-signature break.

The validator therefore keeps Node 24.19.0 as its reviewed executable identity but overlays the official c-ares 1.34.8 release source into Node's vendored `deps/cares` tree before compilation. The release tarball is authenticated by SHA-256 `c222b6d681096f9444d2c4863d2c1174019e27cacca0a4a5c114d36dd7d7bf78`, and the built runtime must report `process.versions.ares === "1.34.8"`. This avoids converting an actually vulnerable component into an applicability exception.

Rejected alternatives: ignoring the finding because the smoke container runs with `--network none`; weakening the severity threshold; or accepting c-ares 1.34.6 based on elapsed isolation evidence. Those alternatives make deployment configuration part of binary vulnerability truth and are not accepted.

### SQLite: exact runtime is outside all three reviewed vulnerable ranges

The embedded runtime is SQLite 3.53.3. Reviewed records bound the findings as follows:

- `CVE-2024-0232` / `BIT-sqlite-2024-0232`: affected SQLite 3.43.0 through 3.43.1; fixed in 3.43.2.
- `CVE-2025-29088` / `BIT-sqlite-2025-29088`: SQLite 3.49.0 before 3.49.1.
- `CVE-2025-6965` / `BIT-sqlite-2025-6965`: SQLite versions before 3.50.2.

For this exact 3.53.3 component/CPE, those scanner matches are version-range false positives. The derived applicability receipt may remove only those three exact finding IDs and only when the component remains exactly SQLite 3.53.3 with the reviewed CPE and NVD-CPE Grype provenance. Any other SQLite finding remains blocking.

### zlib: scanner matched an advisory for a different product/ecosystem

`GHSA-g857-hhfv-j68w` / `CVE-2026-27820` is published by `ruby/zlib` for the RubyGems package `zlib`; the affected code is Ruby's `Zlib::GzipReader` wrapper. Noema's runtime component is Node's embedded upstream C zlib library and is represented by a zlib CPE, not a RubyGems PURL. The derived applicability receipt may remove only this exact GHSA when the exact Node zlib component/CPE and NVD-CPE Grype provenance match. Other zlib findings remain blocking.

### V8 CVE-2026-85046: exact Node branch lacks the vulnerable implementation path

The primary V8 fix for Chromium issue 542403045 changes `JSCallReducer::ReduceArraySort` and `MaglevGraphBuilder::TryReduceArrayPrototypeSort` so mixed receiver element kinds are not used by the inlined `Array.prototype.sort` path. The exact signed Node.js v24.19.0 release commit is `cdc1b38d40cb567b7ad0b39c86addf830a0af0ae`. Inspection of that release's vendored V8 `deps/v8/src/compiler/js-call-reducer.cc` and `deps/v8/src/maglev/maglev-graph-builder.cc` finds neither affected reducer. Thus the generic V8 CPE range is not sufficient evidence that Node 24.19.0's `13.6.233.17-node.51` branch contains the vulnerable path.

The derived applicability receipt may remove `CVE-2026-85046` only for exact Node 24.19.0, exact V8 `13.6.233.17-node.51`, reviewed CPE `cpe:2.3:a:google:v8:13.6.233.17:*:*:*:*:*:*:*`, normalized scanner artifact version `13.6.233.17`, Grype 0.116.1, and NVD-CPE provenance. A Node/V8/CPE/scanner/finding mismatch must fail closed.

## Risk and follow-up

Applicability review is deliberately exact-version rather than an open-ended semantic-version rule. A future Node, V8, SQLite, zlib, scanner, or CPE change loses the exception automatically and must be reviewed again. c-ares remains a source repair, not an exception. The image lane must rebuild from the new exact head and prove the patched c-ares version, raw scan retention, derived reviewed receipt, strict final verifier, isolation smoke, SBOM, and unchanged image/source binding before integration.

Noema does not take ownership of scanner authority, quarantine policy, outbound control, or provider routing through this review. It consumes scanner evidence and applies only its own exact runtime applicability decision at the validator acceptance boundary.

## Traceability / references

c-ares. (2026, July 6). *c-ares version 1.34.7 — security release*. https://c-ares.org/changelog.html

c-ares. (2026, July 7). *c-ares version 1.34.8*. https://github.com/c-ares/c-ares/releases/tag/v1.34.8

GitHub. (2026, April 16). *Buffer overflow vulnerability in Zlib::GzipReader (GHSA-g857-hhfv-j68w)*. https://github.com/ruby/zlib/security/advisories/GHSA-g857-hhfv-j68w

National Institute of Standards and Technology. (2024, January 16; modified 2026, June 17). *CVE-2024-0232*. National Vulnerability Database. https://nvd.nist.gov/vuln/detail/CVE-2024-0232

Open Source Vulnerabilities. (2025). *BIT-sqlite-2025-29088*. https://osv.dev/vulnerability/BIT-sqlite-2025-29088

Open Source Vulnerabilities. (2025; modified 2026). *BIT-sqlite-2025-6965*. https://osv.dev/vulnerability/BIT-sqlite-2025-6965

V8 Project. (2026, August 7). *[compiler] Don't inline Array.prototype.sort on mixed elements kinds* (commit `e0562d87ad9c17042b581582c99237d798572e67`). https://github.com/v8/v8/commit/e0562d87ad9c17042b581582c99237d798572e67

Node.js. (2026, August 3). *Node.js v24.19.0 Krypton (LTS) release* (signed tag; commit `cdc1b38d40cb567b7ad0b39c86addf830a0af0ae`). https://github.com/nodejs/node/releases/tag/v24.19.0
