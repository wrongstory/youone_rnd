import { describe, expect, it, vi } from "vitest";
import { closeNcr, CorrectiveAction, NonConformance, persistCarMutation, persistNcrMutation, type NcrCarTransactionContext, type NcrSnapshot, type QualityActorSnapshot, type QualityCommand } from "../../packages/features/quality/src/public.js";
import { correlationId, idempotencyKey, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const ncrId = uuid("92000000-0000-4000-8000-000000000001");
const ownerId = uuid("92000000-0000-4000-8000-000000000002");
const evidenceId = uuid("92000000-0000-4000-8000-000000000003");
const carId = uuid("92000000-0000-4000-8000-000000000004");
const actor: QualityActorSnapshot = { actorKind: "INTERNAL", userId: ownerId, active: true, authorities: [stableCode("ncr.record.issue"), stableCode("ncr.record.close")] };

function created() { return NonConformance.create({ ncrId, ncrNo: "NCR-A1", sourceLinks: [{ kind: "REQUIREMENT_REVISION", requirementId: uuid("92000000-0000-4000-8000-000000000005"), requirementRevisionId: uuid("92000000-0000-4000-8000-000000000006") }], severity: "MINOR", scopeSummary: "scope", observedResult: "observed", requirementSummary: "required", createdByUserId: ownerId }, { actor, at: utcInstant("2026-08-22T00:00:00Z"), eventId: uuid("92000000-0000-4000-8000-000000000007"), correlationId: correlationId("m09-create"), idempotencyKey: idempotencyKey("m09-create") }); }
function evidence() { return { appendTransition: vi.fn(async () => undefined), appendAudit: vi.fn(async () => undefined), enqueue: vi.fn(async () => undefined) }; }
function carCommand(commandActor: QualityActorSnapshot, expected: number, sequence: number): QualityCommand { return { actor: commandActor, expectedVersion: version(expected), at: utcInstant(`2026-08-22T00:${String(sequence).padStart(2, "0")}:00Z`), eventId: uuid(`93000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`), correlationId: correlationId(`m09-car-${sequence}`), idempotencyKey: idempotencyKey(`m09-car-${sequence}`) }; }

describe("NCR/CAR application UoW", () => {
  it("validates exact typed sources and inserts creation with transition/audit/outbox in one transaction", async () => {
    const assertExactLinks = vi.fn(async () => undefined); const insert = vi.fn(async () => undefined); const events = evidence();
    const context = { ncrs: { insert }, cars: {}, sourceLinks: { assertExactLinks }, evidence: events } as unknown as NcrCarTransactionContext;
    await persistNcrMutation({ transact: async (work) => work(context) }, created());
    expect(assertExactLinks).toHaveBeenCalledWith(created().snapshot.sourceLinks);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ state: "DRAFT", version: 1 }));
    expect(events.appendTransition).toHaveBeenCalledWith(expect.objectContaining({ fromVersion: 0, toVersion: 1 }));
    expect(events.appendAudit).toHaveBeenCalledOnce(); expect(events.enqueue).toHaveBeenCalledOnce();
  });

  it("appends responsibility assessment instead of overwriting history", async () => {
    const aggregate = NonConformance.restore(created().snapshot);
    const mutation = aggregate.assessResponsibility({ actor: { ...actor, authorities: [stableCode("ncr.record.issue")] }, expectedVersion: version(1), at: utcInstant("2026-08-22T00:01:00Z"), eventId: uuid("92000000-0000-4000-8000-000000000008"), correlationId: correlationId("m09-resp"), idempotencyKey: idempotencyKey("m09-resp") }, { responsibilityAssessmentId: uuid("92000000-0000-4000-8000-000000000009"), status: "PRELIMINARY", partyKind: "UNDETERMINED", rationale: "initial", evidenceIds: [evidenceId] });
    const append = vi.fn(async () => undefined); const events = evidence();
    const context = { ncrs: { save: async () => true, insertImmutableResponsibilityAssessment: append }, cars: {}, sourceLinks: {}, evidence: events } as unknown as NcrCarTransactionContext;
    await persistNcrMutation({ transact: async (work) => work(context) }, mutation);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ sequenceNo: 1, status: "PRELIMINARY" }));
  });

  it("loads and locks all required CAR facts inside close UoW and refuses an ineffective CAR", async () => {
    const verification: NcrSnapshot = { ...created().snapshot, state: "VERIFICATION", requiredCarCount: 1, version: version(7), updatedAt: utcInstant("2026-08-22T00:07:00Z") };
    const listFactsForNcrForUpdate = vi.fn(async () => [{ carId, ncrId, required: true, state: "INEFFECTIVE" as const, version: version(5) }]);
    const save = vi.fn(); const events = evidence();
    const context = { ncrs: { loadForUpdate: async () => verification, save }, cars: { listFactsForNcrForUpdate }, sourceLinks: {}, evidence: events } as unknown as NcrCarTransactionContext;
    await expect(closeNcr({ transact: async (work) => work(context) }, { ncrId, command: { actor, expectedVersion: version(7), at: utcInstant("2026-08-22T00:08:00Z"), eventId: uuid("92000000-0000-4000-8000-000000000010"), correlationId: correlationId("m09-close"), idempotencyKey: idempotencyKey("m09-close") }, reason: "close", evidenceIds: [evidenceId] })).rejects.toThrow(/required CAR/i);
    expect(listFactsForNcrForUpdate).toHaveBeenCalledWith(ncrId); expect(save).not.toHaveBeenCalled(); expect(events.enqueue).not.toHaveBeenCalled();
  });

  it("atomically closes only after every required CAR is effective or closed", async () => {
    const verification: NcrSnapshot = { ...created().snapshot, state: "VERIFICATION", requiredCarCount: 1, version: version(7), updatedAt: utcInstant("2026-08-22T00:07:00Z") };
    const save = vi.fn(async () => true); const events = evidence();
    const context = { ncrs: { loadForUpdate: async () => verification, save }, cars: { listFactsForNcrForUpdate: async () => [{ carId, ncrId, required: true, state: "EFFECTIVE" as const, version: version(5) }] }, sourceLinks: {}, evidence: events } as unknown as NcrCarTransactionContext;
    const result = await closeNcr({ transact: async (work) => work(context) }, { ncrId, command: { actor, expectedVersion: version(7), at: utcInstant("2026-08-22T00:08:00Z"), eventId: uuid("92000000-0000-4000-8000-000000000011"), correlationId: correlationId("m09-close-ok"), idempotencyKey: idempotencyKey("m09-close-ok") }, reason: "verified", evidenceIds: [evidenceId] });
    expect(result.state).toBe("CLOSED"); expect(save).toHaveBeenCalledWith(expect.objectContaining({ state: "CLOSED", version: 8 }), 7); expect(events.enqueue).toHaveBeenCalledOnce();
  });

  it("persists each effectiveness result as immutable history with the CAR transition", async () => {
    const reviewer: QualityActorSnapshot = { actorKind: "INTERNAL", userId: uuid("92000000-0000-4000-8000-000000000012"), active: true, authorities: [stableCode("ncr.plan.review"), stableCode("ncr.effectiveness.verify")] };
    const createdCar = CorrectiveAction.create({ carId, carNo: "CAR-A1", ncrId, required: true, rootCause: "cause", actionPlan: "action", actionOwnerUserId: ownerId, dueAt: utcInstant("2026-09-01T00:00:00Z") }, (() => { const { expectedVersion: _expected, ...creation } = carCommand({ ...actor, authorities: [stableCode("ncr.action.perform")] }, 0, 12); void _expected; return creation; })());
    const aggregate = CorrectiveAction.restore(createdCar.snapshot);
    aggregate.accept(carCommand(reviewer, 1, 13), [evidenceId]); aggregate.start(carCommand({ ...actor, authorities: [stableCode("ncr.action.perform")] }, 2, 14)); aggregate.submitVerification(carCommand({ ...actor, authorities: [stableCode("ncr.action.perform")] }, 3, 15), [evidenceId]);
    const verification = aggregate.verify(carCommand(reviewer, 4, 16), { carVerificationId: uuid("92000000-0000-4000-8000-000000000013"), effective: false, summary: "not effective", evidenceIds: [evidenceId] });
    const insertImmutableVerification = vi.fn(async () => undefined); const events = evidence();
    const context = { ncrs: {}, cars: { save: async () => true, insertImmutableVerification }, sourceLinks: {}, evidence: events } as unknown as NcrCarTransactionContext;
    await persistCarMutation({ transact: async (work) => work(context) }, verification);
    expect(insertImmutableVerification).toHaveBeenCalledWith(expect.objectContaining({ result: "INEFFECTIVE", effectivenessCycle: 1 }));
    expect(events.enqueue).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ ecrReviewRequired: true, contractStateChanged: false }) }));
  });

  it("appends an immutable reopen record with the prior close occurrence in the same UoW", async () => {
    const closedAt = utcInstant("2026-08-22T00:20:00Z");
    const closed: NcrSnapshot = { ...created().snapshot, state: "CLOSED", version: version(8), lastClosedAt: closedAt, updatedAt: closedAt };
    const aggregate = NonConformance.restore(closed);
    const mutation = aggregate.reopen({ actor: { ...actor, authorities: [stableCode("ncr.record.close")] }, expectedVersion: version(8), at: utcInstant("2026-08-22T00:21:00Z"), eventId: uuid("92000000-0000-4000-8000-000000000014"), correlationId: correlationId("m09-reopen"), idempotencyKey: idempotencyKey("m09-reopen") }, { reason: "recurred", evidenceIds: [evidenceId] });
    const appendImmutableReopenEvent = vi.fn(async () => undefined); const events = evidence();
    const context = { ncrs: { save: async () => true, appendImmutableReopenEvent }, cars: {}, sourceLinks: {}, evidence: events } as unknown as NcrCarTransactionContext;
    await persistNcrMutation({ transact: async (work) => work(context) }, mutation);
    expect(appendImmutableReopenEvent).toHaveBeenCalledWith(expect.objectContaining({ ncrReopenId: mutation.event.eventId, priorClosedAt: closedAt, reopenCount: 1, reason: "recurred" }));
    expect(events.enqueue).toHaveBeenCalledOnce();
  });
});
