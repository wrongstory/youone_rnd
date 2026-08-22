import type { ApprovalDetailView, ApprovalInboxItem } from "@youone/core-approval/public";
import {
  projectVendorChangeListItem,
  type VendorChangeDetailView,
  type VendorChangeListItemView
} from "@youone/feature-change/public";
import type {
  VendorContractBasicDetail,
  VendorContractFinanceDetail,
  VendorContractListSafeItem
} from "@youone/feature-contract/public";
import type { ProjectDetailView, ProjectListItemView } from "@youone/feature-project/public";
import type { PurchaseDetailView, PurchaseListItemView } from "@youone/feature-purchase/public";
import type { RndProgramSummaryView } from "@youone/feature-rnd/public";
import type {
  NcrVendorDetailView,
  NcrVendorListItemView,
  VendorInspectionExternalDetail,
  VendorInspectionExternalListItem
} from "@youone/feature-quality/public";
import { stableCode, utcInstant, uuid, version } from "@youone/shared-kernel/public";

export const PREVIEW_IDS = Object.freeze({
  approvalResearch: "a0000000-0000-4000-8000-000000000001",
  approvalContract: "a0000000-0000-4000-8000-000000000002",
  projectBattery: "b0000000-0000-4000-8000-000000000001",
  projectSensor: "b0000000-0000-4000-8000-000000000002",
  contractController: "c0000000-0000-4000-8000-000000000001",
  contractJig: "c0000000-0000-4000-8000-000000000002",
  inspectionController: "d0000000-0000-4000-8000-000000000001",
  inspectionJig: "d0000000-0000-4000-8000-000000000002",
  ncrController: "e0000000-0000-4000-8000-000000000001",
  ncrJig: "e0000000-0000-4000-8000-000000000002",
  changeController: "91000000-0000-4000-8000-000000000001",
  changeJig: "91000000-0000-4000-8000-000000000002",
  purchaseThermalCamera: "92000000-0000-4000-8000-000000000001",
  purchaseCoolant: "92000000-0000-4000-8000-000000000002",
  rndCooling: "93000000-0000-4000-8000-000000000001",
  rndFactory: "93000000-0000-4000-8000-000000000002",
  researchNoteSeniorReview: "95000000-0000-4000-8000-000000000001",
  researchNoteFinalized: "95000000-0000-4000-8000-000000000002",
  safetyInspectionWeekly: "96000000-0000-4000-8000-000000000001",
  safetyInspectionMonthly: "96000000-0000-4000-8000-000000000002",
  safetyIncident: "97000000-0000-4000-8000-000000000001"
} as const);

export const previewApprovalInbox: readonly ApprovalInboxItem[] = Object.freeze([
  {
    approvalInstanceId: uuid(PREVIEW_IDS.approvalResearch),
    state: "IN_PROGRESS",
    subjectKind: "RESEARCH_PROJECT_APPLICATION",
    submitterDisplayName: "김도윤 책임연구원",
    submittedAt: utcInstant("2026-08-20T01:20:00Z"),
    pendingRole: "APPROVAL"
  },
  {
    approvalInstanceId: uuid(PREVIEW_IDS.approvalContract),
    state: "SUBMITTED",
    subjectKind: "CONTRACT_VERSION",
    submitterDisplayName: "이서연 연구원",
    submittedAt: utcInstant("2026-08-21T05:10:00Z"),
    pendingRole: "REVIEW"
  }
]);

const approvalDetails: readonly ApprovalDetailView[] = Object.freeze([
  {
    approvalInstanceId: uuid(PREVIEW_IDS.approvalResearch),
    generation: 1,
    state: "IN_PROGRESS",
    subjectKind: "RESEARCH_PROJECT_APPLICATION",
    subjectVersion: version(1),
    subjectChecksum: "1".repeat(64),
    sealedLine: [
      {
        stepId: uuid("a1000000-0000-4000-8000-000000000001"),
        role: "APPROVAL",
        completionMode: "SEQUENTIAL",
        required: true,
        participants: [
          {
            participantId: uuid("a2000000-0000-4000-8000-000000000001"),
            displayName: "박현우 연구소장",
            positionId: stableCode("POSITION_LAB_DIRECTOR")
          }
        ]
      }
    ],
    timeline: [
      {
        actionId: uuid("a3000000-0000-4000-8000-000000000001"),
        kind: "SUBMIT",
        at: utcInstant("2026-08-20T01:20:00Z"),
        actorDisplayName: "김도윤 책임연구원"
      },
      {
        actionId: uuid("a3000000-0000-4000-8000-000000000002"),
        kind: "ACTIVATE",
        at: utcInstant("2026-08-20T01:21:00Z"),
        actorDisplayName: "결재 시스템"
      }
    ],
    actions: [
      {
        actionId: stableCode("approval.step.approve"),
        label: "연구소장 동의",
        authorized: true,
        commandAvailable: false,
        decisionId: uuid("a4000000-0000-4000-8000-000000000001"),
        evaluatedAt: utcInstant("2026-08-22T00:00:00Z"),
        evidenceIds: [],
        obligations: [stableCode("audit.approval.action")]
      }
    ]
  },
  {
    approvalInstanceId: uuid(PREVIEW_IDS.approvalContract),
    generation: 1,
    state: "SUBMITTED",
    subjectKind: "CONTRACT_VERSION",
    subjectVersion: version(2),
    subjectChecksum: "2".repeat(64),
    sealedLine: [
      {
        stepId: uuid("a1000000-0000-4000-8000-000000000002"),
        role: "REVIEW",
        completionMode: "SEQUENTIAL",
        required: true,
        participants: [
          {
            participantId: uuid("a2000000-0000-4000-8000-000000000002"),
            displayName: "최민준 구매담당",
            positionId: stableCode("POSITION_PURCHASE_MANAGER")
          }
        ]
      }
    ],
    timeline: [
      {
        actionId: uuid("a3000000-0000-4000-8000-000000000003"),
        kind: "SUBMIT",
        at: utcInstant("2026-08-21T05:10:00Z"),
        actorDisplayName: "이서연 연구원"
      }
    ],
    actions: [
      {
        actionId: stableCode("approval.step.review"),
        label: "검토 의견 등록",
        authorized: true,
        commandAvailable: false,
        decisionId: uuid("a4000000-0000-4000-8000-000000000002"),
        evaluatedAt: utcInstant("2026-08-22T00:00:00Z"),
        evidenceIds: [],
        obligations: [stableCode("audit.approval.action")]
      }
    ]
  }
]);

