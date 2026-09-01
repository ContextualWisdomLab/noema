# Noema Licensing and IP Transfer

- **Status:** Repository rights policy/evidence baseline; source-license decision is Apache-2.0 on PR #530 until protected integration. This is not acquisition or transfer legal clearance.
- **Scope:** Noema source rights, package/container metadata, third-party obligations, contributor/IP provenance, release distribution, and acquisition transfer evidence.
- **Decision authority:** Repository automation may detect, authenticate, inventory, and compare evidence. The repository owner has explicitly selected Apache License 2.0 for Noema source; future outbound-license changes and transfer-rights decisions remain owner/legal governance actions.

## 1. Core invariant

**Public source availability is not a grant of rights by itself.** The grant comes from the controlling repository rights file. On PR #530, root `LICENSE` and `package.json` declare Apache-2.0 for Noema source. Until that exact head integrates, protected `main` remains the currently shipped source-rights authority.

Noema keeps source licensing, third-party obligations, and transfer authority separate:

- automation may inventory, hash, compare, and **fail closed** on missing, ambiguous, or contradictory rights evidence;
- automation must never infer or silently change an outbound license;
- the explicit owner decision for Noema source is Apache-2.0 and is represented only when root `LICENSE` and package metadata agree;
- dependency/tool licenses are not relicensed by the Noema source grant;
- missing, unknown, incompatible, or contradictory third-party or transfer evidence blocks distribution/acquisition claims rather than becoming a technical PASS.

This document is not legal advice. It specifies the evidence and authority boundary enforced by Noema technical controls.

## 2. Repository rights declaration

An approved outbound posture must be discoverable in repository source and agree across release surfaces.

For the current owner decision:

1. root `LICENSE` contains Apache License 2.0 for Noema source;
2. `package.json` declares SPDX expression `Apache-2.0`; `"private": true` remains only an npm publication safeguard;
3. release/container metadata that declares rights must express the same source posture for the exact artifact/revision only when that artifact is actually covered by the same grant;
4. third-party licenses and notices remain separate evidence and are never absorbed into Apache-2.0 by metadata;
5. licensing changes are governance changes requiring reviewed source mutation, release-impact analysis, and evidence regeneration.

### 2.1 `package.json` alignment

- use a valid **SPDX** expression when approved terms have one;
- use `SEE LICENSE IN <filename>` for approved custom terms stored in a bounded repository file;
- use `UNLICENSED` only when package metadata intentionally grants no use rights;
- `"private": true` is a publication safeguard, not an outbound-rights decision.

For Noema source, `Apache-2.0` is the selected SPDX expression. Automation may verify syntax, paths, hashes, and declared relationships. It must not infer legal equivalence from filenames or metadata labels alone.

### 2.2 OCI and release metadata

**OCI image license metadata** and equivalent archive/package/registry fields are artifact claims, not independent legal authority.

- `org.opencontainers.image.licenses` or an equivalent field must agree with the source-rights decision only when the exact artifact is covered by that source grant and its bundled third-party obligations have been accounted for;
- a source-level Apache-2.0 declaration does not license third-party binaries, dependencies, base images, fonts, models, datasets, or assets;
- invented `LicenseRef-*`, repository visibility, `private: true`, SBOM guesses, or scanner classifications cannot create rights;
- source/revision/provenance labels that do not claim licensing authority may remain when truthful and exact-revision bound.

## 3. Protected exact-release `artifact_rights_metadata` contract

Protected source implements an exact-release rights receipt named `artifact_rights_metadata`. The receipt is technical evidence, never independent legal authority.

The authenticated receipt binds at least:

- exact repository identity;
- SemVer/release tag where applicable;
- full release commit SHA;
- immutable artifact identity/digest;
- artifact rights annotations when present;
- SHA-256 identity of retained receipt bytes.

The parser/evidence boundary is fail closed:

