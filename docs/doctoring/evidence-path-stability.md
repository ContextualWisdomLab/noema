# Evidence Path Stability Doctoring

## Scope

This note records the reviewed basis for reading retained commercial-readiness evidence through a stable filesystem object rather than trusting a pathname observation alone. It applies to `readBoundedReport()` in `scripts/normalize-commercial-readiness-evidence.mjs`.

## Control rationale

A pathname is a mutable name, while an opened file descriptor identifies the object actually read. POSIX.1-2024 specifies `O_NOFOLLOW` so `open()` does not follow a symbolic link named by the final path component. Node.js exposes the same `O_NOFOLLOW` constant for numeric `fs.open()` flags on supported platforms. Noema therefore requires a real non-zero `O_NOFOLLOW`, opens read-only, and compares the initial path metadata with descriptor metadata before consuming bytes.

`O_NOFOLLOW` protects the open boundary but does not freeze the directory entry after the descriptor has been acquired. A concurrent rename or replacement can leave the descriptor pointing at the originally opened file while the pathname now identifies a different object. For evidence that will later be referred to by pathname, that distinction is material. The reader therefore re-runs `lstat` after the descriptor read and requires the final pathname to remain a bounded regular file with the same device, inode, and byte size as the opened descriptor. The descriptor itself is also revalidated before the pathname check and is closed on every return path.

This is a fail-closed local evidence-integrity control, not an operating-system privilege boundary. It does not claim to prevent a higher-authority actor from mutating storage, prove remote provenance, or establish production truth. Stronger evidence still requires authenticated source identity, content digests, retention controls, and the higher-level schema/provenance checks that consume these bytes.

## Test contract

`test/commercial-readiness-post-read-stability.test.ts` covers descriptor-side non-file/device/inode/size drift and final-path replacement with a symlink, non-file, different device, different inode, or different size. The valid unchanged path remains the GREEN path. A regression that removes the final pathname revalidation causes those deterministic cases to fail before evidence can be accepted.

## References

Institute of Electrical and Electronics Engineers, & The Open Group. (2024). *The Open Group Base Specifications Issue 8, IEEE Std 1003.1-2024: open*. The Open Group. https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html

National Institute of Standards and Technology. (2025). *Secure Software Development Framework (SSDF) Version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218 Rev. 1, Initial Public Draft). https://csrc.nist.gov/pubs/sp/800/218/r1/ipd

OpenJS Foundation. (2026). *Node.js v26.1.0 documentation: File system*. https://nodejs.org/download/release/v26.1.0/docs/api/fs.html
