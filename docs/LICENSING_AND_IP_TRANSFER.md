# Noema Licensing and IP Transfer

- **Status:** In review on PR #71; policy/evidence baseline only, not legal clearance or protected-main acceptance.
- **Scope:** Noema source rights, package/container metadata, third-party obligations, contributor/IP provenance, release distribution, and acquisition transfer evidence.
- **Decision authority:** Repository automation can detect, authenticate, inventory and compare evidence. The outbound-license and transfer-rights decision belongs to the authorized **owner/legal** function.

## 1. Core invariant

**Public source availability is not a grant of rights.** Repository visibility, cloneability, package installation, an SBOM, a scanner result or successful CI does not establish permission to use, modify, redistribute, sublicense or transfer Noema.

Noema keeps legal authority separate from technical evidence:

- automation may inventory, hash, compare and **fail closed** on missing, ambiguous or contradictory rights evidence;
- automation must never infer or silently choose an outbound license;
- an explicit owner/legal decision is required before a license posture is represented as approved;
- missing, unknown, incompatible or contradictory rights evidence blocks release-distribution/acquisition claims rather than becoming a technical PASS.

This document is not legal advice. It specifies the evidence and authority boundary enforced by Noema technical controls.

## 2. Repository rights declaration

An approved outbound posture must be represented in discoverable repository source and agree across all release surfaces.

At minimum:

1. a root `LICENSE` file or explicitly approved custom-rights file contains controlling source terms when repository text grants rights;
2. `package.json` expresses the same declared posture without inventing broader rights;
3. release/container metadata that declares rights expresses the same approved posture for the exact artifact/revision;
4. decision owner, approval record, effective date and scope are retained as acquisition evidence instead of inferred from a filename;
5. licensing changes are governance changes requiring reviewed source mutation, release-impact analysis and evidence regeneration.

### 2.1 `package.json` alignment

- use a valid **SPDX** expression when the approved terms have an SPDX expression;
- use `SEE LICENSE IN <filename>` for approved custom terms stored in a bounded repository file;
- use `UNLICENSED` when the package intentionally grants no use rights through npm metadata;
- `"private": true` is a publication safeguard, not an outbound-rights decision.

Automation may verify syntax, paths, hashes and declared relationships. It must not infer semantic legal equivalence from filenames or metadata labels alone.

### 2.2 OCI and release-artifact metadata

**OCI image license metadata** and equivalent archive/package/registry fields are artifact claims, not independent legal authority.

- `org.opencontainers.image.licenses` or an equivalent field must agree with the explicit owner/legal decision and repository/package declaration for that exact release scope;
- while the outbound-rights decision is unresolved, artifact license metadata **must remain absent** unless an authorized decision explicitly requires a truthful bounded declaration;
- invented `LicenseRef-*`, repository visibility, `private: true`, SBOM guesses or scanner classifications cannot create rights;
- source/revision/provenance labels that do not claim licensing authority may remain when truthful and exact-revision bound.

## 3. Exact-release `artifact_rights_metadata`

PR #69 establishes an active technical contract for an exact-release rights receipt named `artifact_rights_metadata`. This receipt is evidence, not legal authority.

The authenticated receipt must bind at least:

- exact repository identity;
- SemVer/release tag where applicable;
- full release commit SHA;
- immutable artifact identity/digest;
- artifact rights annotations when present;
- SHA-256 identity of the retained receipt bytes.

The parser/evidence boundary is fail closed:

- read the same stable bytes used for digest verification;
- decode with fatal **UTF-8** handling;
- reject malformed JSON;
- reject **duplicate** decoded JSON keys before ordinary object parsing can select a last value;
- reject symlink/path/descriptor substitution and digest mismatch;
- reject an OCI license annotation under unresolved/custom/no-rights authority when the approved contract requires no annotation;
- when an approved SPDX expression exists, any artifact license annotation must match that expression exactly.

A receipt, scanner, SBOM or annotation never creates owner/legal authority. It only proves identity and consistency with an already approved decision. PR #69 remains active-PR technical evidence until protected integration.

## 4. Third-party software and NOTICE obligations

Every distributable or transferable exact release must bind third-party rights evidence to the same source/artifact identity used by release provenance.

Required evidence includes:

