/** Public cross-module contracts for @youone/core-audit. */

import type {
  ActorEnvelope,
  AuditEnvelope,
  OutboxEnvelope,
  TransitionEnvelope
} from "@youone/application-kernel/public";
import { nextVersion, type Version } from "@youone/shared-kernel/public";

export class InvalidEnvelopeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidEnvelopeError";
  }
}

export function validateActorEnvelope(actor: ActorEnvelope): ActorEnvelope {
  if (actor.actorKind === "USER") {
    if (actor.authenticatedActorId === undefined || actor.effectiveActorId === undefined) {
      throw new InvalidEnvelopeError("USER actor requires authenticated and effective actor IDs");
    }
    if (actor.anonymousSubjectFingerprint !== undefined || actor.systemActorId !== undefined) {
      throw new InvalidEnvelopeError("USER actor cannot carry anonymous or system identity");
    }
  }

  if (actor.actorKind === "ANONYMOUS") {
    if (actor.anonymousSubjectFingerprint === undefined) {
      throw new InvalidEnvelopeError("ANONYMOUS actor requires a one-way subject fingerprint");
    }
    if (
      actor.authenticatedActorId !== undefined ||
      actor.effectiveActorId !== undefined ||
      actor.systemActorId !== undefined
    ) {
      throw new InvalidEnvelopeError("ANONYMOUS actor cannot carry user or system identity");
    }
  }

  if (actor.actorKind === "SYSTEM") {
    if (actor.systemActorId === undefined) {
      throw new InvalidEnvelopeError("SYSTEM actor requires a stable system actor ID");
    }
    if (actor.anonymousSubjectFingerprint !== undefined) {
      throw new InvalidEnvelopeError("SYSTEM actor cannot carry anonymous identity");
    }
  }

  return Object.freeze(actor);
}

export function validateAuditEnvelope(entry: AuditEnvelope): AuditEnvelope {
  validateActorEnvelope(entry.actor);
  if (
    entry.beforeHash === undefined &&
    entry.afterHash === undefined &&
    entry.reasonRecordRef === undefined &&
    entry.reasonCode === undefined
  ) {
    throw new InvalidEnvelopeError(
      "audit evidence requires a hash, stable reason code, or reason record reference"
    );
  }
  return Object.freeze(entry);
}

export function validateTransitionEnvelope(entry: TransitionEnvelope): TransitionEnvelope {
  validateActorEnvelope(entry.actor);
  if (
    entry.correlationId !== entry.actor.correlationId ||
    entry.causationId !== entry.actor.causationId
  ) {
    throw new InvalidEnvelopeError("transition correlation/causation must match its actor envelope");
  }
  if (entry.toVersion !== nextVersion(entry.fromVersion)) {
    throw new InvalidEnvelopeError("transition must advance the aggregate version exactly once");
  }
  if (entry.fromState !== undefined && entry.fromState === entry.toState) {
    throw new InvalidEnvelopeError("transition must change state");
  }
  return Object.freeze(entry);
}

export function validateOutboxEnvelope(entry: OutboxEnvelope): OutboxEnvelope {
  validateActorEnvelope(entry.actor);
  if (
    entry.correlationId !== entry.actor.correlationId ||
    entry.causationId !== entry.actor.causationId
  ) {
    throw new InvalidEnvelopeError("outbox correlation/causation must match its actor envelope");
  }
  if ((entry.payloadSchemaVersion as number) < 1) {
    throw new InvalidEnvelopeError("outbox payload schema version must be at least 1");
  }
  return Object.freeze(entry);
}

export function assertExpectedVersion(actual: Version, expected: Version): void {
  if (actual !== expected) {
    throw new InvalidEnvelopeError(`stale aggregate version: expected ${expected}, found ${actual}`);
  }
}