export function previewApprovalDetail(id: string): ApprovalDetailView | undefined {
  return approvalDetails.find((item) => item.approvalInstanceId === id);
}

export const previewProjects: readonly ProjectDetailView[] = Object.freeze([
  {
    projectId: PREVIEW_IDS.projectBattery,
    projectCode: "RND-2026-004",
    name: "고효율 배터리 냉각모듈 개발",
    state: "ACTIVE",
    ownerDisplayName: "김도윤 책임연구원",
    periodStart: "2026-07-01",
    periodEnd: "2027-03-31",
    formalResearch: true,
    version: 7,
    objective: "산업용 배터리 팩의 열편차를 15% 이상 개선하는 냉각모듈을 개발합니다.",
    visibilityCode: "INTERNAL_PROJECT",
    members: [
      { userId: "user-kim", displayName: "김도윤", projectRoleId: "PROJECT_PM", state: "ACTIVE" },
      { userId: "user-lee", displayName: "이서연", projectRoleId: "RESEARCHER", state: "ACTIVE" }
    ],
    productLinks: [{ productId: "BATTERY-COOLING-V2", relationType: "TARGET_PRODUCT" }],
    rndProgramLinks: [{ rndProgramId: "FORMAL-RND-2026-02", relationType: "DESIGNATED_RESEARCH" }],
    wbs: [
      { wbsNodeId: "wbs-battery-1", nodeKind: "MILESTONE", title: "요구사항·열설계 확정", state: "DONE", progressPercent: 100, version: 4 },
      { wbsNodeId: "wbs-battery-2", nodeKind: "TASK", title: "1차 시제품 제작", state: "IN_PROGRESS", progressPercent: 65, version: 5 },
      { wbsNodeId: "wbs-battery-3", parentId: "wbs-battery-2", nodeKind: "TASK", title: "냉각채널 가공", state: "REVIEW_REQUIRED", progressPercent: 90, version: 3 },
      { wbsNodeId: "wbs-battery-4", nodeKind: "MILESTONE", title: "성능검증 및 연구노트 종결", state: "BACKLOG", progressPercent: 0, version: 1 }
    ]
  },
  {
    projectId: PREVIEW_IDS.projectSensor,
    projectCode: "PJT-2026-011",
    name: "압력센서 검사 자동화 개선",
    state: "PLANNED",
    ownerDisplayName: "정수빈 연구원",
    periodStart: "2026-09-01",
    periodEnd: "2026-12-15",
    formalResearch: false,
    version: 2,
    objective: "수작업 검사기록을 자동 수집하고 불량 추적 시간을 단축합니다.",
    visibilityCode: "INTERNAL_PROJECT",
    members: [{ userId: "user-jung", displayName: "정수빈", projectRoleId: "PROJECT_OWNER", state: "ACTIVE" }],
    productLinks: [],
    rndProgramLinks: [],
    wbs: [
      { wbsNodeId: "wbs-sensor-1", nodeKind: "TASK", title: "현행 검사공정 분석", state: "READY", progressPercent: 10, version: 2 },
      { wbsNodeId: "wbs-sensor-2", nodeKind: "TASK", title: "자동수집 인터페이스 설계", state: "BACKLOG", progressPercent: 0, version: 1 }
    ]
  }
]);

export const previewProjectList: readonly ProjectListItemView[] = previewProjects;

