import { describe, expect, it, vi } from "vitest";
import {
  CONTRACT_RESPONSIBILITY_INVARIANT,
  createWarrantyIssue,
} from "../../packages/features/contract/src/public.js";
import { ECO_TRANSITION_MAP, ECR_TRANSITION_MAP } from "../../packages/features/change/src/public.js";
import {
  persistProjectMutation,
  Project,
  type ProjectActorSnapshot,
  type ProjectTransactionContext,
} from "../../packages/features/project/src/public.js";
import { PURCHASE_FORBIDDEN_CAPABILITIES, PURCHASE_TRANSITION_MAP } from "../../packages/features/purchase/src/public.js";
import {
  CAR_TRANSITION_MAP,
  INITIAL_ACCEPTANCE_POLICY_V1,
  NCR_TRANSITION_MAP,
} from "../../packages/features/quality/src/public.js";
import {
  FailClosedRndLifecycleCommandPort,
  RND_FORBIDDEN_CAPABILITIES,
  RND_LIFECYCLE_BLOCKED,
} from "../../packages/features/rnd/src/public.js";
import { SAFETY_P1_EXCLUDED } from "../../packages/features/safety/src/public.js";
import {
  ACCEPTANCE_RESPONSIBILITY_INVARIANT,
} from "../../packages/processes/vendor-acceptance-payment/src/public.js";
import {
  correlationId,
  idempotencyKey,
  stableCode,
  utcInstant,
  uuid,
  version,
} from "../../packages/shared-kernel/src/public.js";

const id = (value: number) => uuid(`c1610000-0000-4000-8000-${String(value).padStart(12, "0")}`);
const ownerId = id(1);
const projectId = id(2);

function actor(authorities: ProjectActorSnapshot["authorities"] = []): ProjectActorSnapshot {
  return { actorKind: "INTERNAL", userId: ownerId, active: true, authorities };
}

function envelope(expected: number, authorities: ProjectActorSnapshot["authorities"], suffix: string) {
  return {
    actor: actor(authorities),
    at: utcInstant("2026-08-23T03:00:00Z"),
    expectedVersion: version(expected),
    eventId: id(10 + expected),
    correlationId: correlationId(`m16-${suffix}`),
    idempotencyKey: idempotencyKey(`m16-${suffix}`),
  };
}

