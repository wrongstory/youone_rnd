/** Stable browser/server contract for the P0 operational authentication flow. */
import type { CorrelationId, Sha256, StableCode, UtcInstant, Uuid } from "@youone/shared-kernel/public";

export type OperationalAuthNextAction = "AUTHENTICATED" | "LOGIN" | "MFA_CHALLENGE" | "MFA_ENROLL";

export type OperationalAuthRateLimitAction =
  | "LOGIN"
  | "LOGOUT"
  | "MFA_ENROLL"
  | "MFA_VERIFY"
  | "RECOVERY"
  | "REFRESH";

export type OperationalAuthAttempt = Readonly<{
  action: OperationalAuthRateLimitAction;
  attemptId: Uuid;
  correlationId: CorrelationId;
  globalFingerprint: Sha256;
  occurredAt: UtcInstant;
  policyVersion: StableCode;
  rateLimitAuditId: Uuid;
  subjectFingerprint: Sha256;
}>;

export type OperationalAuthRateLimitDecision = Readonly<{
  allowed: boolean;
  policyVersionId: Uuid;
  retryAfterSeconds: number;
}>;

export type OperationalAuthAttemptOutcome = Readonly<{
  auditId: Uuid;
  policyVersionId: Uuid;
  reasonCode: StableCode;
  result: "DENIED" | "FAILED" | "SUCCEEDED";
}>;

/**
 * Application-owned, distributed abuse-prevention boundary. Implementations must
 * persist only one-way fingerprints and reviewed stable outcome codes.
 */
export interface OperationalAuthAbusePreventionPort {
  consume(attempt: OperationalAuthAttempt): Promise<OperationalAuthRateLimitDecision>;
  recordOutcome(attempt: OperationalAuthAttempt, outcome: OperationalAuthAttemptOutcome): Promise<void>;
}

export type OperationalAuthReasonCode =
  | "AUTH_CSRF_INVALID"
  | "AUTH_IDENTIFIER_INVALID"
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_MFA_CODE_INVALID"
  | "AUTH_MFA_FACTOR_AMBIGUOUS"
  | "AUTH_MFA_FACTOR_REQUIRED"
  | "AUTH_ORIGIN_INVALID"
  | "AUTH_PROVIDER_UNAVAILABLE"
  | "AUTH_RATE_LIMITED"
  | "AUTH_RECOVERY_ACCEPTED"
  | "AUTH_REQUEST_INVALID"
  | "AUTH_SESSION_REQUIRED";

export type OperationalAuthSuccess = Readonly<{
  outcome: "SUCCESS";
  nextAction: OperationalAuthNextAction;
}>;

export type OperationalAuthFailure = Readonly<{
  outcome: "REJECTED" | "UNAVAILABLE";
  reasonCode: OperationalAuthReasonCode;
}>;

export type OperationalAuthResponse = OperationalAuthSuccess | OperationalAuthFailure;

export type OperationalMfaEnrollmentResponse = Readonly<{
  outcome: "SUCCESS";
  nextAction: "MFA_CHALLENGE";
  qrCode: string;
  manualSecret: string;
}> | OperationalAuthFailure;

export type OperationalRecoveryResponse = Readonly<{
  outcome: "ACCEPTED";
  reasonCode: "AUTH_RECOVERY_ACCEPTED";
}> | OperationalAuthFailure;

export type OperationalCsrfResponse = Readonly<{
  outcome: "SUCCESS";
  csrfToken: string;
}>;

export type OperationalActorSessionResponse = Readonly<{
  outcome: "SUCCESS";
  actor: Readonly<{
    accountKind: "INTERNAL" | "VENDOR";
    assuranceLevel: "AAL2";
    authenticatedUserAccountId: string;
    effectiveUserAccountId: string;
    organizations: readonly string[];
    departments: readonly string[];
    positions: readonly string[];
    roles: readonly string[];
  }>;
}> | OperationalAuthFailure;

export type OperationalLogoutResponse = Readonly<{
  outcome: "SUCCESS" | "ACCEPTED";
  nextAction: "LOGIN";
  revocation: "CONFIRMED" | "RECONCILIATION_SCHEDULED";
}> | OperationalAuthFailure;

export interface OperationalSessionPresencePort {
  exists(authSubject: string, sessionId: string): Promise<boolean>;
}