export const previewContracts: readonly VendorContractBasicDetail[] = Object.freeze([
  {
    contractId: PREVIEW_IDS.contractController,
    contractNo: "CT-2026-018",
    vendorId: "vendor-hanseong",
    vendorName: "한성정밀",
    title: "냉각모듈 제어기 시제품 제작",
    state: "ACTIVE",
    effectiveFrom: "2026-08-01",
    effectiveTo: "2026-11-30",
    projectIds: [PREVIEW_IDS.projectBattery],
    currentVersionNo: 2,
    version: 5,
    statementOfWorkDocumentVersionId: "doc-sow-controller-v2",
    milestones: [
      { contractMilestoneId: "milestone-controller-1", sequenceNo: 1, milestoneCode: "M1", title: "회로·기구 설계", dueDate: "2026-09-05" },
      { contractMilestoneId: "milestone-controller-2", sequenceNo: 2, milestoneCode: "M2", title: "시제품 5대 납품", dueDate: "2026-10-20" }
    ],
    deliverables: [
      { deliverableId: "deliverable-controller-design", contractMilestoneId: "milestone-controller-1", deliverableCode: "DLV-001", title: "제어기 설계 패키지", state: "UNDER_REVIEW", submittedVersionId: "deliverable-controller-design-v3" },
      { deliverableId: "deliverable-controller-sample", contractMilestoneId: "milestone-controller-2", deliverableCode: "DLV-002", title: "제어기 시제품 5대", state: "IN_PROGRESS" }
    ],
    guarantees: [{ guaranteeId: "guarantee-controller-1", guaranteeTypeCode: "PERFORMANCE_BOND", validFrom: "2026-08-01", validTo: "2026-12-31", state: "ACTIVE" }],
    warrantyIssues: []
  },
  {
    contractId: PREVIEW_IDS.contractJig,
    contractNo: "CT-2026-021",
    vendorId: "vendor-mirae",
    vendorName: "미래테크",
    title: "센서 검사 지그 제작",
    state: "APPROVAL_PENDING",
    effectiveFrom: "2026-09-01",
    projectIds: [PREVIEW_IDS.projectSensor],
    currentVersionNo: 1,
    version: 3,
    milestones: [{ contractMilestoneId: "milestone-jig-1", sequenceNo: 1, milestoneCode: "M1", title: "검사 지그 납품", dueDate: "2026-10-15" }],
    deliverables: [{ deliverableId: "deliverable-jig", contractMilestoneId: "milestone-jig-1", deliverableCode: "DLV-001", title: "자동 검사 지그 1식", state: "EXPECTED" }],
    guarantees: [],
    warrantyIssues: []
  }
]);

export const previewContractList: readonly VendorContractListSafeItem[] = previewContracts;

export function previewContractFinance(contractId: string): VendorContractFinanceDetail | undefined {
  if (contractId !== PREVIEW_IDS.contractController) return undefined;
  return {
    contractId,
    contractVersionId: "contract-controller-v2",
    contractAmount: { amount: "48000000", currency: "KRW" },
    milestones: [
      { contractMilestoneId: "milestone-controller-1", sequenceNo: 1, plannedAmount: { amount: "19200000", currency: "KRW" }, plannedRatio: "40" },
      { contractMilestoneId: "milestone-controller-2", sequenceNo: 2, plannedAmount: { amount: "28800000", currency: "KRW" }, plannedRatio: "60" }
    ],
    policyProvenance: {
      presetPolicyId: "CONTRACT_PAYMENT_STANDARD",
      presetPolicyVersion: 1,
      legalBaselineId: "LEGAL-BASELINE-2026-01",
      legalBaselineVersion: 1,
      overrideApplied: false,
      approvalInstanceId: PREVIEW_IDS.approvalContract
    }
  };
}

export const previewInspections: readonly VendorInspectionExternalDetail[] = Object.freeze([
  {
    inspectionId: PREVIEW_IDS.inspectionController,
    inspectionNo: "INS-2026-032",
    inspectionTypeCode: "DELIVERABLE_ACCEPTANCE",
    contractId: PREVIEW_IDS.contractController,
    contractMilestoneId: "milestone-controller-1",
    deliverableId: "deliverable-controller-design",
    deliverableVersionId: "deliverable-controller-design-v3",
    state: "CORRECTION_REQUIRED",
    latestExternalDisposition: "CONDITIONAL_ACCEPTANCE",
    version: 6,
    correctionRequest: {
      inspectionId: PREVIEW_IDS.inspectionController,
      inspectionAttemptId: "inspection-attempt-controller-2",
      requestedAt: "2026-08-21T06:30:00Z",
      reason: "EMI 시험성적서와 커넥터 사양 근거를 보완해 주세요.",
      dueAt: "2026-08-28T09:00:00Z"
    },
    attemptHistory: [
      { inspectionAttemptId: "inspection-attempt-controller-1", attemptNo: 1, disposition: "CORRECTION_REQUESTED", achievementPercent: "72", sealedAt: "2026-08-18T07:10:00Z", residualConditions: [] },
      {
        inspectionAttemptId: "inspection-attempt-controller-2",
        attemptNo: 2,
        disposition: "CONDITIONAL_ACCEPTANCE",
        achievementPercent: "91",
        sealedAt: "2026-08-21T06:20:00Z",
        residualConditions: [
          { conditionCode: stableCode("EMI_REPORT_REQUIRED"), description: "EMI 시험성적서 제출", dueAt: utcInstant("2026-08-28T09:00:00Z"), evidenceIds: [] }
        ]
      }
    ]
  },
  {
    inspectionId: PREVIEW_IDS.inspectionJig,
    inspectionNo: "INS-2026-029",
    inspectionTypeCode: "RECEIPT_INSPECTION",
    contractId: PREVIEW_IDS.contractJig,
    contractMilestoneId: "milestone-jig-1",
    deliverableId: "deliverable-jig",
    deliverableVersionId: "deliverable-jig-v1",
    state: "COMPLETED",
    latestExternalDisposition: "PARTIAL_ACCEPTANCE",
    version: 4,
    attemptHistory: [
      { inspectionAttemptId: "inspection-attempt-jig-1", attemptNo: 1, disposition: "PARTIAL_ACCEPTANCE", achievementPercent: "86", sealedAt: "2026-08-19T02:15:00Z", residualConditions: [] }
    ]
  }
]);

