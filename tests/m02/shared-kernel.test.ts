import { describe, expect, it } from "vitest";

import {
  causationId, correlationId, idempotencyKey, money, nextVersion, safeEventPayload,
  sha256, stableCode, utcInstant, uuid, version
} from "../../packages/shared-kernel/src/public.js";

describe("M02 shared kernel values", () => {
  it("normalizes UUIDs and UTC instants", () => {
    expect(uuid("550E8400-E29B-41D4-A716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(utcInstant("2026-08-21T12:34:56+09:00")).toBe("2026-08-21T03:34:56.000Z");
    expect(() => utcInstant("2026-08-21T03:34:56")).toThrow(/explicit UTC offset/);
  });

  it("advances only non-negative safe versions", () => {
    expect(nextVersion(version(0))).toBe(1);
    expect(() => version(-1)).toThrow(/non-negative/);
    expect(() => version(1.2)).toThrow(/safe integer/);
  });

  it("keeps money as a decimal string and currency code", () => {
    expect(money("1234567890.123456", "KRW")).toEqual({ amount: "1234567890.123456", currency: "KRW" });
    expect(() => money("1.1234567", "KRW")).toThrow(/decimal string/);
    expect(() => money("100", "krw")).toThrow(/uppercase/);
  });

  it("accepts reviewed stable and opaque IDs", () => {
    expect(stableCode("AUDIT.SECURITY_READ-V1")).toBe("AUDIT.SECURITY_READ-V1");
    expect(correlationId("req:20260821/abc-1")).toBe("req:20260821/abc-1");
    expect(causationId("cmd:abc-1")).toBe("cmd:abc-1");
    expect(idempotencyKey("project:create:abc-1")).toBe("project:create:abc-1");
    expect(sha256("a".repeat(64))).toBe("a".repeat(64));
  });

  it.each([
    { accessToken: "x" }, { refresh_token: "x" }, { cookie: "x" },
    { authorizationHeader: "Bearer x" }, { signedUrl: "https://example.invalid/signed" },
    { stack: "trace" }, { sql: "select secret" }, { requestBody: { value: "raw" } },
    { editorJson: { text: "raw" } }, { nested: [{ sourceContent: "raw evidence" }] }
  ])("rejects sensitive event payload keys: %j", (payload) => {
    expect(() => safeEventPayload(payload)).toThrow(/forbidden key/);
  });

  it("allows small reference-only event payloads", () => {
    const source = { aggregateId: "550e8400-e29b-41d4-a716-446655440000", nested: { version: 2 }, projectionHint: "REQUERY_AUTHORIZED_RESOURCE" };
    const payload = safeEventPayload(source);
    source.nested.version = 3;
    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload.nested)).toBe(true);
    expect(payload.nested).toEqual({ version: 2 });
    expect(payload)
      .toEqual({ aggregateId: "550e8400-e29b-41d4-a716-446655440000", nested: { version: 2 }, projectionHint: "REQUERY_AUTHORIZED_RESOURCE" });
  });
});
