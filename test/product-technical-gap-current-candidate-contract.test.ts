import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product technical gap current candidate authority", () => {
  it("tracks protected truth and separates moving-stack observations from merge authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "protected `main@e6de53a1c2902cddc09e77a58efb82420cd8f5db`",
    );
    expect(baseline).toContain(
      "central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`",
    );
    expect(baseline).toContain(
      "merged PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`",
    );
    expect(baseline).toContain(
      "merged PR #548 exact `fb44888bd571cae61dbfc93c1b46675855fbfc9c`",
    );
    expect(baseline).toContain(
      "PR #535 exact `4ad6907ae9f97b202a32a9b5e170f275ac9129b9`",
    );
    expect(baseline).toContain(
      "observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`",
    );
    expect(baseline).toContain(
      "live #556 must be re-fetched before integration",
    );
    expect(baseline).toContain(
      "PR #542 exact `195fdd70b267332f246d93beb95fa96fabade52e`",
    );
    expect(baseline).toContain(
      "PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`",
    );
    expect(baseline).toContain(
      "PR #553 exact `c03d946f52faf65b1f9b75c3c601fed106ffcbd0`",
    );
    expect(baseline).toContain("behind_by=0");
    expect(baseline).toContain("predecessor GREEN");

    expect(baseline).not.toContain(
      "protected `main@4c1d174adae3a3cc1ced54913ac2515d768647ef`",
    );
    expect(baseline).not.toContain(
      "PR #535 exact `59205b5ae333a1f2b5e6b2112bf059592ba492c9`",
    );
    expect(baseline).not.toContain(
      "PR #535 exact `329069405181921091397d31687f2c5f7a98ae54`",
    );
    expect(baseline).not.toContain(
      "PR #542 exact `9f2b8afef7ad0ecfd32dd94c3e7581ff66816a84`",
    );
    expect(baseline).not.toContain(
      "PR #550 exact `210fd23f001d4b7ff124480fbbed0c26640b3d12`",
    );
    expect(baseline).not.toContain(
      "PR #553 exact `31d2e5c02c5bff5bbbae07abbad4c5f2a0528990`",
    );
    expect(baseline).not.toContain(
      "현재 protected-source snapshot은 `main@5cd6341866a53351ff412415f677ec2fef23ea33`",
    );
    expect(baseline).not.toContain(
      "Central workflow authority는 `.github/main@c9052e607e5f3cc76e73207e7786b21500721b79`",
    );
  });
});
