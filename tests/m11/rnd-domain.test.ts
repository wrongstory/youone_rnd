import { describe, expect, it } from "vitest";
import { RND_LIFECYCLE_BLOCKED, RndProgram, type RndActorSnapshot, type RndCommand } from "../../packages/features/rnd/src/domain/rnd.js";
import { correlationId, idempotencyKey, money, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const u = (n: number) => uuid(`93000000-0000-4000-8000-${String(n).padStart(12, "0")}`); const userId = u(1); const programId = u(2); const projectId = u(3); const budgetId = u(4); const lineId = u(5);
let seq = 0;
const actor = (kind: RndActorSnapshot["actorKind"], ...permissions: string[]): RndActorSnapshot => ({ actorKind: kind, userId, active: true, authorities: permissions.map(stableCode) });
function command(commandActor: RndActorSnapshot, expectedVersion: number): RndCommand { seq += 1; return { actor: commandActor, expectedVersion: version(expectedVersion), at: utcInstant(`2026-08-22T03:${String(seq).padStart(2, "0")}:00Z`), eventId: u(100 + seq), correlationId: correlationId(`rnd-domain-${seq}`), idempotencyKey: idempotencyKey(`rnd-domain-${seq}`) }; }
function createCommand(commandActor: RndActorSnapshot) { const { expectedVersion: _, ...rest } = command(commandActor, 0); void _; return rest; }
function registered() { return RndProgram.register({ rndProgramId: programId, programCode: "RND-2026-01", title: "고효율 장비 개발", agreementId: "AG-001", managingAgency: "전문기관", agreementFrom: "2026-01-01", agreementTo: "2026-12-31", currency: "KRW", registeredByUserId: userId }, createCommand(actor("INTERNAL", "rnd.program.register"))); }
function budgeted() { const aggregate = RndProgram.restore(registered().snapshot); aggregate.linkProject(command(actor("INTERNAL", "rnd.program.manage"), 1), { rndProjectLinkId: u(6), projectId }); aggregate.addBudgetVersion(command(actor("INTERNAL", "rnd.budget.manage"), 2), { budgetVersionId: budgetId, totalBudget: money("1000000", "KRW"), lines: [{ budgetLineId: lineId, categoryCode: stableCode("MATERIAL"), categoryLabel: "재료비", allocatedAmount: money("1000000", "KRW") }], reason: "협약 예산", checksum: sha256("1".repeat(64)) }); return aggregate; }

describe("R&D records with OD-030 fail-closed", () => {
  it("registers without inventing lifecycle state and publishes a blocked lifecycle contract", () => {
    const snapshot = registered().snapshot as unknown as Record<string, unknown>;
    expect(snapshot).not.toHaveProperty("state"); expect(RND_LIFECYCLE_BLOCKED).toMatchObject({ availability: "BLOCKED", reason: "OD-030-RND-STATE-MACHINE" });
  });

  it("keeps Project N:M unique and denies Vendor/Headquarters mutation", () => {
    const aggregate = RndProgram.restore(registered().snapshot); aggregate.linkProject(command(actor("INTERNAL", "rnd.program.manage"), 1), { rndProjectLinkId: u(6), projectId });
    expect(() => aggregate.linkProject(command(actor("INTERNAL", "rnd.program.manage"), 2), { rndProjectLinkId: u(7), projectId })).toThrowError(expect.objectContaining({ code: "RND_PROJECT_LINK_DUPLICATE" }));
    expect(() => RndProgram.restore(registered().snapshot).linkProject(command(actor("VENDOR", "rnd.program.manage"), 1), { rndProjectLinkId: u(8), projectId: u(9) })).toThrowError(expect.objectContaining({ code: "RND_INTERNAL_AUTHORITY_REQUIRED" }));
    expect(() => RndProgram.restore(registered().snapshot).linkProject(command(actor("HEADQUARTERS", "rnd.program.manage"), 1), { rndProjectLinkId: u(8), projectId: u(9) })).toThrowError(expect.objectContaining({ code: "RND_INTERNAL_AUTHORITY_REQUIRED" }));
  });

  it("seals normalized BudgetVersion lines with exact decimal/currency and direct lineage", () => {
    const aggregate = budgeted();
    expect(aggregate.snapshot()).toMatchObject({ currentBudgetVersionId: budgetId, currentBudgetVersionNo: 1, totalBudgetAmount: "1000000" });
    expect(() => aggregate.addBudgetVersion(command(actor("INTERNAL", "rnd.budget.manage"), 3), { budgetVersionId: u(10), totalBudget: money("1000.0000001", "KRW"), lines: [{ budgetLineId: u(11), categoryCode: stableCode("MATERIAL"), categoryLabel: "재료비", allocatedAmount: money("1000", "KRW") }], reason: "수정", checksum: sha256("2".repeat(64)) })).toThrow();
    const next = aggregate.addBudgetVersion(command(actor("INTERNAL", "rnd.budget.manage"), 3), { budgetVersionId: u(10), totalBudget: money("1200000", "KRW"), lines: [{ budgetLineId: u(11), categoryCode: stableCode("MATERIAL"), categoryLabel: "재료비", allocatedAmount: money("1200000", "KRW") }], reason: "증액 협약", checksum: sha256("2".repeat(64)) });
    expect(next.immutableBudgetVersion).toMatchObject({ versionNo: 2, previousBudgetVersionId: budgetId });
  });

  it("records only expenditure facts with typed links and no RCMS/accounting/transfer side effect", () => {
    const aggregate = budgeted();
    expect(() => aggregate.recordExpenditure(command(actor("INTERNAL", "rnd.expenditure.record"), 3), { expenditureId: u(20), budgetVersionId: budgetId, budgetLineId: lineId, counterpartyName: "공급사", spentOn: "2026-08-22", amount: money("100000", "KRW"), purpose: "재료", typedLinks: [{ kind: "PROJECT", projectId: u(99) }] })).toThrowError(expect.objectContaining({ code: "RND_EXPENDITURE_PROJECT_SCOPE_INVALID" }));
    const result = aggregate.recordExpenditure(command(actor("INTERNAL", "rnd.expenditure.record"), 3), { expenditureId: u(20), budgetVersionId: budgetId, budgetLineId: lineId, supplierId: u(21), counterpartyName: "공급사", spentOn: "2026-08-22", amount: money("100000", "KRW"), purpose: "재료", typedLinks: [{ kind: "PROJECT", projectId }, { kind: "PURCHASE_RESOLUTION", purchaseRequestId: u(22), purchaseResolutionId: u(23) }], evidenceDueAt: utcInstant("2026-08-31T00:00:00Z") });
    expect(result.immutableExpenditure).toMatchObject({ paymentInstructionCreated: false, accountingJournalCreated: false, rcmsWorkflowCloned: false });
    expect(result.snapshot).toMatchObject({ totalExpenditureAmount: "100000", expenditureCount: 1 });
  });
});
