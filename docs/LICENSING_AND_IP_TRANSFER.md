# Noema Licensing and IP Transfer

- **Status:** In review on PR #71; policy baseline only, not legal clearance or protected-main acceptance.
- **Scope:** Noema source rights, package/container metadata, third-party obligations, contributor/IP provenance, release distribution, and acquisition transfer evidence.
- **Decision authority:** The repository can detect and preserve evidence, but the outbound-license and transfer-rights decision belongs to the authorized owner/legal function.

## 1. Core invariant

**Public source availability is not a grant of rights.** Repository visibility, cloneability, package installation, an SBOM, or successful CI does not by itself establish permission to use, modify, redistribute, sublicense, or transfer Noema.

Noema therefore keeps legal authority separate from technical evidence:

- automation may inventory, hash, compare, and fail closed on missing or contradictory rights evidence;
- automation must never infer or silently choose an outbound license;
- an explicit **owner/legal** decision is required before a license posture is represented as approved;
- a missing, unknown, incompatible, or contradictory rights record remains a blocking acquisition/release-distribution gap rather than being converted into a technical PASS.

This document is not legal advice. It defines the evidence and authority boundary that Noema's technical controls must enforce.

## 2. Repository rights declaration

An approved outbound posture must be represented in repository source in a form that a buyer, operator, package consumer, and automated audit can discover.

At minimum:

1. a root `LICENSE` file or another explicitly approved custom-rights file must contain the controlling source terms when rights are granted through repository text;
2. `package.json` metadata must express the same declared posture without inventing broader rights;
3. release/container metadata that declares source rights must express the same approved posture and may not introduce an independent license claim;
4. the decision owner, approval record, effective date, and applicable source/release scope must be retained in acquisition evidence rather than inferred from a filename;
5. changes to licensing posture are governance changes and require reviewed source mutation, release-impact analysis, and acquisition-evidence regeneration.

### 2.1 `package.json` alignment

For npm package metadata, Noema follows the package contract rather than ad-hoc text:

- use a valid **SPDX** license expression when the approved terms are represented by an SPDX expression;
- use `SEE LICENSE IN <filename>` when approved custom terms are stored in a repository file, and require that filename to resolve to the intended bounded regular file;
- use `UNLICENSED` when the package intentionally grants no use rights through npm metadata;
- `"private": true` is a publication safeguard, not a substitute for an explicit licensing/IP decision.

Automation may verify syntax, file existence, hashes, and declared relationships. It must not claim that a license text semantically matches an SPDX identifier solely because filenames or package metadata appear plausible.

### 2.2 OCI and release-artifact metadata

**OCI image license metadata** and equivalent package/archive/release metadata are claims about an artifact, not a place for automation to choose a legal posture independently from repository authority.

- `org.opencontainers.image.licenses` or an equivalent artifact license field must agree with the explicit owner/legal decision and the repository/package rights declaration for that exact release scope;
- while the outbound-rights decision is unresolved, artifact license metadata **must remain absent** unless an authorized owner/legal decision explicitly requires a truthful bounded declaration;
- an invented `LicenseRef-*`, a repository visibility setting, `private: true`, an SBOM license guess, or a scanner classification cannot create source/distribution rights;
- once a rights decision exists, artifact metadata must be machine-checked against the approved repository rights file, package metadata, exact release revision, and transfer evidence before distribution/acquisition claims pass;
- source/revision/provenance labels that do not claim licensing authority may remain present independently when they are truthful and exact-revision bound.

This rule applies to container images, package manifests, release archives, registry annotations, attestations, generated notices, and other buyer-visible artifact metadata.

## 3. Third-party software and NOTICE obligations

Every distributable or transferable exact release must bind third-party rights evidence to the same source/artifact identity used by release provenance.

Required evidence includes:

- the exact-release **SBOM** and dependency graph;
- a dependency-license inventory for direct and transitive components, including bundled/static/runtime assets where applicable;
- required attribution and **NOTICE** material, preserving upstream notices when the applicable terms require them;
- an explicit disposition for unknown, custom, copyleft, source-available, dual-licensed, or otherwise policy-sensitive terms;
- the scanner/tool version and source used to classify each dependency license;
- hashes or immutable identities tying the license/NOTICE inventory to the release artifact and SBOM.

Unknown or unresolved obligations fail closed for a claim of release-distribution or acquisition-transfer readiness. A successful vulnerability scan, provenance attestation, or dependency install does not satisfy license compatibility by itself.

## 4. Contributor and IP ownership provenance

Acquisition readiness requires more than an outbound file. Noema must retain evidence that the seller has authority to transfer the relevant intellectual property.

The transfer evidence set should cover, as applicable:

