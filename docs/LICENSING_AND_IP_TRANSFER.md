# Noema Licensing and IP Transfer

- **Status:** Protected policy/evidence baseline; not legal clearance. Active PR #495 adds the npm dependency-license inventory generator described in section 4.
- **Scope:** Noema source rights, package/container metadata, third-party obligations, contributor/IP provenance, release distribution, and acquisition transfer evidence.
- **Decision authority:** Repository automation may detect, authenticate, inventory, and compare evidence. The outbound-license and transfer-rights decision belongs to the authorized **owner/legal** function.

## 1. Core invariant

**Public source availability is not a grant of rights.** Repository visibility, cloneability, package installation, an SBOM, scanner output, or successful CI does not establish permission to use, modify, redistribute, sublicense, or transfer Noema.

Noema therefore keeps legal authority separate from technical evidence:

- automation may inventory, hash, compare, and **fail closed** on missing, ambiguous, or contradictory rights evidence;
- automation must never infer or silently choose an outbound license;
- an explicit owner/legal decision is required before a license posture is represented as approved;
- missing, unknown, incompatible, or contradictory rights evidence blocks distribution/acquisition claims rather than becoming a technical PASS.

This document is not legal advice. It specifies the evidence and authority boundary enforced by Noema technical controls.

## 2. Repository rights declaration

An approved outbound posture must be discoverable in repository source and agree across release surfaces.

At minimum:

1. a root `LICENSE` file or explicitly approved custom-rights file contains controlling source terms when repository text grants rights;
2. `package.json` expresses the same declared posture without inventing broader rights;
3. release/container metadata that declares rights expresses the same approved posture for the exact artifact/revision;
4. decision owner, approval record, effective date, and scope are retained as acquisition evidence instead of inferred from a filename;
5. licensing changes are governance changes requiring reviewed source mutation, release-impact analysis, and evidence regeneration.

### 2.1 `package.json` alignment

- use a valid **SPDX** expression when approved terms have one;
- use `SEE LICENSE IN <filename>` for approved custom terms stored in a bounded repository file;
- use `UNLICENSED` when package metadata intentionally grants no use rights;
- `"private": true` is a publication safeguard, not an outbound-rights decision.

Automation may verify syntax, paths, hashes, and declared relationships. It must not infer legal equivalence from filenames or metadata labels alone.

### 2.2 OCI and release metadata

**OCI image license metadata** and equivalent archive/package/registry fields are artifact claims, not independent legal authority.

- `org.opencontainers.image.licenses` or an equivalent field must agree with the owner/legal decision and repository/package declaration for that exact release scope;
- while the outbound-rights decision is unresolved, artifact license metadata **must remain absent** unless an authorized decision explicitly requires a truthful bounded declaration;
- invented `LicenseRef-*`, repository visibility, `private: true`, SBOM guesses, or scanner classifications cannot create rights;
- source/revision/provenance labels that do not claim licensing authority may remain when truthful and exact-revision bound.

## 3. Protected exact-release `artifact_rights_metadata` contract

Protected source implements an exact-release rights receipt named `artifact_rights_metadata`. The acquisition-integrity work that introduced this boundary is already integrated on protected main. The receipt is technical evidence, never legal authority.

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
- reject an OCI license annotation under unresolved/custom/no-rights authority when the approved contract requires no annotation;
- when an approved SPDX expression exists, any artifact license annotation must match that expression exactly.

A receipt, scanner, SBOM, or annotation never creates owner/legal authority. It proves only identity and consistency with an already approved decision.

## 4. Third-party software and NOTICE obligations

Every distributable or transferable exact release must bind third-party rights evidence to the same source/artifact identity used by release provenance.

Required evidence includes:

- exact-release **SBOM** and dependency graph;
- dependency-license inventory for direct, transitive, bundled, static, and runtime assets where applicable;
- required attribution and **NOTICE** material, preserving upstream notices when terms require them;
- explicit disposition for unknown, custom, copyleft, source-available, dual-licensed, or otherwise policy-sensitive terms;
- classifier/scanner tool identity and evidence source;
- hashes/immutable identities tying license and NOTICE artifacts to the release/SBOM.

