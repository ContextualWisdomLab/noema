import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  abortContinuationReservation,
  ContinuationDispatchStateConflict,
  ContinuationDispatchStateUnavailable,
  NoemaContinuationDispatchState,
  commitContinuationOutcome,
  finalizeContinuationOutcome,
  reserveContinuationDispatch,
  type ContinuationDispatchReservation,
  type ContinuationDispatchStateEnv,
} from "../src/continuation-dispatch/dispatch-state";
import * as runtimeEntrypoint from "../src/runtime-entrypoint";

const identity = "a".repeat(64);
const digest = "b".repeat(64);
const reservationExpiresAtEpochSeconds = 1_800_000_300;
const endpoint = "https://noema-continuation-dispatch-state.internal/command";

class MemoryStorage {
  readonly records = new Map<string, unknown>();
  transactionCount = 0;
  alarmAt: number | undefined;

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.records.get(key)) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.records.delete(key);
  }

  async transaction<T>(callback: (transaction: MemoryStorage) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return callback(this);
  }

  async setAlarm(timestamp: number): Promise<void> {
    this.alarmAt = timestamp;
  }

  replaceOnlyRecord(value: unknown): void {
    const key = [...this.records.keys()][0];
    if (key === undefined) throw new Error("fixture has no continuation state record");
    this.records.set(key, structuredClone(value));
  }
}

class InProcessNamespace {
  readonly storageByName = new Map<string, MemoryStorage>();

  idFromName(name: string): DurableObjectId {
    return { name, toString: () => name } as unknown as DurableObjectId;
  }

  get(objectId: DurableObjectId): DurableObjectStub {
    const name = objectId.toString();
    const storage = this.storageByName.get(name) ?? new MemoryStorage();
    this.storageByName.set(name, storage);
    const object = new NoemaContinuationDispatchState({
      id: { name } as DurableObjectId,
      storage: storage as unknown as DurableObjectStorage,
    } as unknown as DurableObjectState);
    return {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => object.fetch(new Request(input, init)),
    } as unknown as DurableObjectStub;
  }
}

function fixture(): {
  env: ContinuationDispatchStateEnv;
  namespace: InProcessNamespace;
} {
  const namespace = new InProcessNamespace();
  return {
    env: {
      NOEMA_CONTINUATION_DISPATCH_STATE: namespace as unknown as DurableObjectNamespace,
    },
    namespace,
  };
}

function requireNewReservation(
  reservation: ContinuationDispatchReservation,
): Extract<ContinuationDispatchReservation, { kind: "reserved" }> {
  if (reservation.kind !== "reserved") {
    throw new Error(`expected a new reservation, received ${reservation.kind}`);
  }
  return reservation;
}

function fixedReservation(): Extract<ContinuationDispatchReservation, { kind: "reserved" }> {
  return {
    kind: "reserved",
    identity,
    digest,
    reservationId: "00000000-0000-4000-8000-000000000000",
  };
}

