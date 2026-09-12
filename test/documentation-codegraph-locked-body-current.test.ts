import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected #681/#678 documentation authority", () => {
  it("records the CodeGraph substrate repair without importing security authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");

    expect(baseline).toContain(
      "merged PR #681 exact `7072822253b1975cea76dcd7922e1a01d67e7681`",
    );
    expect(baseline).toContain("authenticated Debian snapshot");
    expect(baseline).toContain("Debian 12 and Debian 13 automatic archive primary keys");
    expect(baseline).toContain("Trivy");
    expect(baseline).toContain("immutable release");
    expect(changelog).toContain("PR #681");
    expect(changelog).toContain("CodeGraph sandbox");
    expect(changelog).toContain("2.41-12+deb13u4");
    expect(baseline).not.toContain("#681 transfers quarantine/security authority to Noema");
  });

  it("records locked current-state reader acquisition as a fail-closed Agent Runtime boundary", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/agent-runtime/procedural-current-lifecycle.ts", "utf8");

    expect(baseline).toContain(
      "merged PR #678 exact `ac367cb535525742a1b6f3682d3ab5b14ef66f23`",
    );
    expect(baseline).toContain("locked response body");
    expect(baseline).toContain("invalid_workflow_state_response");
    expect(baseline).toContain("1 MiB");
    expect(baseline).toContain("immutable release");
    expect(changelog).toContain("PR #678");
    expect(changelog).toContain("locked response body");
    expect(changelog).toContain("invalid_workflow_state_response");
    expect(source).toMatch(
      /Reader acquisition is itself part of the untrusted response boundary:[\s\S]*?locked body[\s\S]*?invalid-response diagnostic/,
    );
    expect(baseline).not.toContain("#678 transfers Workflow / Task lifecycle authority to Agent Runtime");
  });

  it("records locked Cloudflare control-plane reader acquisition without importing provider authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("scripts/lib/cloudflare-response.mjs", "utf8");

    expect(baseline).toContain(
      "merged PR #683 exact `01adb5af3d26788926164003bc44a761f5ff3654`",
    );
    expect(baseline).toContain("locked Cloudflare control-plane response body");
    expect(baseline).toContain("response body is not stream-readable");
    expect(baseline).toContain("1 MiB");
    expect(baseline).toContain("immutable release");
    expect(changelog).toContain("PR #683");
    expect(changelog).toContain("locked Cloudflare control-plane response body");
    expect(changelog).toContain("response body is not stream-readable");
    expect(source).toMatch(
      /try \{\s*reader = body\.getReader\(\);\s*\} catch \{\s*throw new Error\(`\$\{operation\} response body is not stream-readable`\);/,
    );
    expect(baseline).not.toContain("#683 transfers Cloudflare/provider authority to Noema");
  });

  it("records locked OIDC replay reader acquisition without importing identity or provider authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/oidc-replay.ts", "utf8");

    expect(baseline).toContain(
      "merged PR #685 exact `93dcf4c50018ce051e3ca917a4e1d63cbca3102d`",
    );
    expect(baseline).toContain("OIDC replay guard");
    expect(baseline).toContain("4,096-byte decision response");
    expect(baseline).toContain("512-byte internal claim request");
    expect(baseline).toContain("locked");
    expect(baseline).toContain("immutable release");
    expect(changelog).toContain("PR #685");
    expect(changelog).toContain("OIDC replay guard");
    expect(changelog).toContain("decision body could not be read");
    expect(source).toMatch(
      /try \{\s*reader = response\.body\.getReader\(\);\s*\} catch \{\s*throw new OidcReplayUnavailable\("OIDC replay guard decision body could not be read"\);/,
    );
    expect(source).toMatch(
      /try \{\s*reader = request\.body\.getReader\(\);\s*\} catch \{\s*return \{ ok: false, status: 400, error: "malformed_json" \};/,
    );
    expect(baseline).not.toContain("#685 transfers OIDC/GitHub identity or provider authority to Noema");
  });

  it("records locked distributed rate-limit reader acquisition without importing foreign authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/rate-limit.ts", "utf8");

    expect(baseline).toContain(
      "merged PR #687 exact `98ec07552f4081bd4ff6b25f1f3ed691c0f3f2b9`",
    );
    expect(baseline).toContain("256-byte request");
    expect(baseline).toContain("4,096-byte decision");
    expect(baseline).toContain("locked");
    expect(baseline).toContain("immutable release");
    expect(baseline).toContain(
      "#687 retains provider/model routing, destination/outbound policy, credential, quarantine/security, release/deployment, and foreign-domain authority with their existing owners",
    );
    expect(changelog).toContain("PR #687");
    expect(changelog).toContain("rate-limit");
    expect(changelog).toContain("decision body could not be read");
    expect(source).toMatch(
      /try \{\s*reader = request\.body\.getReader\(\);\s*\} catch \{\s*return \{ ok: false, status: 400, error: "malformed_json" \};/,
    );
    expect(source).toMatch(
      /try \{\s*reader = response\.body\.getReader\(\);\s*\} catch \{\s*throw new DistributedRateLimitUnavailable\(\s*"rate-limit Durable Object decision body could not be read"/,
    );
    expect(baseline).not.toContain("#687 transfers provider/model routing authority to Noema");
  });
});
