# CodeGraph sandbox glibc remediation

## Decision

Noema keeps the signed Distroless Debian 13 image as the reviewed CodeGraph execution substrate. When that authenticated digest still reports `libc6` and `libc-bin` `2.41-12+deb13u3`, the trusted workflow derives an ephemeral local image by overlaying the reviewed Debian `2.41-12+deb13u4` binaries. The binary provenance is taken from Debian snapshot `20260711T202405Z`.

The trust chain is explicit and runner-independent. The fixed snapshot sits across the Debian 12→13 archive-signing transition, so the temporary verification keyring contains exactly the Debian 12/bookworm automatic archive primary key `B8B80B5B623EAB6AD8775C45B7C5D7D6350947F8` and the Debian 13/trixie automatic archive primary key `04B54C3CDCA79751B16BC6B5225629DF75B188BD`. Debian documents both fingerprints on its FTP-master archive-key page and in the corresponding archive-key announcements. The helper downloads each official armored key file and rejects it unless its complete primary-key set contains exactly the one expected primary fingerprint; the Debian 13 armored bytes are additionally pinned to SHA-256 `6f1d277429dd7ffedcc6f8688a7ad9a458859b1139ffa026d1eeaadcbffb0da7`. No other primary key is imported into the transition keyring.

That bounded transition keyring verifies the snapshot suite's `InRelease`; the signed `InRelease` supplies the SHA-256 for `main/binary-amd64/Packages.xz`; the authenticated package index supplies each exact `.deb` SHA-256. The helper selects the `libc6` and `libc-bin` records independently, verifies each downloaded destination against its authenticated record SHA-256, then checks `Package`, `Version`, and `Architecture` metadata before overlaying only those two reviewed glibc packages.

The derived image is identified only by its local immutable `sha256:` image ID and must pass the existing fail-closed Trivy MEDIUM/HIGH/CRITICAL scan before `DockerCodeGraphRunner` may consume it. When the signed upstream Distroless digest already carries glibc at or above the reviewed fixed version, the workflow uses that remote immutable digest directly and does not downgrade it.

## Problem and exact evidence

Reviewer-ci run `34698807871`, job `103566817968`, on #678 exact `538da708344fa105c3a4337febfc7d1531bda7ad` authenticated `gcr.io/distroless/java-base-debian13@sha256:40a4046b8663ac0226eae964d5844c44999e006025d44ddc786499e3d6cac1a5` successfully, then Trivy v0.74.0 found four fixed MEDIUM findings: CVE-2026-5450 and CVE-2026-5928 in both `libc6` and `libc-bin`, installed `2.41-12+deb13u3`, fixed `2.41-12+deb13u4`. The gate exited 1 as designed. Application CI, required Security Scan and patch-validator-image were GREEN on the same head; that does not override a failed reviewer substrate gate.

The first #681 repair attempted an exact-version APT download from the live `trixie-proposed-updates` index. Hosted reviewer-ci proved that assumption stale: the Debian pool retained the reviewed `deb13u4` amd64 binaries after the live APT index stopped offering that exact version. A later repair attempted to consume a retained top-level `amd64-buildd.changes` file from a guessed Debian path. Exact head `822ae74e28ab1e04ecbfe8df8e81a3524188255f` failed reviewer-ci run `34701767311`, job `103574678136`, in the shared image-preparation step, and current-head review found three causal defects: the constructed Debian manifest URL returned 404, the manifest had not itself been authenticated before its hashes were trusted, and a status line written to stdout polluted the command-substitution package path. Those are repair findings, not runner flakes.

Exact head `649ed426bd3274c9035a08374543a93775c04f7a` then proved a second foundation assumption unsafe. Reviewer-ci run `34704310729`, job `103581477396`, again passed exact checkout, both 100% line+branch gates, both 100% docstring gates, packaging smoke, CodeGraph tooling, Cosign and Trivy installation, then failed in the shared image-preparation step before the real no-network smoke. The helper depended on `/usr/share/keyrings/debian-archive-keyring.gpg`, but `ubuntu-24.04` does not promise that foreign archive keyring as part of the runner contract. Noema therefore stopped depending on mutable host package inventory and made the Debian archive signing identities explicit workflow inputs.

The selected repair uses Debian's timestamped snapshot repository metadata rather than a retained loose build manifest. Hosted execution of the fixed snapshot required the archive-signing transition set rather than a host-installed keyring, so Noema admits only the exact Debian 12 and Debian 13 automatic archive primary identities documented above. The snapshot timestamp is fixed, the suite metadata is signed, the package-index digest is chained from the verified `InRelease`, and both package digests are independently chained from the verified package index. Status/provenance diagnostics in package-download helpers go to stderr so stdout remains a single machine-consumed path.

## Constraints

The repair must preserve Distroless keyless verification, the existing Trivy exit/severity semantics, no-network/read-only/non-root execution, dropped capabilities, seccomp/no-new-privileges, PID/RAM/CPU/IPC/ulimit/tmpfs bounds, read-only source/tooling mounts and the bundled CodeGraph Node entrypoint. Reviewer-ci and the privileged central-review evidence collector must use the same preparation contract. No target repository code is executed while the image is prepared.

Noema owns only the reviewer isolation integration. This decision does not make Noema the canonical quarantine/security-verdict owner, does not change provider/model routing or outbound authority, and does not turn an ephemeral CI image into a release artifact.