- material source `contributor` identity and commit provenance;
- employee-created work ownership under the governing employment/IP terms;
- contractor or vendor **assignment** / work-made-for-hire evidence where applicable;
- inbound contribution terms or contributor-license/assignment records if external contributions are accepted;
- generated-code, model-output, dataset, design-asset, font, media, and other tool/provider terms where they create a material transfer restriction;
- known third-party code copied or vendored outside the package-manager dependency graph;
- trademark, domain, signing-key, GitHub App, cloud account, and other operational ownership records needed to transfer the product as an operating system rather than only source files.

A Git commit proves repository history, not legal ownership. Missing ownership provenance remains external evidence and must not be synthesized by automation.

## 5. Acquisition transfer evidence

The existing acquisition lane uses `artifacts/acquisition/transfer-evidence.json` as retained transfer evidence. Licensing/IP evidence should be referenced from that artifact or an immutable evidence object that it authenticates.

The eventual machine-checkable transfer contract should bind, at minimum:

- repository identity and exact source/release revision;
- approved owner/legal licensing decision identifier;
- controlling `LICENSE` or custom-rights file path and SHA-256 when applicable;
- the `package.json` license declaration and package metadata hash;
- exact-release artifact license metadata/annotations when present, including OCI image license metadata for container artifacts;
- exact-release SBOM identity;
- dependency-license inventory and NOTICE/attribution artifact identities;
- contributor/IP ownership and assignment evidence references;
- outstanding exceptions, legal holds, or unresolved third-party terms;
- evidence owner, review timestamp, and retention/rotation policy.

This contract is **Planned** until implemented and protected-main accepted. Presence of `transfer-evidence.json` alone must never be treated as proof that these fields were validated.

## 6. Release and acquisition gates

### Release-distribution gate

Before publishing an artifact to users or a public registry, the exact integrated protected source must have a reviewed distribution posture and the applicable third-party obligations for that artifact. Internal test builds do not create distribution rights. If an image/package/archive carries a license field, that field must be consistent with the approved source/package rights posture before publication; unresolved rights remain fail closed rather than being encoded as a guessed license label.

### Acquisition final gate

Acquisition readiness requires all of the following to agree:

```text
owner/legal decision
→ repository rights file
→ package.json rights metadata
→ release/container rights metadata when present
→ exact-release SBOM
→ dependency-license + NOTICE inventory
→ contributor/IP ownership + assignment provenance
→ transfer-evidence.json
→ acquisition audit
```

A mismatch at any arrow is a fail closed condition. Technical automation can prove consistency and absence/presence; only the authorized rights owner can make the legal choice.

## 7. Current evidence and residual gap — 2026-08-10

A dated audit of protected `main` found no root `LICENSE` file. The current `package.json` is marked `"private": true` and does not declare a `license` field. This is evidence of an unresolved licensing/IP-transfer decision, not evidence for any particular outbound license.

The same contract exposed an active artifact-metadata defect on patch-validator image PR #67: an OCI `org.opencontainers.image.licenses="LicenseRef-Proprietary"` label had been emitted without an approved outbound-rights decision. The focused PR removed that invented label and retains only non-rights source/revision/title/description/documentation metadata while legal authority remains unresolved. This active-PR correction is not protected-main evidence until integrated.

Issue #5 carries the acquisition-transfer gap and the required owner/legal decision. PR #71 adds this canonical evidence contract only; it does **not** choose a license, manufacture ownership records, or make release/acquisition readiness pass. PR #69 owns machine-checkable transfer-evidence consistency; PR #67 owns the current image-specific correction.

Repository-owned next work is to keep the gap discoverable and add bounded consistency/inventory checks without pre-empting owner/legal authority. External next work is the actual licensing/IP decision and ownership/assignment evidence.

## 8. Non-goals

Noema automation must not:

- pick MIT, Apache-2.0, proprietary, source-available, or another license because it appears commercially convenient;
- emit an OCI/package/release license label merely to make artifact metadata look complete while legal authority is unresolved;
- treat `UNLICENSED`, `private`, a repository visibility setting, `LicenseRef-*`, or copyright notice as interchangeable concepts;
- infer semantic license compatibility from filenames alone;
- fabricate contributor consent, employment ownership, contractor assignment, or third-party permissions;
- remove attribution/NOTICE requirements to make an audit pass;
- weaken vulnerability, provenance, review, or governance gates because licensing evidence is incomplete.

## 9. Primary references

GitHub. (2026). *Licensing a repository*. GitHub Docs. https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository

npm, Inc. (2026). *package.json — license*. npm Docs. https://docs.npmjs.com/files/package.json/

SPDX Workgroup. (2024). *SPDX Specification 3.0.1: Annex D — SPDX license expressions*. Linux Foundation. https://spdx.github.io/spdx-spec/v3.0.1/annexes/spdx-license-expressions/

Open Container Initiative. (2024). *OCI image format specification: Pre-defined annotation keys*. Open Container Initiative. https://github.com/opencontainers/image-spec/blob/main/annotations.md