export const previewInspectionList: readonly VendorInspectionExternalListItem[] = previewInspections;

export const previewNcrs: readonly NcrVendorDetailView[] = Object.freeze([
  {
    ncrId: PREVIEW_IDS.ncrController,
    ncrNo: "NCR-2026-014",
    severity: "MAJOR",
    state: "IMPLEMENTING",
    contractId: PREVIEW_IDS.contractController,
    deliverableVersionId: "deliverable-controller-design-v3",
    dueAt: "2026-08-30T09:00:00Z",
    scopeSummary: "CT-2026-018 / 제어기 설계 패키지",
    containmentSummary: "EMI 검증 완료 전 해당 설계버전 생산 적용 보류",
    version: 8,
    sourceLinks: [{ kind: "INSPECTION_ATTEMPT", externalReference: "INS-2026-032 / Attempt 2" }],
    assignedCars: [
      { carId: "car-controller-1", carNo: "CAR-2026-019", required: true, rootCause: "부품 변경 시 검증항목 연계 절차 누락", actionPlan: "BOM 변경 체크리스트에 EMI 재검증 Gate 추가", dueAt: "2026-08-27T09:00:00Z", state: "IN_PROGRESS", implementationEvidenceRequired: true, version: 3 },
      { carId: "car-controller-2", carNo: "CAR-2026-020", required: true, rootCause: "시험성적서 제출 책임자 미지정", actionPlan: "납품 패키지별 증빙 책임자 지정", dueAt: "2026-08-29T09:00:00Z", state: "ACCEPTED", implementationEvidenceRequired: true, version: 2 }
    ]
  },
  {
    ncrId: PREVIEW_IDS.ncrJig,
    ncrNo: "NCR-2026-011",
    severity: "MINOR",
    state: "VERIFICATION",
    contractId: PREVIEW_IDS.contractJig,
    deliverableVersionId: "deliverable-jig-v1",
    dueAt: "2026-08-25T09:00:00Z",
    scopeSummary: "CT-2026-021 / 자동 검사 지그",
    containmentSummary: "보정 라벨 재발행 및 기존 라벨 격리",
    version: 9,
    sourceLinks: [{ kind: "DELIVERABLE_VERSION", externalReference: "DLV-001 v1" }],
    assignedCars: [
      { carId: "car-jig-1", carNo: "CAR-2026-016", required: true, rootCause: "라벨 출력 템플릿 버전 통제 누락", actionPlan: "승인 템플릿만 출력되도록 배포 경로 고정", dueAt: "2026-08-23T09:00:00Z", state: "VERIFICATION_REQUIRED", implementationEvidenceRequired: true, version: 5 }
    ]
  }
]);

export const previewNcrList: readonly NcrVendorListItemView[] = previewNcrs;

export const previewChanges: readonly VendorChangeDetailView[] = Object.freeze([
  {
    changeRequestId: PREVIEW_IDS.changeController,
    ecrNo: "ECR-2026-006",
    title: "제어기 EMI 재검증 Gate 및 납품증빙 책임 변경",
    priority: "HIGH",
    state: "CONVERTED_TO_ECO",
    changeOrderId: "92000000-0000-4000-8000-000000000001",
    ecoNo: "ECO-2026-003",
    ecoState: "IMPLEMENTING",
    projectId: PREVIEW_IDS.projectBattery,
    contractId: PREVIEW_IDS.contractController,
    impactSummary: {
      cost: "NO_IMPACT",
      schedule: "AFFECTED",
      quality: "AFFECTED",
      safety: "NO_IMPACT",
      security: "AFFECTED",
      regulatory: "NO_IMPACT"
    },
    exactTargetDisplayRefs: [
      { kind: "DOCUMENT_VERSION", targetId: "target-controller-drawing", displayRef: "제어기 회로도 v3 → v4" },
      { kind: "TEST_PLAN", targetId: "target-controller-emi-plan", displayRef: "EMI 시험계획 v2 → v3" },
      { kind: "DELIVERABLE_VERSION", targetId: "target-controller-deliverable", displayRef: "DLV-001 v3 → v4" }
    ],
    progress: { implementedTargets: 2, totalTargets: 3, verification: "NOT_READY" },
    nextAction: stableCode("change.order.implementation.evidence.submit"),
    assignedImplementationEvidenceIds: ["evidence-eco-controller-drawing", "evidence-eco-controller-test-plan"],
    appliedScope: {
      serialNumbers: ["CTRL-PROT-004", "CTRL-PROT-005"],
      lotNumbers: ["LOT-2608-A"],
      equipmentIds: ["emi-chamber-02"]
    }
  },
  {
    changeRequestId: PREVIEW_IDS.changeJig,
    ecrNo: "ECR-2026-007",
    title: "검사 지그 보정 라벨 발행절차 개정",
    priority: "NORMAL",
    state: "REVIEW_PENDING",
    projectId: PREVIEW_IDS.projectSensor,
    contractId: PREVIEW_IDS.contractJig,
    impactSummary: {
      cost: "NO_IMPACT",
      schedule: "NO_IMPACT",
      quality: "AFFECTED",
      safety: "NO_IMPACT",
      security: "NO_IMPACT",
      regulatory: "NO_IMPACT"
    },
    exactTargetDisplayRefs: [
      { kind: "DOCUMENT_VERSION", targetId: "target-jig-label-procedure", displayRef: "보정 라벨 발행절차 v1 → v2(제안)" }
    ],
    progress: { implementedTargets: 0, totalTargets: 1, verification: "NOT_READY" },
    nextAction: stableCode("change.request.review"),
    assignedImplementationEvidenceIds: []
  }
]);

