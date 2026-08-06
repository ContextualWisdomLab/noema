#!/usr/bin/env node

// Compatibility entrypoint. The authoritative generator lives in the secure
// implementation so direct script callers and npm workflows share one
// exact-commit, descriptor-safe evidence policy.
await import("./acquisition-data-room-manifest-secure.mjs");
