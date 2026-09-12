# CodeGraph sandbox glibc remediation

## Decision

Noema keeps the signed Distroless Debian 13 image as the reviewed CodeGraph execution substrate. When that authenticated digest still reports `libc6` and `libc-bin` `2.41-12+deb13u3`, the trusted workflow derives an ephemeral local image by overlaying the reviewed Debian `2.41-12+deb13u4` binaries. The binary provenance is taken from Debian snapshot `20260711T202405Z`: the workflow verifies the snapshot suite's `InRelease` with `/usr/share/keyrings/debian-archive-keyring.gpg`, verifies `main/binary-amd64/Packages.xz` against the SHA-256 carried by that signed metadata, selects only exact `Package`/`Version`/`Architecture` records, and verifies each downloaded `.deb` against the SHA-256 carried by the authenticated package index before checking its package metadata. The derived image is identified only by its local immutable `sha256:` image ID and must pass the existing fail-closed Trivy MEDIUM/HIGH/CRITICAL scan before `DockerCodeGraphRunner` may consume it. When the signed upstream Distroless digest already carries glibc at or above the reviewed fixed version, the workflow uses that remote immutable digest directly and does not downgrade it.

## Problem and exact evidence

Reviewer-ci run `34698807871`, job `103566817968`, on #678 exact `538da708344fa105c3a4337febfc7d1531bda7ad` authenticated `gcr.io/distroless/java-base-debian13@sha256:40a4046b8663ac0226eae964d5844c44999e006025d44ddc786499e3d6cac1a5` successfully, then Trivy v0.74.0 found four fixed MEDIUM findings: CVE-2026-5450 and CVE-2026-5928 in both `libc6` and `libc-bin`, installed `2.41-12+deb13u3`, fixed `2.41-12+deb13u4`. The gate exited 1 as designed. Application CI, required Security Scan and patch-validator-image were GREEN on the same head; that does not override a failed reviewer substrate gate.

The first #681 repair attempted an exact-version APT download from the live `trixie-proposed-updates` index. Hosted reviewer-ci proved that assumption stale: the Debian pool retained the reviewed `deb13u4` amd64 binaries after the live APT index stopped offering that exact version. A later repair attempted to consume a retained top-level `amd64-buildd.changes` file from a guessed Debian path. Exact head `822ae74e28ab1e04ecbfe8df8e81a3524188255f` failed reviewer-ci run `34701767311`, job `103574678136`, in the shared image-preparation step, and current-head review found three causal defects: the constructed Debian manifest URL returned 404, the manifest had not itself been authenticated before its hashes were trusted, and a status line written to stdout polluted the command-substitution package path. Those are repair findings, not runner flakes.

The selected repair therefore uses Debian's timestamped snapshot repository metadata rather than a retained loose build manifest. The snapshot timestamp is fixed, the suite metadata is signed, the package-index digest is chained from the verified `InRelease`, and the package digest is chained from the verified package index. Status/provenance diagnostics in the package-download function go to stderr so its stdout remains the single downloaded path consumed by `dpkg-deb`.

## Constraints

The repair must preserve Distroless keyless verification, the existing Trivy exit/severity semantics, no-network/read-only/non-root execution, dropped capabilities, seccomp/no-new-privileges, PID/RAM/CPU/IPC/ulimit/tmpfs bounds, read-only source/tooling mounts and the bundled CodeGraph Node entrypoint. Reviewer-ci and the privileged central-review evidence collector must use the same preparation contract. No target repository code is executed while the image is prepared.

Noema owns only the reviewer isolation integration. This decision does not make Noema the canonical quarantine/security-verdict owner, does not change provider/model routing or outbound authority, and does not turn an ephemeral CI image into a release artifact.

## Alternatives

Waiting for a new Distroless digest was rejected as the sole response because the repository-wide reviewer gate is already correctly blocking unrelated source integration. The helper nevertheless automatically returns to the signed upstream digest once its glibc version is at or above the reviewed fixed floor.

Lowering the Trivy threshold, adding a broad CVE ignore/VEX entry, changing severity-source policy, or treating the failure as a runner flake was rejected because those options weaken or bypass the evidence that exposed the vulnerable substrate.

Replacing Distroless with an unrelated base image was rejected because it expands the runtime and supply-chain surface without being necessary to repair the causal glibc packages.

Relying on the live `trixie-proposed-updates` APT index was rejected because the exact reviewed binary can disappear from a mutable suite index while remaining available from Debian's historical archive. Consuming a loose `.changes` file over HTTPS was also rejected: transport security alone does not authenticate the package hashes. The selected timestamped snapshot path instead verifies Debian's signed `InRelease`, the referenced `Packages.xz`, and then the exact package bytes as one chain.

## Risks and rollback

The reviewed fix is not yet the stable trixie package; stable still exposes `deb13u3`. The temporary overlay is therefore bounded to one reviewed glibc version and two amd64 package files. The workflow fails closed if the Debian archive keyring is unavailable, the snapshot signature is invalid, the signed package-index hash is absent or mismatched, an exact package record is absent, the filename leaves `pool/main/g/glibc`, the package hash mismatches, or package/version/architecture metadata differs. Any unexpected source glibc transition below the fixed floor also fails closed rather than being patched speculatively. The local image ID is accepted only as workflow-produced, post-scan ephemeral execution identity; an arbitrary tag or foreign repository remains invalid.

The timestamped snapshot metadata can carry a historical `Valid-Until`; this workflow does not treat freshness as the trust criterion because it deliberately consumes one fixed historical version. Cryptographic archive signature verification and exact digest chaining remain mandatory. The production security gate still scans the fully derived image at current Trivy policy before use.

Rollback is automatic at the substrate-selection boundary: when the signed Distroless digest reports both glibc packages at or above `2.41-12+deb13u4`, the overlay path is skipped and the authenticated remote digest is used. Removing the helper before that condition would restore the known failing/vulnerable substrate and is not an acceptable rollback.

## Traceability

- Noema issue #680 owns this repair and its acceptance boundary.
- #678 is the first exact-head consumer that exposed the repository-wide substrate failure; it remains unmerged until this foundation lane is protected and #678 is non-force restacked with fresh exact-head gates.
- #681 exact `822ae74e28ab1e04ecbfe8df8e81a3524188255f`, reviewer-ci run `34701767311`, job `103574678136`, is the repair RED for the invalid retained-manifest path. Current-head review additionally verified the unauthenticated-manifest and stdout-contamination defects before the signed-snapshot repair.
- Debian Snapshot. (2026, July 11). *debian archive snapshot 20260711T202405Z*. https://snapshot.debian.org/archive/debian/20260711T202405Z/
- Debian Security Tracker. (2026). *CVE-2026-5450*. https://security-tracker.debian.org/tracker/CVE-2026-5450
- Debian Security Tracker. (2026). *CVE-2026-5928*. https://security-tracker.debian.org/tracker/CVE-2026-5928
- Debian Sources. (2026). *Package: glibc*. https://sources.debian.org/src/glibc/
- Debian Package Tracker. (2026, July 11). *Accepted glibc 2.41-12+deb13u4 (source) into proposed-updates*. https://tracker.debian.org/news/1773909/accepted-glibc-241-12deb13u4-source-into-proposed-updates/
