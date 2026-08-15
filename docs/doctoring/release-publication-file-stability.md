# Release publication file stability

## Scope

Noema's immutable-release publication receipt is buyer-facing supply-chain evidence. Before this change, the receipt validated a pathname with `lstat`/`stat` and then reopened the same pathname for JSON parsing or SHA-256 hashing. That split check/use boundary allowed a local pathname replacement between validation and consumption to substitute different bytes without changing the operator-visible argument.

The protected publication workflow already constrains the release bundle to a fixed artifact handoff and rejects symbolic links before publication. The receipt nevertheless has to authenticate the exact local bytes it parses and hashes rather than treating a prior pathname check as durable evidence.

## Implemented boundary

`scripts/lib/stable-file-evidence.mjs` now provides the release receipt with a bounded no-follow descriptor reader. It:

1. requires a positive reviewed byte ceiling and an available `O_NOFOLLOW`/read-only open contract;
2. rejects a pathname that is a symlink, non-regular file, empty file, or declared oversize before opening;
3. opens the exact pathname with `O_NOFOLLOW` and compares pathname metadata with the opened descriptor;
4. reads only through that descriptor, with a streaming `maximum + 1` ceiling instead of trusting the initial size alone;
5. revalidates descriptor device, inode, mode, size, modification time, change time, and observed byte count after the read;
6. re-resolves the pathname after the read and requires it still to identify the same regular-file device/inode/mode/size; and
7. closes the descriptor on success and failure.

The release receipt retains one accepted snapshot of `release-evidence.json` for both semantic validation and release-asset hashing. It also requires `--release-evidence` to identify the exact `release-evidence.json` inside the supplied release asset directory, preventing a separately parsed manifest from being combined with a different hashed asset. `SHA256SUMS` is parsed from the same retained bytes that were hashed into the local asset map.

The helper is deliberately fail-closed when a runtime cannot provide the no-follow flag. Noema's publication workflow currently executes on Ubuntu GitHub-hosted runners; this control does not claim equivalent filesystem semantics on runtimes where Node does not expose the required flag.

## Verification strategy

`test/stable-release-file-evidence.test.ts` includes a real temporary-file/symlink case plus deterministic filesystem-adapter cases for path-to-descriptor replacement, in-place descriptor mutation, same-byte pathname replacement after reading, short reads, streamed oversize, unsupported open flags, non-files, empty files, and descriptor closure after failure. Existing immutable-release publication tests continue to exercise the complete receipt CLI, exact asset set, digest checks, malformed UTF-8 handling, duplicate JSON keys, immutable-policy checks, and publication evidence contract.

This change does **not** prove that a GitHub Release exists, that Cloudflare deployment succeeded, that production KPIs are healthy, or that legal/IP transfer rights are complete. It strengthens only the local evidence-consumption boundary used when those external facts are eventually captured.

## Standards and implementation basis

POSIX.1-2024 specifies that `open()` with `O_NOFOLLOW` fails when the final pathname component is a symbolic link. Node.js exposes the corresponding filesystem constant and documents that it causes open to fail for a symbolic-link path. Those primitives remove the final-component symlink-follow step from the open operation; the additional descriptor/path identity checks are Noema's application-level control for replacement and mutation across the full read window.

NIST SSDF 1.1 recommends defining, implementing, and verifying software security requirements throughout the development lifecycle. Noema treats release evidence byte identity as such a requirement because publication receipts are later consumed as acquisition and supply-chain evidence.

## References

Node.js contributors. (2026). *File system: Node.js v25.9.0 documentation*. Node.js. https://nodejs.org/download/release/v25.9.0/docs/api/fs.html

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

The Open Group. (2024). *open, openat — open a file*. In *The Open Group Base Specifications Issue 8, IEEE Std 1003.1-2024*. https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html
