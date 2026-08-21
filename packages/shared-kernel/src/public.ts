/** Public cross-module contracts for @youone/shared-kernel. */

declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type Uuid = Brand<string, "Uuid">;
export type UtcInstant = Brand<string, "UtcInstant">;
export type Version = Brand<number, "Version">;
export type StableCode = Brand<string, "StableCode">;
export type CorrelationId = Brand<string, "CorrelationId">;
export type CausationId = Brand<string, "CausationId">;
export type IdempotencyKey = Brand<string, "IdempotencyKey">;
export type Sha256 = Brand<string, "Sha256">;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = Readonly<Record<string, JsonValue>>;
export type SafeEventPayload = Brand<JsonObject, "SafeEventPayload">;

export type Money = Readonly<{
  amount: string;
  currency: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const OPAQUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/;
const FORBIDDEN_PAYLOAD_KEY =
  /(?:access.?token|refresh.?token|token|password|secret|authorization|auth.?header|cookie|credential|private.?key|signed.?url|raw.?content|source.?content|file.?bytes|request.?body|editor.?json|stack|sql)/i;
const MAX_EVENT_PAYLOAD_CHARACTERS = 32_768;
const MAX_EVENT_PAYLOAD_DEPTH = 12;

export class InvalidValueError extends Error {
  public constructor(public readonly valueName: string, message: string) {
    super(`${valueName}: ${message}`);
    this.name = "InvalidValueError";
  }
}

export function uuid(value: string): Uuid {
  if (!UUID_PATTERN.test(value)) {
    throw new InvalidValueError("uuid", "must be an RFC 4122 UUID");
  }
  return value.toLowerCase() as Uuid;
}

export function utcInstant(value: string | Date): UtcInstant {
  if (typeof value === "string" && !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/i.test(value)) {
    throw new InvalidValueError("utcInstant", "must include an explicit UTC offset or Z suffix");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidValueError("utcInstant", "must be a valid date-time");
  }
  return date.toISOString() as UtcInstant;
}

export function version(value: number): Version {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidValueError("version", "must be a non-negative safe integer");
  }
  return value as Version;
}

export function nextVersion(current: Version): Version {
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new InvalidValueError("version", "cannot exceed Number.MAX_SAFE_INTEGER");
  }
  return version(current + 1);
}

export function stableCode(value: string): StableCode {
  if (!STABLE_CODE_PATTERN.test(value)) {
    throw new InvalidValueError(
      "stableCode",
      "must start with an ASCII letter and contain only letters, numbers, dot, colon, underscore, or hyphen"
    );
  }
  return value as StableCode;
}

function opaqueKey<Name extends "CorrelationId" | "CausationId" | "IdempotencyKey">(
  valueName: Name,
  value: string
): Brand<string, Name> {
  if (!OPAQUE_KEY_PATTERN.test(value)) {
    throw new InvalidValueError(
      valueName,
      "must be 1-128 URL-safe, non-whitespace characters"
    );
  }
  return value as Brand<string, Name>;
}

export function correlationId(value: string): CorrelationId {
  return opaqueKey("CorrelationId", value);
}

export function causationId(value: string): CausationId {
  return opaqueKey("CausationId", value);
}

export function idempotencyKey(value: string): IdempotencyKey {
  return opaqueKey("IdempotencyKey", value);
}

export function sha256(value: string): Sha256 {
  const normalized = value.toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new InvalidValueError("sha256", "must be a 64-character hexadecimal digest");
  }
  return normalized as Sha256;
}

export function money(amount: string, currency: string): Money {
  if (!DECIMAL_PATTERN.test(amount)) {
    throw new InvalidValueError("money.amount", "must be a decimal string with at most 6 places");
  }
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new InvalidValueError("money.currency", "must be a three-letter uppercase code");
  }
  return Object.freeze({ amount, currency });
}

function assertSafePayloadValue(value: JsonValue, depth: number): void {
  if (depth > MAX_EVENT_PAYLOAD_DEPTH) {
    throw new InvalidValueError("eventPayload", "exceeds the maximum nesting depth");
  }
  if (Array.isArray(value)) {
    for (const child of value) assertSafePayloadValue(child, depth + 1);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_PAYLOAD_KEY.test(key)) {
        throw new InvalidValueError("eventPayload", `contains forbidden key: ${key}`);
      }
      assertSafePayloadValue(child, depth + 1);
    }
    return;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new InvalidValueError("eventPayload", "contains a non-finite number");
  }
}

function cloneAndFreeze(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((child) => cloneAndFreeze(child)));
  }
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneAndFreeze(child)]))
    );
  }
  return value;
}

export function safeEventPayload(value: JsonObject): SafeEventPayload {
  assertSafePayloadValue(value, 0);
  const immutableCopy = cloneAndFreeze(value) as JsonObject;
  const serialized = JSON.stringify(immutableCopy);
  if (serialized.length > MAX_EVENT_PAYLOAD_CHARACTERS) {
    throw new InvalidValueError("eventPayload", "exceeds 32768 serialized characters");
  }
  return immutableCopy as SafeEventPayload;
}
