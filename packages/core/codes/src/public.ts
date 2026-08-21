/** Public cross-module contracts for @youone/core-codes. */

export const ACTOR_KINDS = ["ANONYMOUS", "SYSTEM", "USER"] as const;
export const AUDIT_RESULTS = ["DENIED", "FAILED", "SUCCEEDED"] as const;
export const OUTBOX_DELIVERY_STATES = [
  "AVAILABLE",
  "DEAD_LETTER",
  "DELIVERED",
  "LEASED",
  "RETRY_WAIT"
] as const;
export const IDEMPOTENCY_STATES = ["COMPLETED", "IN_PROGRESS"] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];
export type AuditResultCode = (typeof AUDIT_RESULTS)[number];
export type OutboxDeliveryState = (typeof OUTBOX_DELIVERY_STATES)[number];
export type IdempotencyState = (typeof IDEMPOTENCY_STATES)[number];

/**
 * Registry categories only. Business aggregate, action, event, machine, and
 * state rows are introduced by their owning M06+ migrations.
 */
export const REGISTRY_KINDS = [
  "ACTION",
  "AGGREGATE_TYPE",
  "DOMAIN_EVENT",
  "STATE",
  "STATE_MACHINE",
  "TRANSITION"
] as const;

export type RegistryKind = (typeof REGISTRY_KINDS)[number];
