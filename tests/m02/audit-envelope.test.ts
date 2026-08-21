import { describe, expect, it } from "vitest";

import type { ActorEnvelope, AuditEnvelope, OutboxEnvelope, TransitionEnvelope } from "../../packages/application-kernel/src/public.js";
import { validateActorEnvelope, validateAuditEnvelope, validateOutboxEnvelope, validateTransitionEnvelope } from "../../packages/core/audit/src/public.js";
import { correlationId, idempotencyKey, safeEventPayload, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const actor: ActorEnvelope = {
  actorKind: "USER",
  authenticatedActorId: uuid("550e8400-e29b-41d4-a716-446655440000"),
  effectiveActorId: uuid("f47ac10b-58cc-4372-a567-0e02b2c3d479"),
  correlationId: correlationId("req:m02-envelope")
};

describe("M02 evidence envelopes", () => {
  it("requires authenticated and effective actors independently", () => {
    expect(validateActorEnvelope(actor)).toBe(actor);
    expect(() => validateActorEnvelope({ actorKind: "USER", authenticatedActorId: actor.authenticatedActorId, correlationId: actor.correlationId })).toThrow(/effective actor/);
  });

  it("requires a one-way fingerprint for anonymous security events", () => {
    expect(() => validateActorEnvelope({ actorKind: "ANONYMOUS", correlationId: actor.correlationId })).toThrow(/fingerprint/);
  });

  it("allows only hash/reason references as audit evidence", () => {
    const entry: AuditEnvelope = {
      id: uuid("11e2a1d0-1234-4f00-8a00-1234567890ab"), actor,
      actionId: stableCode("M02_TEST_ACTION"), resourceType: stableCode("M02_TEST_AGGREGATE"),
      resourceId: uuid("22e2a1d0-1234-4f00-8a00-1234567890ab"), resourceVersion: version(1),
      result: "SUCCEEDED", afterHash: sha256("b".repeat(64)), occurredAt: utcInstant("2026-08-21T00:00:00Z")
    };
    expect(validateAuditEnvelope(entry)).toBe(entry);
    expect(() => validateAuditEnvelope({ ...entry, afterHash: undefined })).toThrow(/evidence/);
  });

  it("requires one-version state transitions and matching correlation", () => {
    const entry: TransitionEnvelope = {
      id: uuid("31e2a1d0-1234-4f00-8a00-1234567890ab"), auditId: uuid("32e2a1d0-1234-4f00-8a00-1234567890ab"), actor,
      aggregateType: stableCode("M02_TEST_AGGREGATE"), aggregateId: uuid("33e2a1d0-1234-4f00-8a00-1234567890ab"),
      machineId: stableCode("M02_TEST_MACHINE"), eventId: stableCode("M02_TEST_ADVANCE"),
      fromState: stableCode("M02_INITIAL"), toState: stableCode("M02_ADVANCED"),
      fromVersion: version(0), toVersion: version(1), reasonCode: stableCode("M02_TEST_REASON"),
      correlationId: actor.correlationId, occurredAt: utcInstant("2026-08-21T00:00:00Z")
    };
    expect(validateTransitionEnvelope(entry)).toBe(entry);
    expect(() => validateTransitionEnvelope({ ...entry, toVersion: version(2) })).toThrow(/exactly once/);
    expect(() => validateTransitionEnvelope({ ...entry, correlationId: correlationId("req:mismatch") })).toThrow(/correlation/);
  });

  it("validates immutable outbox schema metadata", () => {
    const entry: OutboxEnvelope = {
      id: uuid("41e2a1d0-1234-4f00-8a00-1234567890ab"),
      initiatingAuditId: uuid("43e2a1d0-1234-4f00-8a00-1234567890ab"), actor,
      eventId: stableCode("M02_TEST_EVENT"), aggregateType: stableCode("M02_TEST_AGGREGATE"),
      aggregateId: uuid("42e2a1d0-1234-4f00-8a00-1234567890ab"), resourceVersion: version(1),
      correlationId: actor.correlationId, payloadSchemaId: stableCode("M02_TEST_EVENT_PAYLOAD"),
      payloadSchemaVersion: version(1), payload: safeEventPayload({ aggregateId: "42e2a1d0-1234-4f00-8a00-1234567890ab" }),
      idempotencyKey: idempotencyKey("m02:event:1"), occurredAt: utcInstant("2026-08-21T00:00:00Z"), availableAt: utcInstant("2026-08-21T00:00:00Z")
    };
    expect(validateOutboxEnvelope(entry)).toBe(entry);
    expect(() => validateOutboxEnvelope({ ...entry, payloadSchemaVersion: version(0) })).toThrow(/at least 1/);
  });
});
