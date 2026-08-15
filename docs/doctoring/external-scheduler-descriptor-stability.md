# External Scheduler Evidence Descriptor Stability

## Scope

This note records the filesystem-integrity basis for `readExternalSchedulerEvidence()` in `scripts/external-scheduler-evidence-audit.mjs`. The operator consumes a small retained scheduler-evidence file and must fail closed when the opened filesystem object changes while its bytes are being collected.

## Reviewed boundary

Noema already opens the evidence file read-only with `O_NOFOLLOW`, rejects non-regular files, and caps accepted input at 262,144 bytes. POSIX.1-2024 defines `O_NOFOLLOW` at the `open()` boundary, and Node.js exposes `fs.fstatSync()` so metadata can be retrieved from the file descriptor actually being read rather than from a separately resolved pathname.

A pre-read descriptor observation alone cannot demonstrate that descriptor metadata stayed stable through the read. The reader therefore obtains `fs.Stats` both before and after `readFileSync(fd)` and rejects the snapshot when regular-file status, device, inode, byte size, modification time, or status-change time differs. The existing exact-byte-length check remains in front of this second metadata observation, and the descriptor is closed through the existing `finally` path on success and failure.

This is a bounded tamper/change-detection control for retained local evidence. It does not establish host privilege isolation, authenticated scheduler-provider provenance, production execution truth, release/deployment evidence, or acquisition readiness. Filesystem timestamp granularity and higher-authority storage mutation remain environmental limitations; upstream identity and cryptographic provenance must be proven separately.

## Test contract

`test/external-scheduler-evidence-post-read-stability.test.ts` supplies deterministic descriptor metadata before and after the read. It rejects post-read non-file state and drift in device, inode, size, modification time, or status-change time, while the existing real-file happy path proves unchanged bounded evidence remains readable. Because `scripts/external-scheduler-evidence-audit.mjs` is part of the configured owned-production coverage set, the new branches are required to remain covered by the repository's 100% statement/branch/function/line threshold.

## References

Institute of Electrical and Electronics Engineers, & The Open Group. (2024). *The Open Group Base Specifications Issue 8, IEEE Std 1003.1-2024: open*. The Open Group. https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html

National Institute of Standards and Technology. (2025). *Secure Software Development Framework (SSDF) Version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218 Rev. 1, Initial Public Draft). https://csrc.nist.gov/pubs/sp/800/218/r1/ipd

OpenJS Foundation. (2026). *Node.js v26.1.0 documentation: File system (`fs.fstatSync`, `fs.Stats`)*. https://nodejs.org/download/release/v26.1.0/docs/api/fs.html
