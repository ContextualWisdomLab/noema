import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hourly commercial-readiness activation evidence", () => {
  it("always runs a read-only activation preflight instead of skipping the whole schedule", () => {
    const workflow = readFileSync(
      ".github/workflows/hourly-commercial-readiness.yml",
      "utf8",
    );

    expect(workflow).toContain("activation_preflight:");
    expect(workflow).toContain("name: scheduler-activation-preflight");
    expect(workflow).toContain("write_ready: ${{ steps.activation.outputs.write_ready }}");
    expect(workflow).toContain(
      "terminal_classification: ${{ steps.activation.outputs.terminal_classification }}",
    );
    expect(workflow).toContain("name: scheduler-activation-evidence");
    expect(workflow).toContain(
      "path: artifacts/operations/hourly-scheduler-activation.json",
    );
    expect(workflow).not.toContain(
      "if: vars.NOEMA_MAINTENANCE_ENABLED == 'true'",
    );
  });

  it("opens the write lane only after the activation preflight proves it is ready", () => {
    const workflow = readFileSync(
      ".github/workflows/hourly-commercial-readiness.yml",
      "utf8",
    );

    expect(workflow).toContain("needs: activation_preflight");
    expect(workflow).toContain(
      "if: needs.activation_preflight.outputs.write_ready == 'true'",
    );
    expect(workflow).toContain(
      "MAINTENANCE_ENABLED: ${{ vars.NOEMA_MAINTENANCE_ENABLED == 'true' }}",
    );
    expect(workflow).toContain(
      "MAINTAINER_APP_CLIENT_ID_CONFIGURED: ${{ vars.NOEMA_MAINTAINER_APP_CLIENT_ID != '' }}",
    );
    expect(workflow).toContain(
      "MAINTAINER_APP_PRIVATE_KEY_CONFIGURED: ${{ secrets.NOEMA_MAINTAINER_APP_PRIVATE_KEY != '' }}",
    );
    expect(workflow).toContain(
      "REVIEWER_LOGIN_CONFIGURED: ${{ vars.NOEMA_REVIEWER_LOGIN != '' }}",
    );
    expect(workflow).toContain("terminal_classification=EXTERNAL_GATE_REMAINS");
    expect(workflow).toContain("terminal_classification=NO_ACTION_NEEDED");
  });
});