- read the same stable bytes used for digest verification;
- decode with fatal **UTF-8** handling;
- reject malformed JSON;
- reject **duplicate** decoded JSON keys before ordinary object parsing can select a last value;
- reject symlink/path/descriptor substitution and digest mismatch;
- reject artifact annotations that contradict the approved repository/artifact rights decision;
- when an approved SPDX expression applies to an exact artifact, any artifact license annotation must match that expression exactly.

A receipt, scanner, SBOM, or annotation never creates owner/legal authority. It proves only identity and consistency with an already approved decision.

## 4. Third-party software and NOTICE obligations

Every distributable or transferable exact release must bind third-party rights evidence to the same source/artifact identity used by release provenance.

Required evidence includes:

- exact-release **SBOM** and dependency graph;
- dependency-license inventory for direct, transitive, bundled, static, runtime, development, and build assets where policy requires it;
- required attribution and **NOTICE** material, preserving upstream notices when terms require them;
- explicit disposition for unknown, custom, copyleft, source-available, dual-licensed, or otherwise policy-sensitive terms;
- classifier/scanner tool identity and evidence source;
- hashes/immutable identities tying license and NOTICE artifacts to the release/SBOM.

`npm run release:dependency-license-inventory` produces deterministic lockfile-bound inventory evidence. The inventory records package metadata; it does **not** establish compatibility, satisfy upstream NOTICE obligations, or create owner/legal permission.

### 4.1 Current GPL-family tooling finding

The current `package-lock.json` contains optional development/build packages on the `wrangler → miniflare → sharp → @img/sharp-libvips-*` path whose declared license is `LGPL-3.0-or-later`; `@img/sharp-wasm32` declares `Apache-2.0 AND LGPL-3.0-or-later AND MIT`. These packages are not relicensed by Noema's Apache-2.0 source license.

Repository evidence also shows that the patch-validator runtime-image boundary explicitly excludes `wrangler`, `workerd`, and `miniflare`; therefore this finding must not be overstated as proof that LGPL code is bundled into that runtime image. It is nevertheless an inbound development/build-tooling policy gap because ContextualWisdomLab does not accept GPL-family software as the normal dependency baseline. Distribution/acquisition readiness must remain fail closed until this dependency path is removed/replaced or an explicit repository-level exception is approved for the exact use and distribution model.

Unknown or unresolved obligations fail closed for distribution/acquisition readiness. Vulnerability or provenance success does not prove license compatibility.

## 5. Contributor and IP ownership provenance

Acquisition readiness requires evidence that the seller has authority to transfer the relevant IP. The transfer evidence set should cover, as applicable:

- material source **contributor** identity and commit provenance;
- employee-created work ownership under applicable employment/IP terms;
- contractor/vendor **assignment** or work-made-for-hire evidence;
- inbound contribution/license/assignment terms for external contributions;
- generated-code, model-output, dataset, design, font, media, and provider terms where material;
- vendored/copied third-party code outside the dependency graph;
- trademark, domain, signing key, GitHub App, cloud account, and other operational ownership needed to transfer the running product.

A Git commit proves repository history, not legal ownership. Missing transfer provenance remains external evidence and must not be synthesized. The Apache-2.0 source grant does not by itself prove acquisition-transfer ownership.

## 6. Acquisition transfer evidence

The protected acquisition lane retains `artifacts/acquisition/transfer-evidence.json`. Presence of that file alone is not proof that its claims are authenticated.

The machine-checkable transfer contract binds, at minimum:

- repository identity and exact source/release revision;
- approved owner/legal decision identifier;
- controlling `LICENSE`/custom-rights file path and SHA-256 when applicable;
- `package.json` rights declaration plus package-metadata hash;
- exact-release `artifact_rights_metadata` path and SHA-256 when an artifact exposes rights metadata;
- exact-release SBOM identity;
- dependency-license and NOTICE/attribution artifact identities;
- contributor/IP ownership and assignment evidence references;
- outstanding exceptions/legal holds/unresolved third-party terms;
- evidence owner, review timestamp, and retention/rotation policy.

