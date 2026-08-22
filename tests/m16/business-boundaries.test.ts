import { describe, expect, it } from "vitest";
import type { ApprovalActorSnapshot } from "../../packages/core/approval/src/public.js";
import {
  projectVendorChangeDetail,
  VENDOR_FORBIDDEN_CHANGE_FIELDS,
  type VendorChangeDetailView,
} from "../../packages/features/change/src/public.js";
import {
  type VendorContractListSafeItem,
} from "../../packages/features/contract/src/public.js";
import {
  Project,
  WbsNode,
  type ProjectActorSnapshot,
  type ProjectCommand,
  type WbsCommand,
} from "../../packages/features/project/src/public.js";
import type {
  NcrVendorDetailView,
} from "../../packages/features/quality/src/public.js";
import {
  projectVendorSafetyScope,
  SAFETY_VENDOR_FORBIDDEN_FIELDS,
} from "../../packages/features/safety/src/public.js";
import type { VendorListSafeItem } from "../../packages/features/vendor/src/public.js";
import {
  ResearchProjectApplication,
} from "../../packages/processes/formal-research-designation/src/public.js";
import {
  correlationId,
  idempotencyKey,
  money,
  sha256,
  stableCode,
  utcInstant,
  uuid,
  version,
} from "../../packages/shared-kernel/src/public.js";

const id = (value: number) => uuid(`c1600000-0000-4000-8000-${String(value).padStart(12, "0")}`);
const creatorId = id(1);
const directorId = id(2);
const projectId = id(3);
const vendorId = id(4);
const applicationId = id(5);
const approvalId = id(6);

function projectActor(input: Partial<ProjectActorSnapshot> = {}): ProjectActorSnapshot {
  return { actorKind: "INTERNAL", userId: creatorId, active: true, authorities: [], ...input };
}

function projectCreateCommand(actor = projectActor()) {
  return {
    actor,
    at: utcInstant("2026-08-23T01:00:00Z"),
    eventId: id(20),
    correlationId: correlationId("m16-project-create"),
    idempotencyKey: idempotencyKey("m16-project-create"),
  };
}

function projectCommand(expected: number, actor: ProjectActorSnapshot, suffix: string): ProjectCommand {
  return {
    ...projectCreateCommand(actor),
    expectedVersion: version(expected),
    eventId: id(20 + expected),
    correlationId: correlationId(`m16-project-${suffix}`),
    idempotencyKey: idempotencyKey(`m16-project-${suffix}`),
  };
}

function approvalActor(userId: ReturnType<typeof id>, positionIds: readonly string[] = []): ApprovalActorSnapshot {
  return {
    actorType: "USER",
    accountKind: "INTERNAL",
    authenticatedUserId: userId,
    effectiveUserId: userId,
    positionIds: positionIds.map(stableCode),
    roleIds: [],
  };
}

function researchCommand(actor: ApprovalActorSnapshot, expected: number, suffix: string) {
  return {
    actor,
    at: utcInstant("2026-08-23T02:00:00Z"),
    expectedVersion: version(expected),
    eventId: id(40 + expected),
    correlationId: correlationId(`m16-research-${suffix}`),
    idempotencyKey: idempotencyKey(`m16-research-${suffix}`),
  };
}