export const previewChangeList: readonly VendorChangeListItemView[] = Object.freeze(
  previewChanges.map(projectVendorChangeListItem)
);

export const previewPurchases: readonly PurchaseDetailView[] = Object.freeze([
  {
    purchaseRequestId: PREVIEW_IDS.purchaseThermalCamera,
    requestNo: "PUR-2026-034",
    purpose: "냉각모듈 시제품 열분포 검증용 계측기 구매",
    state: "INSPECTION_PENDING",
    totalExpectedAmount: { amount: "8650000", currency: "KRW" },
    selectedSupplierName: "대한계측",
    receivedLineCount: 1,
    totalLineCount: 1,
    inspectionStatus: "PENDING",
    nextAction: stableCode("purchase.inspection.record"),
    lines: [
      {
        lineId: "purchase-line-thermal-camera",
        itemCode: "EQ-THERMAL-001",
        name: "산업용 열화상 카메라",
        specification: "해상도 640×480, 측정범위 -20~650℃",
        quantity: "1",
        receivedQuantity: "1",
        unitCode: "UNIT_EA"
      }
    ],
    quotationSummaries: [
      { supplierName: "대한계측", quotedAmount: { amount: "8650000", currency: "KRW" }, evidenceAvailable: true },
      { supplierName: "한국센서솔루션", quotedAmount: { amount: "9120000", currency: "KRW" }, evidenceAvailable: true }
    ],
    externalPaymentStatus: "CONFIRMED"
  },
  {
    purchaseRequestId: PREVIEW_IDS.purchaseCoolant,
    requestNo: "PUR-2026-037",
    purpose: "2차 시제품 냉각수 및 배관 소모품 확보",
    state: "PARTIALLY_RECEIVED",
    totalExpectedAmount: { amount: "742000", currency: "KRW" },
    selectedSupplierName: "유진산업자재",
    receivedLineCount: 1,
    totalLineCount: 2,
    inspectionStatus: "NOT_REQUESTED",
    nextAction: stableCode("purchase.receipt.record"),
    lines: [
      {
        lineId: "purchase-line-coolant",
        itemCode: "MAT-COOLANT-020",
        name: "저전도 냉각수",
        specification: "20L, 전기전도도 5μS/cm 이하",
        quantity: "10",
        receivedQuantity: "6",
        unitCode: "UNIT_CAN"
      },
      {
        lineId: "purchase-line-hose",
        itemCode: "MAT-HOSE-012",
        name: "내열 실리콘 호스",
        specification: "내경 12mm, 연속사용 180℃",
        quantity: "30",
        receivedQuantity: "0",
        unitCode: "UNIT_M"
      }
    ],
    quotationSummaries: [
      { supplierName: "유진산업자재", quotedAmount: { amount: "742000", currency: "KRW" }, evidenceAvailable: true }
    ],
    externalPaymentStatus: "CONFIRMED"
  }
]);

export const previewPurchaseList: readonly PurchaseListItemView[] = previewPurchases;