Protected acquisition-integrity code authenticates this consistency boundary and rejects parser ambiguity, but it does not manufacture transfer authority.

## 7. Release and acquisition gates

### Release-distribution gate

Before publishing an artifact, the exact integrated protected source must have a reviewed distribution posture and applicable third-party obligations for that artifact. Internal test builds do not create distribution rights. If a package/image/archive carries a rights field, it must agree with approved source/package posture and exact-release `artifact_rights_metadata` before publication.

### Acquisition final gate

```text
owner source-license decision
→ repository rights file
→ package.json rights metadata
→ exact-release artifact_rights_metadata when applicable
→ release/container rights metadata when present
→ exact-release SBOM
→ dependency-license + NOTICE inventory
→ contributor/IP ownership + assignment provenance
→ transfer-evidence.json
→ acquisition audit
```

Each arrow requires independent identity/consistency evidence. A mismatch, missing required record, malformed/ambiguous JSON, or unresolved right is a fail-closed condition.

## 8. Current evidence and residual gap — 2026-09-01

Protected `main@5aad3e410703faaf52882e2f33fadd25d217bcdd` still has no root `LICENSE` and no `package.json` license field. PR #530 now carries the explicit owner-selected Apache-2.0 source posture:

- root `LICENSE`: Apache License 2.0;
- `package.json`: `license: "Apache-2.0"` while retaining `private: true`;
- root `README.md`: customer-facing Apache-2.0 source-license statement and separate third-party obligation boundary.

Those declarations are candidate truth until #530 integrates; they are not predecessor evidence for protected main.

Current residual gaps remain deliberately separate:

- the lockfile contains the GPL-family development/build tooling path described in §4.1 and therefore does not yet satisfy the organization default inbound-license policy;
- exact-release dependency/NOTICE evidence must still prove the actual distributed artifact contents;
- contributor ownership/assignment and acquisition-transfer evidence remain separate from source licensing;
- release/publication/deployment evidence remains separate from repository-source rights;
- no source file, README sentence, scanner result, or successful CI run may upgrade those missing evidence classes into a commercial or legal PASS.

Issue #5 carries acquisition owner/legal and ownership/assignment evidence. Issue #66 carries remaining release/publication, NOTICE and provenance/activation boundaries. The source-license decision narrows the gap but does not close those issues.

## 9. Non-goals

Noema automation must not:

- silently choose or change an outbound license without an owner-authorized source change;
- emit package/container/release license fields merely to make metadata look complete;
- treat `UNLICENSED`, `private`, repository visibility, `LicenseRef-*`, or a copyright notice as interchangeable;
- infer dependency-license compatibility from filenames or scanner guesses alone;
- treat the repository's Apache-2.0 source license as a license for third-party packages or bundled artifacts;
- fabricate contributor consent, employment ownership, contractor assignment, or third-party permission;
- remove NOTICE/attribution obligations to make an audit pass;
- accept duplicate-key or malformed evidence because one parser selects a convenient last value;
- weaken vulnerability, provenance, review, or governance gates because rights evidence is incomplete.

## 10. Primary references

GitHub. (2026). *Licensing a repository*. GitHub Docs. https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository

The Apache Software Foundation. (2004). *Apache License, Version 2.0*. https://www.apache.org/licenses/LICENSE-2.0

npm, Inc. (2026). *package-lock.json*. npm Docs. https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json

npm, Inc. (2026). *package.json — license*. npm Docs. https://docs.npmjs.com/files/package.json/

SPDX Workgroup. (2024). *SPDX Specification 3.0.1: Annex D — SPDX license expressions*. Linux Foundation. https://spdx.github.io/spdx-spec/v3.0.1/annexes/spdx-license-expressions/

Open Container Initiative. (2025). *The OpenContainers Annotations Spec*. Open Container Initiative. https://specs.opencontainers.org/image-spec/annotations/
