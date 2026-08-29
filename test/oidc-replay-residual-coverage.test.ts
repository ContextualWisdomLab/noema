import { afterEach, describe, expect, it, vi } from "vitest";
import { claimOidcTokenUsage } from "../src/oidc-replay";

function namespaceReturning(responseFactory: () => Response): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch() {
          return responseFactory();
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

describe("OIDC replay guard residual production coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an unreviewed top-level object even when authority-like keys are nested inside it", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const response = '{"meta":{"accepted":false},"accepted":true,"expires_at_epoch_seconds":2600}';

    await expect(claimOidcTokenUsage(
      "nested-replay-decision-key",
      2_600,
      {
        NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(() => new Response(response, {
          status: 201,
          headers: { "content-type": "application/json" },
        })),
      },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard returned an invalid decision",
    });
  });

  it("cancels a present body before rejecting a declared oversized decision", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);

    await expect(claimOidcTokenUsage(
      "declared-oversized-present-body",
      2_600,
      {
        NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(() => new Response("{}", {
          status: 201,
          headers: {
            "content-type": "application/json",
            "content-length": "4097",
          },
        })),
      },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard decision exceeds the response byte limit",
    });
  });

  it("rejects a declared oversized decision even when there is no body to cancel", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);

    await expect(claimOidcTokenUsage(
      "declared-oversized-null-body",
      2_600,
      {
        NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(() => new Response(null, {
          status: 201,
          headers: {
            "content-type": "application/json",
            "content-length": "4097",
          },
        })),
      },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard decision exceeds the response byte limit",
    });
  });

  it("cancels a present body before rejecting an unexpected decision media type", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);

    await expect(claimOidcTokenUsage(
      "unexpected-media-present-body",
      2_600,
      {
        NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(() => new Response("not-json", {
          status: 201,
          headers: { "content-type": "text/plain" },
        })),
      },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard returned an unexpected content type",
    });
  });

  it("rejects an unexpected decision media type even when there is no body to cancel", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);

    await expect(claimOidcTokenUsage(
      "unexpected-media-null-body",
      2_600,
      {
        NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(() => new Response(null, {
          status: 201,
          headers: { "content-type": "text/plain" },
        })),
      },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard returned an unexpected content type",
    });
  });
});