export const previewRndPrograms: readonly RndProgramSummaryView[] = Object.freeze([
  {
    rndProgramId: PREVIEW_IDS.rndCooling,
    programCode: "RND-GOV-2026-02",
    title: "산업용 배터리 고효율 열관리 모듈 개발",
    agreementFrom: "2026-07-01",
    agreementTo: "2027-06-30",
    managingAgency: "한국산업기술진흥원",
    projectIds: [PREVIEW_IDS.projectBattery],
    budget: {
      currentBudgetVersionId: "budget-cooling-v2",
      currentBudgetVersionNo: 2,
      totalBudget: { amount: "180000000", currency: "KRW" },
      totalExpenditure: { amount: "68450000", currency: "KRW" },
      balance: { amount: "111550000", currency: "KRW" },
      executionRate: "38.03",
      categoryTotals: [
        { categoryCode: "MATERIAL", budgetAmount: "70000000", expenditureAmount: "31500000" },
        { categoryCode: "EQUIPMENT", budgetAmount: "55000000", expenditureAmount: "26950000" },
        { categoryCode: "OUTSOURCING", budgetAmount: "55000000", expenditureAmount: "10000000" }
      ]
    },
    evidence: { expenditureCount: 18, expenditureWithEvidenceCount: 17, evidenceCount: 32, missingEvidenceCount: 1, overdueEvidenceCount: 0 },
    deadlines: { total: 6, dueSoon: 1, overdue: 0, evidenceIncomplete: 1 }
  },
  {
    rndProgramId: PREVIEW_IDS.rndFactory,
    programCode: "RND-INT-2026-05",
    title: "센서 검사 자동화 및 데이터 추적성 개선",
    agreementFrom: "2026-09-01",
    agreementTo: "2027-02-28",
    managingAgency: "유원산업기술 기업부설연구소",
    projectIds: [PREVIEW_IDS.projectSensor],
    budget: {
      currentBudgetVersionId: "budget-factory-v1",
      currentBudgetVersionNo: 1,
      totalBudget: { amount: "42000000", currency: "KRW" },
      totalExpenditure: { amount: "742000", currency: "KRW" },
      balance: { amount: "41258000", currency: "KRW" },
      executionRate: "1.77",
      categoryTotals: [
        { categoryCode: "MATERIAL", budgetAmount: "12000000", expenditureAmount: "742000" },
        { categoryCode: "EQUIPMENT", budgetAmount: "20000000", expenditureAmount: "0" },
        { categoryCode: "TEST", budgetAmount: "10000000", expenditureAmount: "0" }
      ]
    },
    evidence: { expenditureCount: 1, expenditureWithEvidenceCount: 1, evidenceCount: 2, missingEvidenceCount: 0, overdueEvidenceCount: 0 },
    deadlines: { total: 4, dueSoon: 0, overdue: 0, evidenceIncomplete: 0 }
  }
]);

export const previewResearchNotes = Object.freeze([
  {
    researchNoteId: PREVIEW_IDS.researchNoteSeniorReview,
    noteNo: "RN-2026-041",
    title: "배터리 냉각채널 2차 유동해석",
    state: "DIRECTOR_FINALIZATION_PENDING" as const,
    authorDisplayName: "이서연 연구원",
    researchDate: "2026-08-20",
    projectLinks: [{ projectId: PREVIEW_IDS.projectBattery, projectCode: "RND-2026-004", projectName: "고효율 배터리 냉각모듈 개발" }],
    rndProgramLinks: [{ rndProgramId: PREVIEW_IDS.rndCooling, programCode: "RND-GOV-2026-02", title: "산업용 배터리 고효율 열관리 모듈 개발" }],
    seniorReviewPath: "COMPLETED" as const,
    nextAction: "research_note.finalize",
    entries: [
      { entryId: "rn-41-entry-1", sequenceNo: 1, entryType: "ORIGINAL" as const, heading: "해석 조건", summary: "입구 유량과 열원 조건을 고정하고 냉각채널 형상 세 가지를 비교했습니다.", contentChecksum: "4".repeat(64), recordedAt: "2026-08-20T01:10:00Z", finalized: false },
      { entryId: "rn-41-entry-2", sequenceNo: 2, entryType: "ORIGINAL" as const, heading: "메시 독립성 확인", summary: "선임 검토 의견에 따라 새 수정본으로 고밀도 메시 결과를 추가했습니다.", contentChecksum: "5".repeat(64), recordedAt: "2026-08-21T02:20:00Z", finalized: false }
    ],
    seniorReview: { outcome: "RECOMMEND_FINALIZATION" as const, reviewerDisplayName: "김도윤 선임연구원", comment: "메시 독립성 근거가 보완되어 확정을 권고합니다.", reviewedAt: "2026-08-21T03:00:00Z", officialApproval: false as const },
    correctionChain: [],
    pdfEvidence: null
  },
  {
    researchNoteId: PREVIEW_IDS.researchNoteFinalized,
    noteNo: "RN-2026-038",
    title: "열화상 카메라 수입검사 및 기준온도 측정",
    state: "CORRECTED_BY_ADDENDUM" as const,
    authorDisplayName: "정수빈 연구원",
    researchDate: "2026-08-18",
    projectLinks: [{ projectId: PREVIEW_IDS.projectBattery, projectCode: "RND-2026-004", projectName: "고효율 배터리 냉각모듈 개발" }],
    rndProgramLinks: [{ rndProgramId: PREVIEW_IDS.rndCooling, programCode: "RND-GOV-2026-02", title: "산업용 배터리 고효율 열관리 모듈 개발" }],
    seniorReviewPath: "SKIPPED_BY_POLICY" as const,
    nextAction: null,
    entries: [
      { entryId: "rn-38-entry-1", sequenceNo: 1, entryType: "ORIGINAL" as const, heading: "측정 절차와 결과", summary: "기준 흑체와 비교하여 허용오차 이내임을 확인했습니다.", contentChecksum: "6".repeat(64), recordedAt: "2026-08-18T04:00:00Z", finalized: true },
      { entryId: "rn-38-entry-2", sequenceNo: 2, entryType: "CORRECTION" as const, correctsEntryId: "rn-38-entry-1", heading: "장비 일련번호 정정", summary: "원문을 덮어쓰지 않고 오기된 일련번호를 정정했습니다.", contentChecksum: "7".repeat(64), recordedAt: "2026-08-19T01:10:00Z", finalized: false }
    ],
    correctionChain: [
      { entryId: "rn-38-entry-2", correctsEntryId: "rn-38-entry-1", kind: "CORRECTION" as const }
    ],
    directorFinalization: { finalizedByDisplayName: "박현우 연구소장", finalizedAt: "2026-08-18T07:30:00Z", finalizedVersion: 1, finalizedSnapshotChecksum: "6".repeat(64), representativeApprovalIncluded: false as const },
    pdfEvidence: { documentVersionId: "rn-38-pdf-v3", manifestSchemaId: "RESEARCH_NOTE_PDF_MANIFEST_V1", manifestSchemaVersion: 1, manifestChecksum: "a".repeat(64), pdfContentHash: "b".repeat(64), pageCount: 7, rendererId: "GENERIC_RESEARCH_NOTE_PDF", rendererVersion: "1.0.0", generatedAt: "2026-08-18T07:31:00Z", delivery: "AUTHORIZED_PRIVATE_DELIVERY" as const }
  }
]);