function envWithTransport(
  fetch: DurableObjectStub["fetch"],
  idFromName: (name: string) => DurableObjectId = (name) => (
    { name, toString: () => name } as unknown as DurableObjectId
  ),
): ContinuationDispatchStateEnv {
  return {
    NOEMA_CONTINUATION_DISPATCH_STATE: {
      idFromName,
      get: () => ({ fetch }) as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
  };
}

describe("continuation dispatch exactly-once state", () => {
  it("schedules reservation recovery at the exact OIDC authorization expiry", async () => {
    const { env, namespace } = fixture();

    await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds);

    expect(namespace.storageByName.get(`continuation:${identity}`)?.alarmAt)
      .toBe(reservationExpiresAtEpochSeconds * 1_000);
  });

  it("releases an expired reserved state so a crashed pre-dispatch attempt can be retried", async () => {
    const { env, namespace } = fixture();
    await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds);
    const storage = namespace.storageByName.get(`continuation:${identity}`)!;
    const state = new NoemaContinuationDispatchState({
      id: { name: `continuation:${identity}` } as DurableObjectId,
      storage: storage as unknown as DurableObjectStorage,
    } as unknown as DurableObjectState);
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(reservationExpiresAtEpochSeconds * 1_000);

    await state.alarm();
    dateNow.mockRestore();

    await expect(reserveContinuationDispatch(
      env,
      identity,
      digest,
      reservationExpiresAtEpochSeconds,
    )).resolves.toMatchObject({ kind: "reserved", identity, digest });
  });

  it("reschedules a non-expired reservation at its exact retained expiry", async () => {
    const { env, namespace } = fixture();
    await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds);
    const storage = namespace.storageByName.get(`continuation:${identity}`)!;
    storage.alarmAt = undefined;
    const state = new NoemaContinuationDispatchState({
      id: { name: `continuation:${identity}` } as DurableObjectId,
      storage: storage as unknown as DurableObjectStorage,
    } as unknown as DurableObjectState);
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(
      reservationExpiresAtEpochSeconds * 1_000 - 1,
    );

    await state.alarm();
    dateNow.mockRestore();

    expect(storage.records.size).toBe(1);
    expect(storage.alarmAt).toBe(reservationExpiresAtEpochSeconds * 1_000);
  });

  it("preserves immutable terminal evidence when the reservation alarm fires", async () => {
    const { env, namespace } = fixture();
    const reservation = requireNewReservation(await reserveContinuationDispatch(
      env,
      identity,
      digest,
      reservationExpiresAtEpochSeconds,
    ));
    await commitContinuationOutcome(env, reservation, { outcome: "accepted", receipt_id: "retained" });
    const storage = namespace.storageByName.get(`continuation:${identity}`)!;
    const state = new NoemaContinuationDispatchState({
      id: { name: `continuation:${identity}` } as DurableObjectId,
      storage: storage as unknown as DurableObjectStorage,
    } as unknown as DurableObjectState);
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(reservationExpiresAtEpochSeconds * 1_000);

    await state.alarm();
    dateNow.mockRestore();

    await expect(reserveContinuationDispatch(
      env,
      identity,
      digest,
      reservationExpiresAtEpochSeconds,
    )).resolves.toMatchObject({ kind: "replay", outcome: "accepted" });
  });

  it("grants only the first atomic reservation while an exact concurrent replay stays in progress", async () => {
    const { env, namespace } = fixture();

    const first = await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds);
    const replay = await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds);

    expect(first).toMatchObject({ kind: "reserved", identity, digest });
    expect(first).toHaveProperty("reservationId");
    expect(replay).toEqual({ kind: "in_progress", identity, digest });
    expect(namespace.storageByName.get(`continuation:${identity}`)?.transactionCount).toBe(2);
  });

  it.each(["accepted", "denied", "indeterminate"] as const)(
    "persists an exact %s outcome and replays its receipt without a new dispatch reservation",
    async (outcome) => {
      const { env, namespace } = fixture();
      const reservation = requireNewReservation(
        await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds),
      );
      const receipt = {
        outcome,
        receipt_id: `receipt-${outcome}`,
        request_digest: digest,
      } as const;

      await commitContinuationOutcome(env, reservation, receipt);
      const replay = await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds);

      expect(replay).toEqual({ kind: "replay", identity, digest, outcome, receipt });
      expect(namespace.storageByName.get(`continuation:${identity}`)?.transactionCount).toBe(3);
    },
  );

  it("rejects the same logical identity with a different request digest without changing retained state", async () => {
    const { env, namespace } = fixture();
    await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds);
    const storage = namespace.storageByName.get(`continuation:${identity}`)!;
    const retained = structuredClone([...storage.records.values()][0]);

    await expect(reserveContinuationDispatch(env, identity, "c".repeat(64), reservationExpiresAtEpochSeconds))
      .rejects.toBeInstanceOf(ContinuationDispatchStateConflict);
    expect([...storage.records.values()][0]).toEqual(retained);
  });

  it("releases only the exact fresh reservation before an external effect", async () => {
    const { env } = fixture();
    const reservation = requireNewReservation(await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds));

    await abortContinuationReservation(env, reservation);

    await expect(reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds)).resolves.toMatchObject({
      kind: "reserved",
      identity,
      digest,
    });
  });

  it("upgrades retained indeterminate evidence without changing immutable receipt authority", async () => {
    const { env } = fixture();
    const reservation = requireNewReservation(await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds));
    const pending = {
      outcome: "indeterminate" as const,
      receipt_id: "same-receipt",
      request_digest: digest,
      upstream_status: null,
      signature: "pending-signature",
    };
    const accepted = {
      ...pending,
      outcome: "accepted" as const,
      upstream_status: 204,
      signature: "accepted-signature",
    };

    await commitContinuationOutcome(env, reservation, pending);
    await finalizeContinuationOutcome(env, reservation, accepted);

    await expect(reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds)).resolves.toEqual({
      kind: "replay",
      identity,
      digest,
      outcome: "accepted",
      receipt: accepted,
    });
  });

  it("requires the original reservation capability before committing a terminal outcome", async () => {
    const { env } = fixture();
    const reservation = requireNewReservation(
      await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds),
    );

    await expect(commitContinuationOutcome(env, {
      ...reservation,
      reservationId: crypto.randomUUID(),
    }, {
      outcome: "accepted",
      receipt_id: "wrong-capability",
    })).rejects.toBeInstanceOf(ContinuationDispatchStateConflict);

    await expect(reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds)).resolves.toEqual({
      kind: "in_progress",
      identity,
      digest,
    });
  });

  it.each([
    null,
    "corrupt",
    {},
    { version: "wrong", identity, request_digest: digest, status: "reserved", reservation_id: crypto.randomUUID() },
    { version: "noema.continuation-dispatch-state.v1", identity: "A".repeat(64), request_digest: digest, status: "reserved", reservation_id: crypto.randomUUID() },
    { version: "noema.continuation-dispatch-state.v1", identity, request_digest: digest, status: "accepted", reservation_id: crypto.randomUUID() },
    { version: "noema.continuation-dispatch-state.v1", identity, request_digest: digest, status: "reserved", reservation_id: crypto.randomUUID(), receipt: {} },
  ])("fails closed without replacing malformed retained state %#", async (corrupt) => {
    const { env, namespace } = fixture();
    await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds);
    const storage = namespace.storageByName.get(`continuation:${identity}`)!;
    storage.replaceOnlyRecord(corrupt);

    await expect(reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds))
      .rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
    expect([...storage.records.values()][0]).toEqual(corrupt);
  });

  it("rejects an oversized receipt while preserving the in-progress reservation", async () => {
    const { env } = fixture();
    const reservation = requireNewReservation(
      await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds),
    );

    await expect(commitContinuationOutcome(env, reservation, {
      outcome: "accepted",
      evidence: "x".repeat(16_384),
    })).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
    await expect(reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds)).resolves.toEqual({
      kind: "in_progress",
      identity,
      digest,
    });
  });

  it("retains nested JSON receipt evidence without changing its semantic structure", async () => {
    const { env } = fixture();
    const reservation = requireNewReservation(
      await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds),
    );
    const receipt = {
      outcome: "accepted",
      evidence: [{ claim: "verified", samples: [1, true, null, "exact"] }],
    } as const;

    await commitContinuationOutcome(env, reservation, receipt);

    await expect(reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds)).resolves.toEqual({
      kind: "replay",
      identity,
      digest,
      outcome: "accepted",
      receipt,
    });
  });

  it("fails closed when receipt property access is not deterministic JSON", async () => {
    const receipt = Object.defineProperty({ outcome: "accepted" }, "evidence", {
      enumerable: true,
      get: () => {
        throw new Error("getter failed");
      },
    });

    await expect(commitContinuationOutcome(
      envWithTransport(async () => new Response()),
      fixedReservation(),
      receipt,
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });

  it.each([
    { outcome: "accepted", evidence: undefined },
    { outcome: "accepted", evidence: new Date(0) },
    { outcome: "accepted", evidence: Number.NaN },
    (() => {
      const receipt: Record<string, unknown> = { outcome: "accepted" };
      receipt.evidence = receipt;
      return receipt;
    })(),
  ])("rejects non-JSON receipt values %#", async (receipt) => {
    await expect(commitContinuationOutcome(
      envWithTransport(async () => new Response()),
      fixedReservation(),
      receipt as { readonly outcome: "accepted" },
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });

  it("fails closed when receipt serialization changes after validation", async () => {
    let reads = 0;
    const receipt = Object.defineProperty({ outcome: "accepted" }, "evidence", {
      enumerable: true,
      get: () => {
        reads += 1;
        if (reads === 1) return "initial";
        throw new Error("serialization changed");
      },
    });

    await expect(commitContinuationOutcome(
      envWithTransport(async () => new Response()),
      fixedReservation(),
      receipt,
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });
});

describe("continuation dispatch private command boundary", () => {
  function object(): NoemaContinuationDispatchState {
    return new NoemaContinuationDispatchState({
      id: { name: `continuation:${identity}` } as DurableObjectId,
      storage: new MemoryStorage() as unknown as DurableObjectStorage,
    } as unknown as DurableObjectState);
  }

  it.each([
    new Request(endpoint, { method: "GET" }),
    new Request(`${endpoint}/extra`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
  ])("rejects a wrong endpoint or method", async (request) => {
    const response = await object().fetch(request);
    expect(response.status).toBe(404);
  });

  it("rejects non-JSON, malformed, duplicate, open, and oversized commands before storage", async () => {
    const requests = [
      new Request(endpoint, { method: "POST", body: "{}" }),
      new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }),
      new Request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: `{"operation":"reserve","operation":"commit","identity":"${identity}","digest":"${digest}"}`,
      }),
      new Request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "reserve", identity, digest, extra: true }),
      }),
      new Request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "reserve", identity, digest, padding: "x".repeat(16_384) }),
      }),
    ];

    const statuses: number[] = [];
    for (const request of requests) statuses.push((await object().fetch(request)).status);

    expect(statuses).toEqual([415, 400, 400, 400, 413]);
  });

  it("rejects non-canonical command variants before they can reach storage", async () => {
    const reservationId = fixedReservation().reservationId;
    const requests = [
      { operation: "commit", identity, digest, reservation_id: reservationId, receipt: { outcome: "accepted" }, extra: true },
      { operation: "commit", identity, digest, reservation_id: reservationId, receipt: { outcome: "pending" } },
      { operation: "unknown", identity, digest },
      { identity, digest },
    ].map((body) => new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));

    for (const request of requests) {
      await expect(object().fetch(request).then((response) => response.status)).resolves.toBe(400);
    }
  });

  it("rejects malformed abort and finalize capabilities before storage", async () => {
    const reservationId = fixedReservation().reservationId;
    const requests = [
      { operation: "abort", identity, digest, reservation_id: reservationId, extra: true },
      { operation: "abort", identity: "invalid", digest, reservation_id: reservationId },
      { operation: "finalize", identity, digest, reservation_id: reservationId, receipt: { outcome: "accepted" }, extra: true },
      { operation: "finalize", identity, digest, reservation_id: reservationId, receipt: { outcome: "indeterminate" } },
    ].map((body) => new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));

    for (const request of requests) {
      await expect(object().fetch(request).then((response) => response.status)).resolves.toBe(400);
    }
  });

  it("rejects decoded duplicate keys inside escaped nested array evidence", async () => {
    const body = `{"operation":"commit","identity":"${identity}","digest":"${digest}",`
      + `"reservation_id":"${fixedReservation().reservationId}",`
      + '"receipt":{"outcome":"accepted","items":[{"key":1,"k\\u0065y":2}]}}';
    const response = await object().fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));

    expect(response.status).toBe(400);
  });

  it("accepts insignificant whitespace while scanning decoded object keys", async () => {
    const response = await object().fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"operation"   :"reserve","identity":"${identity}","digest":"${digest}",`
        + `"reservation_expires_at":${reservationExpiresAtEpochSeconds}}`,
    }));

    expect(response.status).toBe(201);
  });

  it.each(["8193", "01", "invalid"])(
    "rejects invalid or over-limit declared request length %s",
    async (contentLength) => {
      const response = await object().fetch(new Request(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": contentLength,
        },
        body: "{}",
      }));

      expect(response.status).toBe(413);
    },
  );

  it("rejects an invalid declared length and an absent request body without cancellation", async () => {
    const invalidLength = await object().fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "invalid" },
    }));
    const noBody = await object().fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
    }));

    expect([invalidLength.status, noBody.status]).toEqual([413, 400]);
  });

  it("rejects a reserve command with a non-canonical digest", async () => {
    const response = await object().fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "reserve",
        identity,
        digest: "invalid",
        reservation_expires_at: reservationExpiresAtEpochSeconds,
      }),
    }));

    expect(response.status).toBe(400);
  });

  it("rejects a non-JSON request with no body", async () => {
    const response = await object().fetch(new Request(endpoint, { method: "POST" }));

    expect(response.status).toBe(415);
  });

  it("fails closed when the request body stream cannot be read", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("request stream failed"));
      },
    });
    const response = await object().fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" }));

    expect(response.status).toBe(400);
  });

  it("fails closed when the request body reader cannot be acquired", async () => {
    const request = new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({}),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const lock = request.body!.getReader();

    await expect(object().fetch(request).then((response) => response.status)).resolves.toBe(400);
    lock.releaseLock();
  });

  it("maps storage transaction failure to a closed unavailable response", async () => {
    const state = new NoemaContinuationDispatchState({
      id: { name: `continuation:${identity}` } as DurableObjectId,
      storage: {
        transaction: async () => {
          throw new Error("storage failed");
        },
      } as unknown as DurableObjectStorage,
    } as unknown as DurableObjectState);
    const response = await state.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "reserve",
        identity,
        digest,
        reservation_expires_at: reservationExpiresAtEpochSeconds,
      }),
    }));

    expect(response.status).toBe(503);
  });

  it("distinguishes absent and corrupt retained state during commit", async () => {
    const reservation = fixedReservation();
    const command = JSON.stringify({
      operation: "commit",
      identity,
      digest,
      reservation_id: reservation.reservationId,
      receipt: { outcome: "accepted" },
    });
    const empty = await object().fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: command,
    }));

    const storage = new MemoryStorage();
    storage.records.set("continuation-dispatch-state", "corrupt");
    const corrupt = new NoemaContinuationDispatchState({
      id: { name: `continuation:${identity}` } as DurableObjectId,
      storage: storage as unknown as DurableObjectStorage,
    } as unknown as DurableObjectState);
    const invalid = await corrupt.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: command,
    }));

    expect([empty.status, invalid.status]).toEqual([409, 500]);
  });

  it.each(["abort", "finalize"] as const)(
    "distinguishes absent, corrupt, and mismatched retained state during %s",
    async (operation) => {
      const reservation = fixedReservation();
      const command = {
        operation,
        identity,
        digest,
        reservation_id: reservation.reservationId,
        ...(operation === "finalize" ? { receipt: { outcome: "accepted" } } : {}),
      };
      const invoke = (state: NoemaContinuationDispatchState) => state.fetch(new Request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      }));

      const absent = await invoke(object());
      const corruptStorage = new MemoryStorage();
      corruptStorage.records.set("continuation-dispatch-state", "corrupt");
      const corrupt = await invoke(new NoemaContinuationDispatchState({
        id: { name: `continuation:${identity}` } as DurableObjectId,
        storage: corruptStorage as unknown as DurableObjectStorage,
      } as unknown as DurableObjectState));
      const { env } = fixture();
      const fresh = requireNewReservation(await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds));
      if (operation === "finalize") {
        await commitContinuationOutcome(env, fresh, { outcome: "accepted" });
      } else {
        await commitContinuationOutcome(env, fresh, { outcome: "indeterminate" });
      }
      const namespace = env.NOEMA_CONTINUATION_DISPATCH_STATE as unknown as InProcessNamespace;
      const mismatched = await invoke(new NoemaContinuationDispatchState({
        id: { name: `continuation:${identity}` } as DurableObjectId,
        storage: namespace.storageByName.get(`continuation:${identity}`)! as unknown as DurableObjectStorage,
      } as unknown as DurableObjectState));

      expect([absent.status, corrupt.status, mismatched.status]).toEqual([409, 500, 409]);
    },
  );

  it("rejects a finalized receipt that would exceed the retained-state byte envelope", async () => {
    const storage = new MemoryStorage();
    const reservation = fixedReservation();
    storage.records.set("continuation-dispatch-state", {
      version: "noema.continuation-dispatch-state.v1",
      identity,
      request_digest: digest,
      status: "indeterminate",
      reservation_id: reservation.reservationId,
      reservation_expires_at: reservationExpiresAtEpochSeconds,
      receipt: { outcome: "indeterminate", receipt_id: "same", signature: "small" },
    });
    const state = new NoemaContinuationDispatchState({
      id: { name: `continuation:${identity}` } as DurableObjectId,
      storage: storage as unknown as DurableObjectStorage,
    } as unknown as DurableObjectState);
    const response = await state.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "finalize",
        identity,
        digest,
        reservation_id: reservation.reservationId,
        receipt: { outcome: "accepted", receipt_id: "same", signature: "x".repeat(7_850) },
      }),
    }));

    expect(response.status).toBe(500);
  });

  it("rejects a terminal record whose retained state crosses the byte envelope", async () => {
    const { env } = fixture();
    const reservation = requireNewReservation(await reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds));
    const receipt = { outcome: "accepted", evidence: "x".repeat(7_900) } as const;

    await expect(commitContinuationOutcome(env, reservation, receipt))
      .rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });

  it("exports and declares the SQLite Durable Object binding", () => {
    expect(runtimeEntrypoint.NoemaContinuationDispatchState)
      .toBe(NoemaContinuationDispatchState);
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    expect(wrangler).toContain('name = "NOEMA_CONTINUATION_DISPATCH_STATE"');
    expect(wrangler).toContain('class_name = "NoemaContinuationDispatchState"');
    expect(wrangler).toContain('[exports.NoemaContinuationDispatchState]\ntype = "durable-object"\nstorage = "sqlite"');
  });
});

describe("continuation dispatch state client boundary", () => {
  it.each([
    new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
    new Response(null, { status: 200, headers: { "content-type": "text/plain" } }),
    new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": "8193" } }),
    new Response(null, { status: 200, headers: { "content-type": "application/json", "content-length": "8193" } }),
    new Response(null, { status: 200, headers: { "content-type": "application/json" } }),
    new Response("{", { status: 200, headers: { "content-type": "application/json" } }),
    new Response('{"ok":true,"ok":false}', { status: 200, headers: { "content-type": "application/json" } }),
  ])("rejects an untrustworthy reservation response %#", async (response) => {
    await expect(reserveContinuationDispatch(
      envWithTransport(async () => response),
      identity,
      digest,
      reservationExpiresAtEpochSeconds,
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });

  it("rejects a streamed reservation response that exceeds the byte envelope", async () => {
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(8_193)));
        controller.close();
      },
    }), { status: 200, headers: { "content-type": "application/json" } });

    await expect(reserveContinuationDispatch(
      envWithTransport(async () => response),
      identity,
      digest,
      reservationExpiresAtEpochSeconds,
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });

  it("normalizes decision reader acquisition failure", async () => {
    const response = new Response(new ReadableStream<Uint8Array>({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const lock = response.body!.getReader();

    await expect(reserveContinuationDispatch(
      envWithTransport(async () => response),
      identity,
      digest,
      reservationExpiresAtEpochSeconds,
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
    lock.releaseLock();
  });

  it.each(["identity", "digest"] as const)("rejects an invalid %s before transport", async (field) => {
    const env = envWithTransport(async () => {
      throw new Error("transport must not run");
    });

    await expect(reserveContinuationDispatch(
      env,
      field === "identity" ? "invalid" : identity,
      field === "digest" ? "invalid" : digest,
      reservationExpiresAtEpochSeconds,
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])(
    "rejects a non-canonical reservation expiry %s before transport",
    async (reservationExpiry) => {
      const env = envWithTransport(async () => {
        throw new Error("transport must not run");
      });

      await expect(reserveContinuationDispatch(env, identity, digest, reservationExpiry))
        .rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
    },
  );

  it.each([new Error("namespace failed"), "namespace failed"])(
    "maps namespace lookup failure %# without leaking transport details",
    async (failure) => {
      const env = envWithTransport(
        async () => new Response(),
        () => {
          throw failure;
        },
      );

      await expect(reserveContinuationDispatch(env, identity, digest, reservationExpiresAtEpochSeconds))
        .rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
    },
  );

  it.each([new Error("fetch failed"), "fetch failed"])(
    "maps reservation transport failure %# to unavailable",
    async (failure) => {
      await expect(reserveContinuationDispatch(
        envWithTransport(async () => {
          throw failure;
        }),
        identity,
        digest,
        reservationExpiresAtEpochSeconds,
      )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
    },
  );

  it("rejects invalid and mismatched successful reservation decisions", async () => {
    const invalid = new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(reserveContinuationDispatch(
      envWithTransport(async () => invalid),
      identity,
      digest,
      reservationExpiresAtEpochSeconds,
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);

    const mismatched = new Response(JSON.stringify({
      ok: true,
      data: { kind: "in_progress", identity: "c".repeat(64), digest },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(reserveContinuationDispatch(
      envWithTransport(async () => mismatched),
      identity,
      digest,
      reservationExpiresAtEpochSeconds,
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });

  it.each([new Error("fetch failed"), "fetch failed"])(
    "maps commit transport failure %# to unavailable",
    async (failure) => {
      await expect(commitContinuationOutcome(
        envWithTransport(async () => {
          throw failure;
        }),
        fixedReservation(),
        { outcome: "accepted" },
      )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
    },
  );

  it.each([
    new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({ ok: true }), { status: 201, headers: { "content-type": "application/json" } }),
  ])("rejects an invalid commit decision %#", async (response) => {
    await expect(commitContinuationOutcome(
      envWithTransport(async () => response),
      fixedReservation(),
      { outcome: "accepted" },
    )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });

  it.each([
    ["abort", abortContinuationReservation, fixedReservation(), undefined],
    ["finalize", finalizeContinuationOutcome, fixedReservation(), { outcome: "accepted" }],
  ] as const)("rejects a non-canonical %s request before transport", async (_name, operation, reservation, receipt) => {
    const invalid = { ...reservation, identity: "invalid" };
    const pending = receipt === undefined
      ? operation(envWithTransport(async () => new Response()), invalid as never)
      : operation(envWithTransport(async () => new Response()), invalid as never, receipt as never);

    await expect(pending).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
  });

  it.each([new Error("fetch failed"), "fetch failed"])(
    "maps abort transport failure %# to unavailable",
    async (failure) => {
      await expect(abortContinuationReservation(
        envWithTransport(async () => { throw failure; }),
        fixedReservation(),
      )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
    },
  );

  it.each([new Error("fetch failed"), "fetch failed"])(
    "maps finalize transport failure %# to unavailable",
    async (failure) => {
      await expect(finalizeContinuationOutcome(
        envWithTransport(async () => { throw failure; }),
        fixedReservation(),
        { outcome: "accepted" },
      )).rejects.toBeInstanceOf(ContinuationDispatchStateUnavailable);
    },
  );

  it.each([
    ["abort", abortContinuationReservation, undefined],
    ["finalize", finalizeContinuationOutcome, { outcome: "accepted" }],
  ] as const)("maps %s conflicts and malformed success decisions", async (_name, operation, receipt) => {
    for (const response of [
      new Response(JSON.stringify({ ok: false }), { status: 409, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "content-type": "application/json" } }),
    ]) {
      const pending = receipt === undefined
        ? operation(envWithTransport(async () => response), fixedReservation())
        : operation(envWithTransport(async () => response), fixedReservation(), receipt);
      await expect(pending).rejects.toBeInstanceOf(
        response.status === 409 ? ContinuationDispatchStateConflict : ContinuationDispatchStateUnavailable,
      );
    }
  });
});
