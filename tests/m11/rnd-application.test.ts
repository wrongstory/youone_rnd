import { describe, expect, it, vi } from "vitest";
import { FailClosedRndLifecycleCommandPort, persistRndMutation, projectRndProgramSummary, scheduleDeadlineAlerts, type RndTransactionContext } from "../../packages/features/rnd/src/application/rnd-contracts.js";
import { RndProgram, type RndActorSnapshot, type RndCommand } from "../../packages/features/rnd/src/domain/rnd.js";
import { correlationId, idempotencyKey, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const u = (n: number) => uuid(`94000000-0000-4000-8000-${String(n).padStart(12, "0")}`); const programId = u(1); const userId = u(2); let seq = 0;
const actor = (...permissions: string[]): RndActorSnapshot => ({ actorKind: "INTERNAL", userId, active: true, authorities: permissions.map(stableCode) });
function command(commandActor: RndActorSnapshot, expectedVersion: number): RndCommand { seq += 1; return { actor: commandActor, expectedVersion: version(expectedVersion), at: utcInstant(`2026-08-22T04:${String(seq).padStart(2, "0")}:00Z`), eventId: u(100 + seq), correlationId: correlationId(`rnd-app-${seq}`), idempotencyKey: idempotencyKey(`rnd-app-${seq}`) }; }
function createCommand(commandActor: RndActorSnapshot) { const { expectedVersion: _, ...rest } = command(commandActor, 0); void _; return rest; }
function context(alertResult: "INSERTED" | "ALREADY_EXISTS" = "INSERTED"): RndTransactionContext { return { rndPrograms: { loadForUpdate: vi.fn(), insert: vi.fn(), save: vi.fn(async () => true), appendImmutableProjectLink: vi.fn(), appendImmutableBudgetVersion: vi.fn(), appendImmutableExpenditure: vi.fn(), appendImmutableEvidence: vi.fn(), appendImmutableDeadline: vi.fn() }, links: { assertProject: vi.fn(), assertBudgetLine: vi.fn(), assertExpenditureLinks: vi.fn(), assertEvidenceSubject: vi.fn(), assertPrivateAttachment: vi.fn() }, alerts: { insertIfAbsent: vi.fn(async () => alertResult) }, evidence: { appendRecordVersion: vi.fn(), appendAudit: vi.fn(), enqueue: vi.fn() } }; }
const unit = (value: RndTransactionContext) => ({ transact: async <T>(work: (context: RndTransactionContext) => Promise<T>) => work(value) });

describe("R&D application records", () => {
  it("inserts registration with record-version, audit and outbox in one UoW", async () => {
    const mutation = RndProgram.register({ rndProgramId: programId, programCode: "RND-A", title: "과제", agreementId: "AG-A", managingAgency: "기관", agreementFrom: "2026-01-01", agreementTo: "2026-12-31", currency: "KRW", registeredByUserId: userId }, createCommand(actor("rnd.program.register")));
    const ctx = context(); await persistRndMutation(unit(ctx), mutation);
    expect(ctx.rndPrograms.insert).toHaveBeenCalledWith(expect.objectContaining({ version: 1 })); expect(ctx.evidence.appendRecordVersion).toHaveBeenCalledWith(expect.objectContaining({ fromVersion: 0, toVersion: 1 })); expect(ctx.evidence.appendAudit).toHaveBeenCalledOnce(); expect(ctx.evidence.enqueue).toHaveBeenCalledOnce();
  });

  it("deduplicates deadline alerts and rejects duplicate keys inside one batch", async () => {
    const alert = { deadlineAlertId: u(10), rndProgramId: programId, reportDeadlineId: u(11), alertPolicyVersionId: u(12), alertAt: utcInstant("2026-08-22T05:00:00Z"), idempotencyKey: idempotencyKey("rnd-alert-1"), channel: "IN_APP" as const, recipientUserId: userId };
    await expect(scheduleDeadlineAlerts(unit(context("ALREADY_EXISTS")), [alert])).resolves.toEqual({ inserted: 0, alreadyExists: 1 });
    await expect(scheduleDeadlineAlerts(unit(context()), [alert, alert])).rejects.toMatchObject({ code: "RND_ALERT_IDEMPOTENCY_DUPLICATE" });
  });

  it("fails lifecycle closed and strips malicious summary fields", async () => {
    await expect(new FailClosedRndLifecycleCommandPort().execute({ rndProgramId: String(programId), requestedCommand: "CLOSE" })).resolves.toMatchObject({ availability: "BLOCKED", reason: "OD-030-RND-STATE-MACHINE" });
    const summary = projectRndProgramSummary({ rndProgramId: String(programId), programCode: "RND-A", title: "과제", agreementFrom: "2026-01-01", agreementTo: "2026-12-31", managingAgency: "기관", projectIds: [String(u(20))], budget: { currentBudgetVersionId: String(u(21)), currentBudgetVersionNo: 1, totalBudget: { amount: "100", currency: "KRW" }, totalExpenditure: { amount: "20", currency: "KRW" }, balance: { amount: "80", currency: "KRW" }, executionRate: "20", categoryTotals: [] }, evidence: { expenditureCount: 1, expenditureWithEvidenceCount: 0, evidenceCount: 0, missingEvidenceCount: 1, overdueEvidenceCount: 0 }, deadlines: { total: 1, dueSoon: 1, overdue: 0, evidenceIncomplete: 1 }, rcmsToken: "secret", bankAccount: "secret", vendorNotes: "secret" });
    expect(summary).not.toHaveProperty("rcmsToken"); expect(summary).not.toHaveProperty("bankAccount"); expect(summary).not.toHaveProperty("vendorNotes");
  });
});
