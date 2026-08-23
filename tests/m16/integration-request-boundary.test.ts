import { describe, expect, it, vi } from "vitest";

import {
  createOfflineSyncEndpoint,
  LiveTrustedSyncActorResolver,
  requestCorrelationId,
  SyncRequestAuthenticationError,
  SyncRequestValidationError,
  withRequestCorrelation,
  type TrustedSyncActorFactory
} from "../../apps/web/src/composition/offline-sync.js";
import { getRuntimeReadiness } from "../../apps/web/src/composition/runtime-readiness.js";
import { securityLogRecord } from "../../apps/web/src/composition/security-log.js";

const actorId = "16000000-0000-4000-8000-000000000001";
const commandId = "16000000-0000-4000-8000-000000000002";
const aggregateId = "16000000-0000-4000-8000-000000000003";
const authorityId = "16000000-0000-4000-8000-000000000004";

function command(payload: Record<string, unknown> = { note: "현장 초안" }) {
  return {
    commandId,
    commandType: "CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT",
    actorBinding: {
      authenticatedActorId: actorId,
      effectiveActorId: actorId,
      sessionBindingHash: "a".repeat(64)
    },
    aggregate: { aggregateType: "FIELD_NOTE", aggregateId },
    baseVersion: 1,
    schemaVersion: 1,
    createdAt: "2026-08-23T09:00:00Z",
    payloadHash: "b".repeat(64),
    payload
  };
}

describe("M16 live request boundary", () => {
  it("accepts only a bearer session and passes a validated correlation/authority selection", async () => {
    const expectedActor = Object.freeze({ marker: "trusted" }) as Awaited<ReturnType<TrustedSyncActorFactory["create"]>>;
    const create = vi.fn(async () => expectedActor);
    const resolver = new LiveTrustedSyncActorResolver({ create });
    const request = new Request("http://localhost/api/v1/sync/commands", {
      headers: {
        authorization: "Bearer verified-session-token",
        "x-correlation-id": "request:m16-safe",
        "x-acting-authority-id": authorityId
      }
    });

    await expect(resolver.resolve(request)).resolves.toBe(expectedActor);
    expect(create).toHaveBeenCalledWith("verified-session-token", "request:m16-safe", authorityId);
    await expect(resolver.resolve(new Request(request.url))).rejects.toBeInstanceOf(SyncRequestAuthenticationError);
    await expect(resolver.resolve(new Request(request.url, {
      headers: { authorization: "Bearer ok", "x-acting-authority-id": "body-selected-user" }
    }))).rejects.toBeInstanceOf(SyncRequestAuthenticationError);
  });

  it("replaces an unsafe caller correlation value and returns the same value on the cloned request", () => {
    const unsafe = new Request("http://localhost/api/v1/sync/commands", {
      headers: { "x-correlation-id": "../../secret" }
    });
    const prepared = withRequestCorrelation(unsafe);
    expect(prepared.correlationId).toMatch(/^request:[0-9a-f-]{36}$/);
    expect(requestCorrelationId(prepared.request)).toBe(prepared.correlationId);
  });

  it("rejects non-JSON and oversized requests before application dispatch", async () => {
    const actors = { resolve: vi.fn(async () => Object.freeze({ marker: "trusted" }) as never) };
    const sync = { execute: vi.fn(async () => ({ result: "REJECTED" as const, commandId: commandId as never, reasonCode: "DENIED" as never })) };
    const endpoint = createOfflineSyncEndpoint({ actors, sync });

    await expect(endpoint.execute(new Request("http://localhost", { method: "POST", body: "{}" })))
      .rejects.toBeInstanceOf(SyncRequestValidationError);
    await expect(endpoint.execute(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command({ note: "x".repeat(66_000) }))
    }))).rejects.toBeInstanceOf(SyncRequestValidationError);
    expect(sync.execute).not.toHaveBeenCalled();
  });

  it("reports readiness without exposing configured secret values", () => {
    const unavailable = getRuntimeReadiness({
      REQUEST_DATABASE_URL: "postgresql://secret-database",
      SUPABASE_URL: "https://tenant.example",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key"
    }, null);
    expect(unavailable.status).toBe("not_ready");
    expect(unavailable.components).toContainEqual({
      component: "offline-sync",
      status: "not_ready",
      reasonCode: "SYNC_REQUEST_ADAPTER_NOT_CONFIGURED"
    });
    expect(unavailable.components).toContainEqual({
      component: "request-auth",
      status: "not_ready",
      reasonCode: "REQUEST_AUTH_ADAPTER_NOT_CONFIGURED"
    });
    expect(JSON.stringify(unavailable)).not.toContain("secret");

    const ready = getRuntimeReadiness({
      REQUEST_DATABASE_URL: "configured",
      SUPABASE_URL: "configured",
      SUPABASE_PUBLISHABLE_KEY: "configured"
    }, {} as never, { requestAuth: true, requestDatabase: true });
    expect(ready.status).toBe("ready");
  });

  it("emits a fixed-field structured security record without request secrets", () => {
    const record = securityLogRecord({
      event: "SYNC_REQUEST_DENIED",
      correlationId: "request:m16-safe",
      route: "/api/v1/sync/commands",
      outcome: "SYNC_REQUEST_UNAUTHENTICATED",
      status: 401,
      // The type intentionally has no token/body/user field.
      bearerToken: "must-not-be-serialized"
    } as never, new Date("2026-08-23T10:00:00Z"));
    expect(JSON.parse(record)).toEqual({
      timestamp: "2026-08-23T10:00:00.000Z",
      level: "WARN",
      event: "SYNC_REQUEST_DENIED",
      correlationId: "request:m16-safe",
      route: "/api/v1/sync/commands",
      outcome: "SYNC_REQUEST_UNAUTHENTICATED",
      status: 401
    });
    expect(record).not.toContain("must-not-be-serialized");
  });
});
