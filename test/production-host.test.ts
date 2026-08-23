import { describe, expect, it } from "vitest";
import {
  hasCredentialBearingProductionUrl,
  isReservedProductionHostname,
} from "../scripts/lib/production-host.mjs";

describe("production hostname authority", () => {
  it.each([
    "localhost",
    "tenant.localhost",
    "local",
    "tenant.local",
    "0.0.0.0",
    "127.0.0.1",
    "127.255.255.254",
    "[::]",
    "[::1]",
    "::ffff:7f00:1",
    "0.1.2.3",
    "224.0.0.1",
    "255.255.255.255",
    "ff02::1",
    "169.254.10.20",
    "192.0.2.1",
    "198.18.0.1",
    "198.19.255.254",
    "198.51.100.7",
    "203.0.113.9",
    "fe80::1",
    "febf::1",
    "fec0::1",
    "feff::1",
    "2001:db8::1",
    "2001:2::1",
    "2001:2:0:ffff::1",
    "3fff::1",
    "3fff:abc::1",
    "example",
    "tenant.example",
    "invalid",
    "tenant.invalid",
    "test",
    "tenant.test",
    "example.com",
    "logs.example.com",
    "example.net",
    "logs.example.net",
    "example.org",
    "logs.example.org",
  ])("rejects reserved production hostname %s", (host) => {
    expect(isReservedProductionHostname(host)).toBe(true);
  });

  it.each([
    "api.noema.internal",
    "10.20.30.40",
    "172.16.10.20",
    "192.168.10.20",
    "::ffff:a00:5",
    "fd12:3456::10",
    "2001:4860:4860::8888",
    "223.255.255.254",
  ])("preserves legitimate production hostname %s", (host) => {
    expect(isReservedProductionHostname(host)).toBe(false);
  });
});

describe("production URL credential authority", () => {
  it.each([
    "https://collector@logs.acme-corp.com/export",
    "https://collector:secret@logs.acme-corp.com/export",
    "https://:secret@logs.acme-corp.com/export",
    "https://logs.acme-corp.com/export?token=secret",
    "https://logs.acme-corp.com/export?clientSecret=secret",
    "https://logs.acme-corp.com/export?X-Amz-Signature=abc123",
    "https://logs.acme-corp.com/export?%2574oken=secret",
    "https://logs.acme-corp.com/export?mirror=github_pat_EXAMPLEVALUE123456",
    "https://logs.acme-corp.com/export?mirror=%2567hp_EXAMPLEVALUE123456",
    "https://logs.acme-corp.com/export?mirror=npm_abcdefghijklmnopqrstuvwxyz0123456789",
    "https://logs.acme-corp.com/export#access_token=secret",
    "https://logs.acme-corp.com/export#%2574oken=secret",
    "https://logs.acme-corp.com/export#github_pat_EXAMPLEVALUE123456",
  ])("rejects credential-bearing production URL %s", (rawUrl) => {
    expect(hasCredentialBearingProductionUrl(new URL(rawUrl))).toBe(true);
  });

  it.each([
    "https://logs.acme-corp.com/exchange-30d.ndjson",
    "https://logs.acme-corp.com/export?start=2026-07-01T00%3A00%3A00Z&end=2026-08-01T00%3A00%3A00Z",
    "https://logs.acme-corp.com/export#snapshot",
  ])("preserves credential-free production URL %s", (rawUrl) => {
    expect(hasCredentialBearingProductionUrl(new URL(rawUrl))).toBe(false);
  });
});
