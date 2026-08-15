# Release publication file stability

## Scope

Noema's release materialization and immutable-release publication receipt are buyer-facing supply-chain evidence. Before this change, release materialization used pathname-based reads for the source archive and SBOM, and the receipt validated a pathname before reopening it for JSON parsing or SHA-256 hashing. Those split check/use boundaries allowed local pathname replacement or in-place mutation to substitute different bytes without changing the operator-visible argument. The publication receipt was also copied into an isolated artifact as one file even though it imported a sibling module, so the first real publication would not have had a closed runtime dependency set.

The protected publication workflow already constrains the release bundle to a fixed artifact handoff and rejects symbolic links before publication. The scripts still have to authenticate the exact local bytes they parse and hash, and the executable copied across the isolated handoff must remain runnable without relying on files that are not shipped with it.

## Implemented boundary

`scripts/lib/stable-file-evidence.mjs` provides the release-materialization step with a bounded no-follow descriptor reader. The isolated `scripts/release-publication-receipt.mjs` carries the same small descriptor-read contract inline so the existing one-file handoff remains self-contained rather than silently depending on repository files that are absent in the publication job. The descriptor contract:

1. requires a positive reviewed byte ceiling and an available `O_NOFOLLOW`/read-only open contract;
2. rejects a pathname that is a symlink, non-regular file, empty file, or declared oversize before opening;
3. opens the exact pathname with `O_NOFOLLOW` and compares pathname metadata with the opened descriptor;
4. reads only through that descriptor, with a streaming `maximum + 1` ceiling instead of trusting the initial size alone;
5. revalidates descriptor device, inode, mode, size, modification time, change time, and observed byte count after the read;
6. re-resolves the pathname after the read and requires it still to identify the same regular-file device/inode/mode/size; and
7. closes the descriptor on success and failure.

`release-evidence.mjs` now hashes the exact accepted source-archive and SBOM bytes instead of reopening their pathnames. Its manifest and `SHA256SUMS` outputs use an unpredictable owner-only temporary file followed by atomic rename. The output-directory real-directory check remains in place; this change does not claim immunity to a hostile replacement of an ancestor directory outside the reviewed GitHub-hosted-runner threat boundary.

The publication receipt retains one accepted snapshot of `release-evidence.json` for both semantic validation and release-asset hashing. It requires `--release-evidence` to identify the exact `release-evidence.json` inside the supplied release asset directory, preventing a separately parsed manifest from being combined with a different hashed asset. `SHA256SUMS` is parsed from the same retained bytes that were hashed into the local asset map. The receipt output likewise uses an unpredictable temporary file plus atomic rename.

The publication workflow deliberately copies only `release-publication-receipt.mjs` into the sterile handoff. The receipt therefore contains no relative module imports; its duplicate-decoded-JSON-key scanner, stable descriptor reader, and atomic output helper are intentionally self-contained boundary code. This avoids an acquisition-path defect in which tests run the script from the repository successfully but the isolated publication job cannot resolve an unshipped sibling module.

The descriptor reader fails closed when a runtime cannot provide the no-follow flag. Noema's publication workflow currently executes on Ubuntu GitHub-hosted runners; this control does not claim equivalent filesystem semantics on runtimes where Node does not expose the required flag.

## Verification strategy

`test/stable-release-file-evidence.test.ts` includes a real temporary-file/symlink case plus deterministic filesystem-adapter cases for path-to-descriptor replacement, in-place descriptor mutation, same-byte pathname replacement after reading, short reads, streamed oversize, unsupported open flags, non-files, empty files, and descriptor closure after failure. `test/release-evidence-file-stability.test.ts` binds release materialization to the stable reader and atomic evidence writer. `test/release-publication-output-atomicity.test.ts` requires temporary exclusive creation plus rename for the final receipt, and `test/release-publication-runtime-handoff.test.ts` verifies that the isolated one-file executable has no relative runtime dependency while the workflow authenticates that exact file across its handoffs. Existing immutable-release publication tests continue to exercise the complete receipt CLI, exact asset set, digest checks, malformed UTF-8 handling, duplicate decoded JSON keys, immutable-policy checks, and publication evidence contract.

This change does **not** prove that a GitHub Release exists, that Cloudflare deployment succeeded, that production KPIs are healthy, or that legal/IP transfer rights are complete. It strengthens only the local evidence-consumption and publication boundary used when those external facts are eventually captured.

## Standards and implementation basis

POSIX.1-2024 specifies that `open()` with `O_NOFOLLOW` fails when the final pathname component is a symbolic link. Node.js exposes the corresponding filesystem constant and documents that it causes open to fail for a symbolic-link path. Those primitives remove the final-component symlink-follow step from the open operation; the additional descriptor/path identity checks are Noema's application-level control for replacement and mutation across the full read window.

NIST SSDF 1.1 recommends defining, implementing, and verifying software security requirements throughout the development lifecycle. Noema treats release evidence byte identity and executable handoff closure as such requirements because publication receipts are later consumed as acquisition and supply-chain evidence.

## References

Node.js contributors. (2026). *File system: Node.js v25.9.0 documentation*. Node.js. https://nodejs.org/download/release/v25.9.0/docs/api/fs.html

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

The Open Group. (2024). *open, openat — open a file*. In *The Open Group Base Specifications Issue 8, IEEE Std 1003.1-2024*. https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html