describe("M16 Business 경계 통합 회귀", () => {
  it("일반 Project 생성과 정식 연구과제 승격을 별도 불변 신청본으로 분리한다", () => {
    const ordinary = Project.create({
      projectId,
      projectCode: "P-M16-001",
      name: "일반 프로젝트",
      objective: "승격 전 일반 업무",
      ownerUserId: creatorId,
      periodStart: "2026-08-23",
      periodEnd: "2027-08-22",
      visibilityCode: stableCode("PROJECT.INTERNAL"),
    }, projectCreateCommand());

    expect(ordinary.snapshot).toMatchObject({ state: "DRAFT", version: 1 });
    expect(ordinary.snapshot as unknown as Record<string, unknown>).not.toHaveProperty("formalResearch");

    const applicant = approvalActor(creatorId);
    const researchCreationEnvelope = researchCommand(applicant, 0, "create");
    const { expectedVersion: researchCreationVersion, ...researchCreationCommand } = researchCreationEnvelope;
    void researchCreationVersion;
    const created = ResearchProjectApplication.create({
      applicationVersionId: applicationId,
      applicationRootId: id(7),
      projectId,
      revisionNo: 1,
      applicantUserId: creatorId,
      content: {
        purpose: "정식 연구과제 승격",
        objective: "연구목표",
        researchPlan: "연구계획",
        method: "시험 및 검증",
        teamLeadUserId: creatorId,
        team: [{ userId: creatorId, projectRoleId: stableCode("PROJECT_ROLE.LEAD") }],
        periodStart: "2026-08-23",
        periodEnd: "2027-08-22",
        budget: money("10000000", "KRW"),
        outputs: [{ outputId: id(8), outputTypeId: stableCode("OUTPUT.REPORT"), title: "최종보고서" }],
        securityLevel: "L2",
        safetyApplicable: true,
        allowanceApplicable: true,
        evidenceAttachmentIds: [id(9)],
      },
    }, researchCreationCommand);
    const pending = ResearchProjectApplication.restore(created.application).sealAndSubmit(
      researchCommand(applicant, 1, "submit"),
      { checksum: sha256("a".repeat(64)), approvalInstanceId: approvalId },
    );

    const senior = approvalActor(directorId, ["POSITION_SENIOR_RESEARCHER"]);
    const representative = approvalActor(directorId, ["POSITION_REPRESENTATIVE"]);
    for (const actor of [senior, representative]) {
      expect(() => ResearchProjectApplication.restore(pending.application).applyDirectorConsent(
        researchCommand(actor, 2, "forbidden"),
        { designationId: id(10), approvalInstanceId: approvalId, approvalVersion: version(1) },
      )).toThrowError(expect.objectContaining({ code: "RP_LAB_DIRECTOR_ONLY" }));
    }

    const approved = ResearchProjectApplication.restore(pending.application).applyDirectorConsent(
      researchCommand(approvalActor(directorId, ["POSITION_LAB_DIRECTOR"]), 2, "consent"),
      { designationId: id(10), approvalInstanceId: approvalId, approvalVersion: version(1) },
    );
    expect(approved.designation).toMatchObject({ projectId, applicationVersionId: applicationId, directorUserId: directorId, state: "APPROVED" });
  });

  it("Vendor WBS 작업은 정확한 배정 Vendor와 활성 Scope를 모두 요구하고 내부 검토만 완료한다", () => {
    const pm = projectActor({ authorities: ["PM"] });
    const created = WbsNode.create({
      wbsNodeId: id(11),
      projectId,
      nodeKind: "TASK",
      title: "외주 성능시험",
      sortOrder: 1,
      ownerUserId: creatorId,
      assignedVendorId: vendorId,
      progressPercent: 0,
    }, { ...projectCreateCommand(pm), projectIsActive: true });
    const node = WbsNode.restore(created.snapshot);
    node.ready({ ...projectCommand(1, pm, "ready"), projectIsActive: true });

    const missingScope = projectActor({ actorKind: "VENDOR", userId: undefined, vendorId, authorities: ["VENDOR_ASSIGNEE"] });
    const wrongVendor = projectActor({ actorKind: "VENDOR", userId: undefined, vendorId: id(12), projectScopeId: id(13), projectScopeProjectId: projectId, projectScopeValidFrom: utcInstant("2026-08-01T00:00:00Z"), authorities: ["VENDOR_ASSIGNEE"] });
    const wrongProjectScope = projectActor({ actorKind: "VENDOR", userId: undefined, vendorId, projectScopeId: id(13), projectScopeProjectId: id(99), projectScopeValidFrom: utcInstant("2026-08-01T00:00:00Z"), authorities: ["VENDOR_ASSIGNEE"] });
    const expiredScope = projectActor({ actorKind: "VENDOR", userId: undefined, vendorId, projectScopeId: id(13), projectScopeProjectId: projectId, projectScopeValidFrom: utcInstant("2026-08-01T00:00:00Z"), projectScopeValidUntil: utcInstant("2026-08-23T01:00:00Z"), authorities: ["VENDOR_ASSIGNEE"] });
    expect(() => node.start({ ...projectCommand(2, missingScope, "missing-scope"), projectIsActive: true })).toThrowError(expect.objectContaining({ code: "WBS_VENDOR_SCOPE_REQUIRED" }));
    expect(() => node.start({ ...projectCommand(2, wrongVendor, "wrong-vendor"), projectIsActive: true })).toThrowError(expect.objectContaining({ code: "WBS_VENDOR_SCOPE_REQUIRED" }));
    expect(() => node.start({ ...projectCommand(2, wrongProjectScope, "wrong-project"), projectIsActive: true })).toThrowError(expect.objectContaining({ code: "WBS_VENDOR_SCOPE_REQUIRED" }));
    expect(() => node.start({ ...projectCommand(2, expiredScope, "expired-scope"), projectIsActive: true })).toThrowError(expect.objectContaining({ code: "WBS_VENDOR_SCOPE_REQUIRED" }));

    const scopedVendor = projectActor({ actorKind: "VENDOR", userId: undefined, vendorId, projectScopeId: id(13), projectScopeProjectId: projectId, projectScopeValidFrom: utcInstant("2026-08-01T00:00:00Z"), projectScopeValidUntil: utcInstant("2026-09-01T00:00:00Z"), authorities: ["VENDOR_ASSIGNEE"] });
    node.start({ ...projectCommand(2, scopedVendor, "start"), projectIsActive: true });
    node.submitReview({ ...projectCommand(3, scopedVendor, "submit"), projectIsActive: true, evidenceSatisfied: true } as WbsCommand);
    expect(() => node.accept({ ...projectCommand(4, scopedVendor, "self-accept"), projectIsActive: true })).toThrowError(expect.objectContaining({ code: "WBS_INTERNAL_REVIEWER_REQUIRED" }));
    expect(node.accept({ ...projectCommand(4, projectActor({ authorities: ["INTERNAL_REVIEWER"] }), "accept"), projectIsActive: true }).snapshot).toMatchObject({ state: "DONE", progressPercent: 100 });
  });

  it("Vendor 응답 계약은 금액·지급·내부판단 필드를 노출하지 않는다", () => {
    type VendorForbidden = Extract<keyof VendorListSafeItem, "evaluations" | "internalOpinion" | "riskLevel" | "contractAmount" | "paymentStatus">;
    type ContractForbidden = Extract<keyof VendorContractListSafeItem, "contractAmount" | "currency" | "plannedAmount" | "paymentStatus" | "internalEvaluation" | "riskLevel">;
    type NcrForbidden = Extract<keyof NcrVendorDetailView, "responsibilityHistory" | "internalNotes" | "approvalParticipants" | "contractAmount">;
    const compileTimeBoundary: [VendorForbidden, ContractForbidden, NcrForbidden] extends [never, never, never] ? true : false = true;
    expect(compileTimeBoundary).toBe(true);

    const source = {
      changeRequestId: "ECR-1",
      ecrNo: "ECR-2026-001",
      title: "도면 변경",
      priority: "HIGH" as const,
      state: "APPROVED" as const,
      changeOrderId: "ECO-1",
      ecoNo: "ECO-2026-001",
      ecoState: "IMPLEMENTING" as const,
      projectId: String(projectId),
      contractId: "CONTRACT-1",
      impactSummary: { cost: "AFFECTED" as const, schedule: "AFFECTED" as const, quality: "AFFECTED" as const, safety: "NO_IMPACT" as const, security: "NO_IMPACT" as const, regulatory: "NO_IMPACT" as const },
      exactTargetDisplayRefs: [{ kind: "DOCUMENT_VERSION" as const, targetId: "TARGET-1", displayRef: "DWG-01 Rev.2" }],
      progress: { implementedTargets: 1, totalTargets: 2, verification: "NOT_READY" as const },
      nextAction: stableCode("change.order.implement"),
      assignedImplementationEvidenceIds: ["EVIDENCE-1"],
      internalImpactDeliberation: "외부 노출 금지",
      approvalParticipants: ["내부 결재자"],
      contractAmount: "100000000",
      legalNotes: "법무 의견",
      securityFindings: "보안 취약점",
      internalNotes: "내부 메모",
      temporaryAuthorityInternalReasoning: "대행권한 판단",
    } satisfies VendorChangeDetailView & Record<(typeof VENDOR_FORBIDDEN_CHANGE_FIELDS)[number], unknown>;
    const projected = projectVendorChangeDetail(source);
    for (const field of VENDOR_FORBIDDEN_CHANGE_FIELDS) expect(projected).not.toHaveProperty(field);

    const safety = projectVendorSafetyScope({
      safetyRecordId: "SAFE-1",
      recordKind: "CORRECTIVE_TASK",
      title: "방호덮개 보완",
      state: "OPEN",
      projectId: String(projectId),
      dueAt: "2026-08-30",
      nextAction: stableCode("safety.finding.correct"),
      injuredPersonIdentity: "민감정보",
      medicalDetails: "민감정보",
      causeDeliberation: "내부 검토",
      internalNotes: "내부 메모",
      employeeDiscipline: "인사정보",
      privateEvidence: ["PRIVATE"],
      storagePath: "private/path",
      signedUrl: "https://example.invalid/private",
    });
    for (const field of SAFETY_VENDOR_FORBIDDEN_FIELDS) expect(safety).not.toHaveProperty(field);
  });
});