- exact-release **SBOM** and dependency graph;
- dependency-license inventory for direct/transitive/bundled/static/runtime assets where applicable;
- required attribution and **NOTICE** material, preserving upstream notices when terms require them;
- explicit disposition for unknown, custom, copyleft, source-available, dual-licensed or otherwise policy-sensitive terms;
- classifier/scanner tool identity and evidence source;
- hashes/immutable identities tying license and NOTICE artifacts to the release/SBOM.

Unknown or unresolved obligations fail closed for distribution/acquisition readiness. Vulnerability or provenance success does not prove license compatibility.

## 5. Contributor and IP ownership provenance

Acquisition readiness requires evidence that the seller has authority to transfer the relevant IP. The transfer evidence set should cover, as applicable:

- material source **contributor** identity and commit provenance;
- employee-created work ownership under applicable employment/IP terms;
- contractor/vendor **assignment** or work-made-for-hire evidence;
- inbound contribution/license/assignment terms for external contributions;
- generated-code, model-output, dataset, design, font, media and provider terms where material;
- vendored/copied third-party code outside the dependency graph;
- trademark, domain, signing key, GitHub App, cloud account and other operational ownership needed to transfer the running product.

A Git commit proves repository history, not legal ownership. Missing provenance must remain external evidence and must not be synthesized.

## 6. Acquisition transfer evidence

The acquisition lane retains `artifacts/acquisition/transfer-evidence.json`. Presence of `transfer-evidence.json` alone is not proof that its claims are authenticated.

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
- evidence owner, review timestamp and retention/rotation policy.

PR #69 actively authenticates this consistency boundary and rejects parser ambiguity, but it does not choose the legal posture.

## 7. Release and acquisition gates

### Release-distribution gate

Before publishing an artifact, the exact integrated protected source must have a reviewed distribution posture and applicable third-party obligations for that artifact. Internal test builds do not create distribution rights. If a package/image/archive carries a rights field, it must agree with the approved source/package posture and exact-release `artifact_rights_metadata` before publication.

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

Each arrow requires independent identity/consistency evidence. A mismatch, missing required record, malformed/ambiguous JSON or unresolved right is a fail-closed condition.

## 8. Current evidence and residual gap — 2026-08-10

Protected `main` has no approved root `LICENSE` file. Current `package.json` is `"private": true` and does not declare a license. This is evidence of an unresolved licensing/IP-transfer decision, not evidence for MIT, Apache-2.0, proprietary, source-available or another posture.

That same authority rule exposed two active technical corrections:

- PR #67 removed an invented OCI `org.opencontainers.image.licenses="LicenseRef-Proprietary"` label while legal authority is unresolved;
- **PR #69** binds exact-release `artifact_rights_metadata` to repository/release/artifact identity and rejects duplicate decoded keys, malformed UTF-8/JSON and inconsistent OCI/SPDX claims before they can become acquisition evidence.

Issue #5 carries the owner/legal and ownership/assignment evidence gap. PR #71 supplies the canonical policy contract. Neither documentation nor technical enforcement makes legal clearance pass.

## 9. Non-goals

Noema automation must not:

- pick an outbound license because it appears commercially convenient;
- emit a package/container/release license field merely to make metadata look complete;
- treat `UNLICENSED`, `private`, repository visibility, `LicenseRef-*` or a copyright notice as interchangeable;
- infer license compatibility from filenames or scanner guesses alone;
- fabricate contributor consent, employment ownership, contractor assignment or third-party permission;
- remove NOTICE/attribution obligations to make an audit pass;
- accept duplicate-key or malformed evidence because one parser selects a convenient last value;
- weaken vulnerability, provenance, review or governance gates because rights evidence is incomplete.

## 10. Primary references

GitHub. (2026). *Licensing a repository*. GitHub Docs. https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository

npm, Inc. (2026). *package.json — license*. npm Docs. https://docs.npmjs.com/files/package.json/

SPDX Workgroup. (2024). *SPDX Specification 3.0.1: Annex D — SPDX license expressions*. Linux Foundation. https://spdx.github.io/spdx-spec/v3.0.1/annexes/spdx-license-expressions/

Open Container Initiative. (2025). *The OpenContainers Annotations Spec*. Open Container Initiative. https://specs.opencontainers.org/image-spec/annotations/