export const previewSafetyOverview = Object.freeze({
  assignments: Object.freeze([
    { assignmentId: "safety-assignment-manager-2026", role: "SAFETY_MANAGER" as const, assigneeDisplayName: "김도윤 선임연구원", scopeLabel: "연구소 전체", effectiveFrom: "2026-01-01" },
    { assignmentId: "safety-assignment-team-cooling", role: "TEAM_COORDINATOR" as const, assigneeDisplayName: "이서연 연구원", scopeLabel: "냉각모듈 연구팀", effectiveFrom: "2026-07-01", effectiveTo: "2027-06-30" }
  ]),
  trainings: Object.freeze([
    { trainingId: "safety-training-2026-08", title: "실험실 전기·화재 예방 정기교육", scheduledAt: "2026-08-19T00:30:00Z", instructorDisplayName: "김도윤 안전관리자", attendeeCount: 12, absentCount: 1, makeUpRequiredCount: 1, completionRate: "91.7" },
    { trainingId: "safety-training-vendor-controller", title: "제어기 시제품 반입 작업 안전교육", scheduledAt: "2026-08-21T00:00:00Z", instructorDisplayName: "이서연 팀 안전담당", attendeeCount: 5, absentCount: 0, makeUpRequiredCount: 0, completionRate: "100.0" }
  ])
});

export const previewSafetyInspections = Object.freeze([
  {
    inspectionId: PREVIEW_IDS.safetyInspectionWeekly, inspectionNo: "SAF-W-2026-034", cadence: "WEEKLY" as const, areaLabel: "시제품 조립구역", state: "STOP_WORK" as const, assignedInspectorDisplayName: "김도윤 안전관리자", scheduledAt: "2026-08-22T00:00:00Z", openFindingCount: 2, stopWorkActive: true, checklistTitle: "주간 연구실 안전점검 v3",
    vendorId: "vendor-hanseong", projectId: PREVIEW_IDS.projectBattery, contractId: PREVIEW_IDS.contractController,
    vendorInstruction: "임시전원 케이블 교체와 통로 정리 완료 전 해당 조립구역 작업을 중지하고 담당 시정과제의 증빙을 제출하세요.", securityOriginalReference: "private://safety/inspection/weekly-034/source",
    findings: [
      { findingId: "safety-finding-cable", criterionLabel: "임시전원 배선", riskLevel: "CRITICAL" as const, summary: "피복 손상 임시전원 케이블이 금속 작업대와 접촉함", stopWorkRequired: true, issuedAt: "2026-08-22T00:22:00Z" },
      { findingId: "safety-finding-aisle", criterionLabel: "피난통로 확보", riskLevel: "HIGH" as const, summary: "부품 상자가 피난통로 폭을 축소함", stopWorkRequired: false, issuedAt: "2026-08-22T00:25:00Z" }
    ],
    tasks: [
      { taskId: "safety-task-vendor-cable", title: "임시전원 케이블 교체 및 절연상태 증빙", responsibleParty: "VENDOR" as const, responsibleDisplayName: "한성정밀 현장책임자", dueAt: "2026-08-22T06:00:00Z", state: "IN_PROGRESS" as const, evidenceStatus: "NOT_SUBMITTED" as const },
      { taskId: "safety-task-internal-aisle", title: "피난통로 적치물 이동", responsibleParty: "INTERNAL" as const, responsibleDisplayName: "이서연 연구원", dueAt: "2026-08-22T04:00:00Z", state: "VERIFICATION" as const, evidenceStatus: "SUBMITTED" as const }
    ], verifications: [],
    timeline: [
      { eventId: "EVT-SAFETY-INSPECTION-START", label: "주간점검 시작", occurredAt: "2026-08-22T00:05:00Z" },
      { eventId: "EVT-SAFETY-FINDINGS-ISSUE", label: "위험 finding 등록", occurredAt: "2026-08-22T00:25:00Z" },
      { eventId: "EVT-SAFETY-STOP-WORK", label: "해당 작업구역 작업중지", occurredAt: "2026-08-22T00:27:00Z" },
      { eventId: "EVT-SAFETY-CORRECTION-ASSIGN", label: "시정 담당 지정", occurredAt: "2026-08-22T00:35:00Z" }
    ]
  },
  {
    inspectionId: PREVIEW_IDS.safetyInspectionMonthly, inspectionNo: "SAF-M-2026-008", cadence: "MONTHLY" as const, areaLabel: "열유동 시험실", state: "CLOSED" as const, assignedInspectorDisplayName: "이서연 팀 안전담당", scheduledAt: "2026-08-05T01:00:00Z", openFindingCount: 0, stopWorkActive: false, checklistTitle: "월간 연구설비 안전점검 v2",
    vendorInstruction: "현재 외주업체에 할당된 안전 지시가 없습니다.", securityOriginalReference: "private://safety/inspection/monthly-008/source",
    findings: [{ findingId: "safety-finding-label", criterionLabel: "비상정지 표지", riskLevel: "MEDIUM" as const, summary: "비상정지 버튼 안내표지 시인성 저하", stopWorkRequired: false, issuedAt: "2026-08-05T01:35:00Z" }],
    tasks: [{ taskId: "safety-task-label", title: "비상정지 안내표지 교체", responsibleParty: "INTERNAL" as const, responsibleDisplayName: "정수빈 연구원", dueAt: "2026-08-07T09:00:00Z", state: "CLOSED" as const, evidenceStatus: "VERIFIED" as const }],
    verifications: [{ verificationId: "safety-verification-label", verifierDisplayName: "김도윤 안전관리자", outcome: "PASSED" as const, verifiedAt: "2026-08-07T07:20:00Z", evidenceCount: 2 }],
    timeline: [{ eventId: "EVT-SAFETY-INSPECTION-START", label: "월간점검 시작", occurredAt: "2026-08-05T01:00:00Z" }, { eventId: "EVT-SAFETY-FINDINGS-ISSUE", label: "finding 등록", occurredAt: "2026-08-05T01:35:00Z" }, { eventId: "EVT-SAFETY-CORRECTION-ASSIGN", label: "시정 담당 지정", occurredAt: "2026-08-05T01:42:00Z" }, { eventId: "EVT-SAFETY-SUBMIT-VERIFY", label: "시정 증빙 제출", occurredAt: "2026-08-07T05:00:00Z" }, { eventId: "EVT-SAFETY-VERIFY-CLOSE", label: "효과 검증 후 종결", occurredAt: "2026-08-07T07:20:00Z" }]
  }
]);

