import { describe, expect, it } from "vitest";
import { isReservedProductionHostname } from "../scripts/lib/production-host.mjs";

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