## Alternatives

Waiting for a new Distroless digest was rejected as the sole response because the repository-wide reviewer gate is already correctly blocking unrelated source integration. The helper nevertheless automatically returns to the signed upstream digest once its glibc version is at or above the reviewed fixed floor.

Lowering the Trivy threshold, adding a broad CVE ignore/VEX entry, changing severity-source policy, or treating the failure as a runner flake was rejected because those options weaken or bypass the evidence that exposed the vulnerable substrate.

Replacing Distroless with an unrelated base image was rejected because it expands the runtime and supply-chain surface without being necessary to repair the causal glibc packages.

Relying on the live `trixie-proposed-updates` APT index was rejected because the exact reviewed binary can disappear from a mutable suite index while remaining available from Debian's historical archive. Consuming a loose `.changes` file over HTTPS was also rejected: transport security alone does not authenticate the package hashes. Depending on a preinstalled Debian archive keyring in an Ubuntu hosted runner was rejected because that file is not part of Noema's controlled or documented runner contract. Installing an unpinned foreign keyring package during the job would merely move the mutable bootstrap. The selected path instead constrains the downloaded transition files to their exact documented primary-key identities, additionally pins the Debian 13 armored bytes by SHA-256, and then verifies `InRelease`, `Packages.xz`, and each package as one digest chain.

## Risks and rollback

The reviewed fix is not yet the stable trixie package; stable still exposes `deb13u3`. The temporary overlay is therefore bounded to one reviewed glibc version and two amd64 package files. The workflow fails closed if either downloaded archive-key file exposes any unexpected primary key, the expected primary fingerprint is absent, the pinned Debian 13 byte digest changes, the snapshot signature is invalid, the signed package-index hash is absent or mismatched, an exact package record is absent, the filename leaves `pool/main/g/glibc`, either package hash mismatches, or package/version/architecture metadata differs. Any unexpected source glibc transition below the fixed floor also fails closed rather than being patched speculatively. The local image ID is accepted only as workflow-produced, post-scan ephemeral execution identity; an arbitrary tag or foreign repository remains invalid.

The timestamped snapshot metadata can carry a historical `Valid-Until`; this workflow does not treat freshness as the trust criterion because it deliberately consumes one fixed historical version. Cryptographic archive signature verification and exact digest chaining remain mandatory. The production security gate still scans the fully derived image at current Trivy policy before use.

The Debian archive trust set is intentionally limited to the Debian 12 and Debian 13 automatic archive primary keys announced by Debian. The Debian 12 key is retained only for the bounded transition needed to authenticate this historical snapshot; it is not an open-ended fallback and no additional primary identity is accepted from either downloaded key file. A future key rotation or a different snapshot must be an explicit reviewed change with new primary evidence, not an automatic network lookup. This turns key rotation into a visible maintenance event rather than silently widening trust.

Rollback is automatic at the substrate-selection boundary: when the signed Distroless digest reports both glibc packages at or above `2.41-12+deb13u4`, the overlay path is skipped and the authenticated remote digest is used. Removing the helper before that condition would restore the known failing/vulnerable substrate and is not an acceptable rollback.

## Traceability

- Noema issue #680 owns this repair and its acceptance boundary.
- #678 is the first exact-head consumer that exposed the repository-wide substrate failure; it remains unmerged until this foundation lane is protected and #678 is non-force restacked with fresh exact-head gates.
- #681 exact `822ae74e28ab1e04ecbfe8df8e81a3524188255f`, reviewer-ci run `34701767311`, job `103574678136`, is the repair RED for the invalid retained-manifest path. Current-head review additionally verified the unauthenticated-manifest and stdout-contamination defects before the signed-snapshot repair.
- #681 exact `649ed426bd3274c9035a08374543a93775c04f7a`, reviewer-ci run `34704310729`, job `103581477396`, is the RED that removed reliance on a host-preinstalled Debian archive keyring. The job passed both coverage and both docstring 100% gates before failing in image preparation.
- Debian Project. (2023, March 9). *New archive signing keys for Debian 12/bookworm*. https://lists.debian.org/debian-devel-announce/2023/03/msg00001.html
- Debian Project. (2025, April 6). *New archive signing keys for Debian 13/trixie*. https://lists.debian.org/debian-devel-announce/2025/04/msg00001.html
- Debian FTP Team. (2026). *Archive signing keys*. https://ftp-master.debian.org/keys.html
- Debian Snapshot. (2026, July 11). *debian archive snapshot 20260711T202405Z*. https://snapshot.debian.org/archive/debian/20260711T202405Z/
- Debian Security Tracker. (2026). *CVE-2026-5450*. https://security-tracker.debian.org/tracker/CVE-2026-5450
- Debian Security Tracker. (2026). *CVE-2026-5928*. https://security-tracker.debian.org/tracker/CVE-2026-5928
- Debian Sources. (2026). *Package: glibc*. https://sources.debian.org/src/glibc/
- Debian Package Tracker. (2026, July 11). *Accepted glibc 2.41-12+deb13u4 (source) into proposed-updates*. https://tracker.debian.org/news/1773909/accepted-glibc-241-12deb13u4-source-into-proposed-updates/
- GitHub Actions. (2026, September 7). *Ubuntu 24.04 runner image software inventory (20260907.300.1)*. https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md
