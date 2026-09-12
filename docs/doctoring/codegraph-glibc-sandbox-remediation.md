# CodeGraph sandbox glibc remediation

## Decision

Noema keeps the signed Distroless Debian 13 image as the reviewed CodeGraph execution substrate, but when that authenticated digest still reports `libc6` and `libc-bin` `2.41-12+deb13u3`, the trusted workflow derives an ephemeral local image by overlaying Debian-authenticated `2.41-12+deb13u4` packages from `trixie-proposed-updates`. The derived image is identified only by its local immutable `sha256:` image ID and must pass the existing fail-closed Trivy MEDIUM/HIGH/CRITICAL scan before `DockerCodeGraphRunner` may consume it. When the signed upstream Distroless digest already carries glibc at or above the reviewed fixed version, the workflow uses that remote immutable digest directly and does not downgrade it.

## Problem and exact evidence

Reviewer-ci run `34698807871`, job `103566817968`, on #678 exact `538da708344fa105c3a4337febfc7d1531bda7ad` authenticated `gcr.io/distroless/java-base-debian13@sha256:40a4046b8663ac0226eae964d5844c44999e006025d44ddc786499e3d6cac1a5` successfully, then Trivy v0.74.0 found four fixed MEDIUM findings: CVE-2026-5450 and CVE-2026-5928 in both `libc6` and `libc-bin`, installed `2.41-12+deb13u3`, fixed `2.41-12+deb13u4`. The gate exited 1 as designed. Application CI, required Security Scan and patch-validator-image were GREEN on the same head; that does not override a failed reviewer substrate gate.

Debian's security tracker identifies trixie `2.41-12+deb13u3` as vulnerable to both CVEs. Debian Sources lists `2.41-12+deb13u4` in `trixie-proposed-updates`, and Debian's package tracker records that source version as accepted into proposed-updates on 2026-07-11. At the time of this decision, stable trixie still exposes `deb13u3`; therefore a blind rerun cannot repair the failure.

## Constraints

The repair must preserve Distroless keyless verification, the existing Trivy exit/severity semantics, no-network/read-only/non-root execution, dropped capabilities, seccomp/no-new-privileges, PID/RAM/CPU/IPC/ulimit/tmpfs bounds, read-only source/tooling mounts and the bundled CodeGraph Node entrypoint. Reviewer-ci and the privileged central-review evidence collector must use the same preparation contract. No target repository code is executed while the image is prepared.

Noema owns only the reviewer isolation integration. This decision does not make Noema the canonical quarantine/security-verdict owner, does not change provider/model routing or outbound authority, and does not turn an ephemeral CI image into a release artifact.

## Alternatives

Waiting for a new Distroless digest was rejected as the sole response because the repository-wide reviewer gate is already correctly blocking unrelated source integration. The helper nevertheless automatically returns to the signed upstream digest once its glibc version is at or above the reviewed fixed floor.

Lowering the Trivy threshold, adding a broad CVE ignore/VEX entry, changing severity-source policy, or treating the failure as a runner flake was rejected because those options weaken or bypass the evidence that exposed the vulnerable substrate.

Replacing Distroless with an unrelated base image was rejected because it expands the runtime and supply-chain surface without being necessary to repair the causal glibc packages.

The selected narrow overlay keeps the authenticated Distroless filesystem as the base, downloads only the two reviewed glibc binary packages through Debian's archive-signature trust chain, verifies exact package version and architecture, overlays them, re-reads package provenance from the derived image, and then subjects the complete derived image to the unchanged Trivy gate.

## Risks and rollback

`trixie-proposed-updates` is not the stable suite. This is intentionally bounded to a reviewed minimum version and two packages, with Debian archive authentication and a final vulnerability scan. Any unexpected source glibc transition below the fixed floor fails closed rather than being patched speculatively. The local image ID is accepted only as workflow-produced, post-scan ephemeral execution identity; an arbitrary tag or foreign repository remains invalid.

Rollback is automatic at the substrate-selection boundary: when the signed Distroless digest reports both glibc packages at or above `2.41-12+deb13u4`, the overlay path is skipped and the authenticated remote digest is used. Removing the helper before that condition would restore the known failing/vulnerable substrate and is not an acceptable rollback.

## Traceability

- Noema issue #680 owns this repair and its acceptance boundary.
- #678 is the first exact-head consumer that exposed the repository-wide substrate failure; it remains unmerged until this foundation lane is protected and #678 is non-force restacked with fresh exact-head gates.
- Debian Security Tracker. (2026). *CVE-2026-5450*. https://security-tracker.debian.org/tracker/CVE-2026-5450
- Debian Security Tracker. (2026). *CVE-2026-5928*. https://security-tracker.debian.org/tracker/CVE-2026-5928
- Debian Sources. (2026). *Package: glibc*. https://sources.debian.org/src/glibc/
- Debian Package Tracker. (2026, July 11). *Accepted glibc 2.41-12+deb13u4 (source) into proposed-updates*. https://tracker.debian.org/news/1773909/accepted-glibc-241-12deb13u4-source-into-proposed-updates/