export const previewSafetyIncidents = Object.freeze([
  {
    incidentId: PREVIEW_IDS.safetyIncident, incidentNo: "SAF-INC-2026-003", title: "시제품 냉각수 누출에 따른 미끄러짐", state: "RECURRENCE_ACTION" as const, occurredAt: "2026-08-20T04:10:00Z", areaLabel: "열유동 시험실", investigationDueAt: "2026-08-22T04:10:00Z", investigationSla: "COMPLETED" as const,
    reporterDisplayName: "정수빈 연구원", emergencyResponseSummary: "부상자 응급처치 후 추가 누출을 차단하고 해당 시험설비 전원을 격리했습니다.", sitePreservationStatus: "SECURED" as const, investigationStartedAt: "2026-08-20T07:30:00Z", internalCauseAnalysis: "임시 호스 체결 후 압력 유지 확인 단계가 작업 체크리스트에 누락되어 연결부 풀림을 조기에 발견하지 못했습니다.",
    vendorId: "vendor-hanseong", projectId: PREVIEW_IDS.projectBattery, contractId: PREVIEW_IDS.contractController, vendorInstruction: "한성정밀 담당자는 지정된 호스 체결 토크 증빙 과제만 수행하고 내부 사고조사 내용은 별도 요청 없이 열람할 수 없습니다.", securityOriginalReference: "private://safety/incident/003/investigation", personalTrainingDetails: [{ userId: "internal-user-1", attendance: "MAKE_UP_REQUIRED" }],
    recurrenceTasks: [
      { taskId: "safety-task-vendor-torque", title: "호스 체결 토크 기록 및 사진 증빙 제출", responsibleParty: "VENDOR" as const, responsibleDisplayName: "한성정밀 현장책임자", dueAt: "2026-08-25T09:00:00Z", state: "IN_PROGRESS" as const, evidenceStatus: "SUBMITTED" as const },
      { taskId: "safety-task-internal-checklist", title: "압력 유지 확인을 작업 체크리스트에 추가", responsibleParty: "INTERNAL" as const, responsibleDisplayName: "김도윤 안전관리자", dueAt: "2026-08-26T09:00:00Z", state: "OPEN" as const, evidenceStatus: "NOT_SUBMITTED" as const }
    ], verificationSummary: "모든 재발방지 조치 완료 후 연구소장 효과성 검증 예정", protectedEvidenceCount: 6,
    timeline: [{ eventId: "EVT-SAFETY-INCIDENT-REPORT", label: "사고 보고", occurredAt: "2026-08-20T04:15:00Z" }, { eventId: "EVT-SAFETY-EMERGENCY-RESPOND", label: "응급대응", occurredAt: "2026-08-20T04:17:00Z" }, { eventId: "EVT-SAFETY-SECURE-SITE", label: "현장보존", occurredAt: "2026-08-20T04:35:00Z" }, { eventId: "EVT-SAFETY-START-INVESTIGATION", label: "48시간 조사 시작", occurredAt: "2026-08-20T07:30:00Z" }, { eventId: "EVT-SAFETY-SET-RECURRENCE-ACTION", label: "재발방지 과제 지정", occurredAt: "2026-08-21T06:00:00Z" }]
  }
]);
