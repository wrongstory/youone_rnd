import { describe, expect, it, vi } from "vitest";
import { VendorProfile, type VendorActorSnapshot, type VendorCommand } from "../../packages/features/vendor/src/domain/vendor.js";
import { persistVendorEvaluation, type VendorTransactionContext, type VendorListSafeItem } from "../../packages/features/vendor/src/application/contracts.js";
import { correlationId, idempotencyKey, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const managerId = uuid("70000000-0000-4000-8000-000000000001");
const vendorId = uuid("70000000-0000-4000-8000-000000000002");
const eventId = uuid("70000000-0000-4000-8000-000000000003");
function actor(input: Partial<VendorActorSnapshot> = {}): VendorActorSnapshot { return { actorKind: "INTERNAL", userId: managerId, active: true, authorities: ["VENDOR_MANAGER", "VENDOR_EVALUATOR"], ...input }; }
function baseCommand(a = actor()) { return { actor: a, at: utcInstant("2026-08-22T01:00:00Z"), eventId, correlationId: correlationId("m07-vendor"), idempotencyKey: idempotencyKey("m07-vendor") }; }
function command(expected: number, a = actor(), reason?: string): VendorCommand { return { ...baseCommand(a), expectedVersion: version(expected), ...(reason ? { reason } : {}) }; }
function created() { return VendorProfile.create({ vendorId, vendorCode: "V-001", legalName: "외주기업", businessRegistrationNumber: "123-45-67890", representativeName: "대표", contactEmail: "vendor@example.com" }, baseCommand()); }

describe("Vendor profile and internal evaluation boundary", () => {
  it("allows only authorized active internal actors to create profiles and evaluations", () => {
    expect(created().snapshot).toMatchObject({ state: "ACTIVE", version: 1 });
    const aggregate = VendorProfile.restore(created().snapshot);
    const evaluation = aggregate.evaluate({ vendorEvaluationId: uuid("70000000-0000-4000-8000-000000000004"), evaluationCode: stableCode("VENDOR.EVAL.INITIAL"), riskLevel: "LOW", score: 85, internalOpinion: "내부 평가" }, command(1));
    expect(evaluation.snapshot).toMatchObject({ vendorId, evaluatorUserId: managerId, score: 85 });
    expect(() => aggregate.evaluate({ vendorEvaluationId: uuid("70000000-0000-4000-8000-000000000005"), evaluationCode: stableCode("VENDOR.EVAL.BAD"), riskLevel: "HIGH", internalOpinion: "외부 시도" }, command(1, actor({ actorKind: "VENDOR", userId: undefined, authorities: [] })))).toThrowError(expect.objectContaining({ code: "VENDOR_INTERNAL_AUTHORITY_REQUIRED" }));
  });

  it("uses optimistic lifecycle transitions and requires reasons", () => {
    const aggregate = VendorProfile.restore(created().snapshot);
    expect(() => aggregate.suspend(command(1))).toThrowError(expect.objectContaining({ code: "VENDOR_SUSPEND_REASON_REQUIRED" }));
    expect(aggregate.suspend(command(1, actor(), "보안 점검")).snapshot).toMatchObject({ state: "SUSPENDED", version: 2 });
    expect(() => aggregate.activate(command(1, actor(), "오래된 명령"))).toThrowError(expect.objectContaining({ code: "VENDOR_STALE_VERSION" }));
  });

  it("keeps internal evaluation and finance outside the list-safe type", () => {
    type Forbidden = Extract<keyof VendorListSafeItem, "contractAmount" | "paymentStatus" | "evaluations" | "internalOpinion" | "riskLevel">;
    const typeHasNoForbiddenFields: Forbidden extends never ? true : false = true;
    const item: VendorListSafeItem = { vendorId, vendorCode: "V-001", legalName: "외주기업", state: "ACTIVE" };
    expect(typeHasNoForbiddenFields).toBe(true);
    expect(item).not.toHaveProperty("internalOpinion");
    expect(item).not.toHaveProperty("contractAmount");
  });

  it("persists evaluations through an internal-only repository path", async () => {
    const evaluation = VendorProfile.restore(created().snapshot).evaluate({ vendorEvaluationId: uuid("70000000-0000-4000-8000-000000000006"), evaluationCode: stableCode("VENDOR.EVAL.PERIODIC"), riskLevel: "MEDIUM", internalOpinion: "추가 확인" }, command(1));
    const appendEvaluation = vi.fn(async () => true);
    const appendAudit = vi.fn(async () => undefined);
    const enqueue = vi.fn(async () => undefined);
    const context = { vendors: { appendEvaluation }, evidence: { appendAudit, enqueue } } as unknown as VendorTransactionContext;
    await persistVendorEvaluation({ transact: async (work) => work(context) }, evaluation);
    expect(appendEvaluation).toHaveBeenCalledWith(evaluation.snapshot, version(1));
    expect(appendAudit).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
