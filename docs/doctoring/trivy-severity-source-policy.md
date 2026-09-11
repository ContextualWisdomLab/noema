# Trivy Severity-Source Policy

## Decision

Noema keeps Trivy vulnerability severity selection on the default `auto` semantics in reviewer-ci, central review, and patch-validator image scanning. The three reviewed workflows must not add `--vuln-severity-source` merely to remove the vendor-severity diagnostic from logs.

The diagnostic remains visible because it carries information about which advisory authority supplied the severity. Trivy deliberately prefers the selected OS vendor's advisory and severity when scanning OS-managed packages. That preference accounts for distribution-specific packaging and backport decisions that upstream databases such as NVD cannot infer reliably from the generic package version alone. Narrowing the source order to NVD or another explicit source can therefore change accepted severities, produce false positives against vendor-patched builds, or turn otherwise classified findings into `UNKNOWN` when the requested source has no rating.

## Evidence and interpretation

Trivy's vulnerability-scanner documentation states that OS packages are matched against the appropriate OS vendor's advisory data and that this selection is necessary because vendors commonly backport fixes. The same documentation explains that vendor severity is preferred because the vendor knows how the affected software is built and distributed. Trivy exposes the selected authority in JSON as `SeveritySource`, alongside the complete `VendorSeverity` map.

Trivy also documents `--vuln-severity-source` as an override for callers that intentionally want a custom priority. Its examples show that explicit source lists can change the resulting severity or yield `UNKNOWN`; retaining the default behavior is represented by `auto`. Noema has no evidence that replacing `auto` with an explicit source order would preserve or strengthen the accepted finding set across its scanned artifacts, so there is no causal basis for such a policy change.

Accordingly, the current vendor-severity diagnostic remains visible and must not be suppressed. A clean log is not a sufficient reason to change scanner semantics, severity thresholds, exit behavior, scanner coverage, or ignore policy.

## Boundary

This decision classifies a diagnostic; it does not weaken any security gate. It does not change Trivy's HIGH/CRITICAL admission policy, `exit-code` behavior, ignore rules, scan targets, scanner set, setup provenance, provider routing, quarantine/security verdict ownership, deployment/release authority, or any foreign owner contract.

If a future Trivy version changes default severity-source behavior, or a proposal needs an explicit source order for a concrete buyer or regulatory requirement, the owner must compare retained results against `auto` on representative artifacts and prove that the accepted finding set is preserved or strengthened before changing workflow policy. The comparison must retain per-finding `SeveritySource` and `VendorSeverity` evidence so that differences are attributable rather than hidden.

## Traceability

- Noema `.github/workflows/reviewer-ci.yml`, `.github/workflows/central-review.yml`, and `.github/workflows/patch-validator-image.yml` retain Trivy default severity-source selection and do not pass `--vuln-severity-source`.
- Trivy vulnerability-scanner documentation describes OS-vendor advisory selection, vendor backport handling, vendor-preferred severity, `SeveritySource`, `VendorSeverity`, and the optional severity-source override.
- Issue #622 owns warning/deprecation remediation and explicitly forbids policy weakening merely to silence diagnostics.

## References

Aqua Security. (2026). *Vulnerability scanning*. Trivy documentation. https://trivy.dev/docs/dev/guide/scanner/vulnerability/
