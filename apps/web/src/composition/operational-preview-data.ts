export type OperationalPreviewUser = Readonly<{
  userId: string;
  displayName: string;
  identifier: string;
  accountKind: "INTERNAL" | "VENDOR";
  status: "ACTIVE" | "PENDING" | "DISABLED";
  organization: string;
  department: string;
  position: string;
  role: string;
  validUntil?: string;
  mfaState: "AAL2" | "ENROLLMENT_REQUIRED" | "REVOKED";
}>;

export const previewOperationalUsers: readonly OperationalPreviewUser[] = Object.freeze([
  {
    userId: "a1000000-0000-4000-8000-000000000001",
    displayName: "박현우",
    identifier: "hyunwoo.park@youone.example",
    accountKind: "INTERNAL",
    status: "ACTIVE",
    organization: "유원산업기술",
    department: "기업부설연구소",
    position: "연구소장",
    role: "Lab Director",
    mfaState: "AAL2"
  },
  {
    userId: "a1000000-0000-4000-8000-000000000002",
    displayName: "김도윤",
    identifier: "doyoon.kim@youone.example",
    accountKind: "INTERNAL",
    status: "ACTIVE",
    organization: "유원산업기술",
    department: "기업부설연구소",
    position: "선임연구원",
    role: "Researcher",
    mfaState: "AAL2"
  },
  {
    userId: "a1000000-0000-4000-8000-000000000003",
    displayName: "이서연",
    identifier: "seoyeon.lee@youone.example",
    accountKind: "INTERNAL",
    status: "PENDING",
    organization: "유원산업기술",
    department: "기업부설연구소",
    position: "연구원",
    role: "Researcher",
    mfaState: "ENROLLMENT_REQUIRED"
  },
  {
    userId: "a1000000-0000-4000-8000-000000000004",
    displayName: "최민석",
    identifier: "minseok.choi@vendor.example",
    accountKind: "VENDOR",
    status: "ACTIVE",
    organization: "대성정밀",
    department: "기술영업팀",
    position: "외주 담당자",
    role: "Vendor User",
    validUntil: "2027-03-31",
    mfaState: "AAL2"
  }
]);

export const previewVendorAccounts = Object.freeze([
  {
    vendorId: "a2000000-0000-4000-8000-000000000001",
    vendorName: "대성정밀",
    userCount: 2,
    activeProjectGrants: 1,
    activeContractGrants: 1,
    validUntil: "2027-03-31",
    status: "ACTIVE" as const
  },
  {
    vendorId: "a2000000-0000-4000-8000-000000000002",
    vendorName: "한빛테크",
    userCount: 1,
    activeProjectGrants: 0,
    activeContractGrants: 0,
    validUntil: "2026-12-31",
    status: "REVIEW_REQUIRED" as const
  }
]);

export const previewAuditEvents = Object.freeze([
  { eventId: "AUD-2026-0824-001", action: "identity.assignment.grant", actor: "박현우", subject: "이서연 · Researcher", occurredAt: "2026-08-24 10:18", result: "SUCCESS" as const },
  { eventId: "AUD-2026-0824-002", action: "identity.session.revoke", actor: "Admin-System", subject: "비활성 세션 정리", occurredAt: "2026-08-24 09:42", result: "SUCCESS" as const },
  { eventId: "AUD-2026-0823-017", action: "vendor.scope.read.denied", actor: "최민석", subject: "허용되지 않은 Contract Scope", occurredAt: "2026-08-23 16:05", result: "DENIED" as const }
]);