PR #495 adds `npm run release:dependency-license-inventory` for the npm lockfile slice. The generated `artifacts/release/dependency-licenses.json` is deterministic and bound to the SHA-256 of the exact `package-lock.json`. It records each non-root locked package path, package name, version, declared license, resolved artifact, integrity value, and npm `dev`/`optional`/`devOptional` classification authority. Present classification values must be booleans; `devOptional` is preserved as `dev_optional` rather than silently collapsed into production classification. Duplicate-key or malformed lockfiles and missing package identity/license fields fail closed. This inventory records package metadata; it does **not** establish compatibility, satisfy upstream NOTICE obligations, or create owner/legal permission.

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

A Git commit proves repository history, not legal ownership. Missing provenance remains external evidence and must not be synthesized.

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

Protected acquisition-integrity code authenticates this consistency boundary and rejects parser ambiguity, but it does not choose the legal posture.

## 7. Release and acquisition gates

### Release-distribution gate

Before publishing an artifact, the exact integrated protected source must have a reviewed distribution posture and applicable third-party obligations for that artifact. Internal test builds do not create distribution rights. If a package/image/archive carries a rights field, it must agree with approved source/package posture and exact-release `artifact_rights_metadata` before publication.

### Acquisition final gate

```text
owner/legal decision
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

## 8. Current evidence and residual gap — 2026-08-23

Protected `main` at `3d4ba0846352b2b10fd4506fa0aea29de32d079f` has no root `LICENSE` file. Protected `package.json` is `"private": true` and has no `license` field. That is evidence of an unresolved licensing/IP-transfer decision, not evidence for MIT, Apache-2.0, proprietary, source-available, or another posture.

Current technical state is intentionally split:

- protected acquisition-integrity code binds `artifact_rights_metadata` to repository/release/artifact identity and rejects duplicate decoded keys, malformed UTF-8/JSON, and inconsistent rights metadata before it can become acquisition evidence;
- protected #407 integration supplies the patch-validator image/runtime/supply-chain implementation and its local SBOM/provenance verification boundary;
- protected #493 integration rejects placeholder, ambiguous, loopback and local-only pilot/commercial authority from saleable-readiness evidence;
- active PR #495 adds reproducible npm lockfile license inventory generation, exact coverage ownership, canonical package-path authority and npm dependency-classification preservation. Until it integrates, that generator remains active-PR truth, not protected-main truth;
- no technical artifact resolves compatibility, upstream NOTICE retention, contributor ownership/assignment, or the outbound-rights decision.

Issue #5 carries the acquisition owner/legal and ownership/assignment evidence gap. Issue #66 carries remaining release/publication, NOTICE and provenance/activation boundaries. Neither documentation nor technical enforcement makes legal clearance pass.

## 9. Non-goals

Noema automation must not:

- pick an outbound license because it appears commercially convenient;
- emit package/container/release license fields merely to make metadata look complete;
- treat `UNLICENSED`, `private`, repository visibility, `LicenseRef-*`, or a copyright notice as interchangeable;
- infer license compatibility from filenames or scanner guesses alone;
- fabricate contributor consent, employment ownership, contractor assignment, or third-party permission;
- remove NOTICE/attribution obligations to make an audit pass;
- accept duplicate-key or malformed evidence because one parser selects a convenient last value;
- weaken vulnerability, provenance, review, or governance gates because rights evidence is incomplete.

## 10. Primary references

GitHub. (2026). *Licensing a repository*. GitHub Docs. https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository

npm, Inc. (2026). *package-lock.json*. npm Docs. https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json

npm, Inc. (2026). *package.json — license*. npm Docs. https://docs.npmjs.com/files/package.json/

SPDX Workgroup. (2024). *SPDX Specification 3.0.1: Annex D — SPDX license expressions*. Linux Foundation. https://spdx.github.io/spdx-spec/v3.0.1/annexes/spdx-license-expressions/

Open Container Initiative. (2025). *The OpenContainers Annotations Spec*. Open Container Initiative. https://specs.opencontainers.org/image-spec/annotations/
