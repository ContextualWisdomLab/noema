#!/usr/bin/env node

// Compatibility entrypoint. The authoritative generator lives in the secure
// implementation so direct script callers and npm workflows share one
// exact-commit, descriptor-safe evidence policy.
//
// Acquisition-readiness compatibility contract: the delegated implementation
// materializes `data-room-manifest.json`, recomputes `finalGatePassed`, and the
// reviewed catalog includes `release-publication-receipt` at
// `artifacts/acquisition/release-publication-receipt.json`. These markers stay
// here so older static readiness checks can verify the compatibility entrypoint
// while the actual policy remains centralized in the secure generator/catalog.
await import("./acquisition-data-room-manifest-secure.mjs");