describe("M16 책임 비면제·범위 동결 회귀", () => {
  it("검수·지급 가능·계약 완료 뒤에도 Vendor 책임과 하자 책임을 면제하지 않는다", () => {
    expect(CONTRACT_RESPONSIBILITY_INVARIANT).toEqual({
      acceptanceWaivesVendorResponsibility: false,
      paymentWaivesVendorResponsibility: false,
      warrantySurvivesPerformanceCompletion: true,
    });
    expect(ACCEPTANCE_RESPONSIBILITY_INVARIANT).toEqual({
      acceptanceWaivesVendorResponsibility: false,
      paymentEligibilityWaivesVendorResponsibility: false,
      warrantyAndLatentDefectResponsibilitySurvives: true,
      professionalResponsibilitySurvives: true,
      externalTransferExecuted: false,
    });

    const warranty = createWarrantyIssue({
      warrantyIssueId: id(20),
      contractId: id(21),
      deliverableId: id(22),
      issueCode: "WARRANTY-2026-001",
      summary: "최종 검수 후 발견된 잠재 하자",
      discoveredAt: utcInstant("2026-08-23T03:10:00Z"),
      responsibilityState: "VENDOR_RESPONSIBLE",
    });
    expect(warranty).toMatchObject({
      state: "OPEN",
      acceptanceDoesNotWaiveResponsibility: true,
      paymentDoesNotWaiveResponsibility: true,
    });
  });

  it("Purchase와 R&D는 외부 지급·회계·RCMS를 만들지 않고 R&D lifecycle TBD는 fail-closed 한다", async () => {
    expect(PURCHASE_FORBIDDEN_CAPABILITIES).toEqual(["BANK_TRANSFER", "PAYMENT_INSTRUCTION", "ACCOUNTING_JOURNAL", "VENDOR_PURCHASE_ACCESS"]);
    expect(RND_FORBIDDEN_CAPABILITIES).toEqual(["RCMS_WORKFLOW", "BANK_TRANSFER", "PAYMENT_INSTRUCTION", "ACCOUNTING_JOURNAL", "VAT_REFUND_WORKFLOW", "VENDOR_RND_ACCESS"]);
    expect(RND_LIFECYCLE_BLOCKED).toMatchObject({ availability: "BLOCKED", reason: "OD-030-RND-STATE-MACHINE" });
    const lifecycle = new FailClosedRndLifecycleCommandPort();
    await expect(lifecycle.execute({ rndProgramId: "RND-1", requestedCommand: "SETTLE" })).resolves.toBe(RND_LIFECYCLE_BLOCKED);
  });

  it("Safety Light P0 밖의 P1 업무를 자동 확장하지 않는다", () => {
    expect(SAFETY_P1_EXCLUDED).toEqual(["HAZARDOUS_MATERIAL", "MSDS", "WASTE_LOG", "EMERGENCY_DRILL"]);
  });

  it("Inspection→NCR/CAR→ECR/ECO→Purchase 핵심 수명주기는 명시적 전이와 검수 달성도 정책을 유지한다", () => {
    expect(INITIAL_ACCEPTANCE_POLICY_V1.bands).toEqual([
      { minInclusive: "100", disposition: "ACCEPTED" },
      { minInclusive: "90", maxExclusive: "100", disposition: "CONDITIONAL_ACCEPTANCE" },
      { minInclusive: "60", maxExclusive: "90", disposition: "PARTIAL_ACCEPTANCE" },
      { minInclusive: "0", maxExclusive: "60", disposition: "REJECTED" },
    ]);
    expect(NCR_TRANSITION_MAP["EVT-NCR-REOPEN"]).toEqual({ from: ["CLOSED"], to: "REOPENED" });
    expect(CAR_TRANSITION_MAP["EVT-CAR-VERIFY-INEFFECTIVE"]).toEqual({ from: ["VERIFICATION_REQUIRED"], to: "INEFFECTIVE" });
    expect(ECR_TRANSITION_MAP["EVT-ECR-CREATE-ECO"]).toEqual({ from: ["APPROVED"], to: "CONVERTED_TO_ECO" });
    expect(ECO_TRANSITION_MAP["EVT-ECO-VERIFY"]).toEqual({ from: ["VERIFICATION_PENDING"], to: "EFFECTIVE" });
    expect(PURCHASE_TRANSITION_MAP["EVT-PURCHASE-INSPECTION-FAIL"]).toEqual({ from: ["INSPECTION_PENDING"], to: "CORRECTION_REQUIRED" });
  });

  it("낙관적 잠금 실패 시 Project 상태 이력·감사·Outbox를 추가하지 않는다", async () => {
    const createCommand = envelope(0, [], "create");
    const { expectedVersion: _expectedVersion, ...withoutVersion } = createCommand;
    void _expectedVersion;
    const created = Project.create({
      projectId,
      projectCode: "P-M16-CONCURRENCY",
      name: "동시성 회귀",
      objective: "원자성 검증",
      ownerUserId: ownerId,
      periodStart: "2026-08-23",
      periodEnd: "2027-08-22",
      visibilityCode: stableCode("PROJECT.INTERNAL"),
    }, withoutVersion);
    const mutation = Project.restore(created.snapshot).plan(envelope(1, ["OWNER"], "plan"));
    const appendTransition = vi.fn(async () => undefined);
    const appendAudit = vi.fn(async () => undefined);
    const enqueue = vi.fn(async () => undefined);
    const context = {
      projects: { save: vi.fn(async () => false) },
      evidence: { appendTransition, appendAudit, enqueue },
    } as unknown as ProjectTransactionContext;

    await expect(persistProjectMutation({ transact: async (work) => work(context) }, mutation)).rejects.toThrow("optimistic lock");
    expect(appendTransition).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("도메인 상태 전이는 오래된 버전을 거부하고 미확정 Project close는 닫힌 채 유지한다", () => {
    const stateCreationEnvelope = envelope(0, [], "state-create");
    const { expectedVersion: stateCreationVersion, ...stateCreationCommand } = stateCreationEnvelope;
    void stateCreationVersion;
    const initial = Project.create({
      projectId,
      projectCode: "P-M16-STATE",
      name: "상태 회귀",
      objective: "상태머신 검증",
      ownerUserId: ownerId,
      periodStart: "2026-08-23",
      periodEnd: "2027-08-22",
      visibilityCode: stableCode("PROJECT.INTERNAL"),
    }, stateCreationCommand);
    const aggregate = Project.restore(initial.snapshot);
    aggregate.plan(envelope(1, ["OWNER"], "state-plan"));
    expect(() => aggregate.start(envelope(1, ["PM"], "stale-start"))).toThrowError(expect.objectContaining({ code: "PROJECT_STALE_VERSION" }));
    expect(() => aggregate.beginClose(envelope(2, ["PM"], "blocked-close"))).toThrowError(expect.objectContaining({ code: "OD-014-PROJECT-CLOSE" }));
  });
});
