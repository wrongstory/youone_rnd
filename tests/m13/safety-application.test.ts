import { describe, expect, it, vi } from "vitest";
import { emitIncidentInvestigationSlaAlerts, persistSafetyIncidentMutation, persistSafetyInspectionMutation, persistSafetyManagerAssignment, persistTrainingAttendance, projectVendorSafetyScope, type SafetyTransactionContext } from "../../packages/features/safety/src/application/contracts.js";
import { SafetyIncident, SafetyInspection, createSafetyRetention, designateSafetyManager, recordTrainingAttendance, type SafetyActor, type SafetyIncidentSnapshot, type SafetyCommand } from "../../packages/features/safety/src/domain/safety.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const u = (n: number) => uuid(`a4000000-0000-4000-8000-${String(n).padStart(12, "0")}`); const managerId = u(1); const assignmentId = u(2); let seq = 0;
const actor: SafetyActor = { actorKind: "INTERNAL", userId: managerId, active: true, positionIds: [], permissionIds: [stableCode("safety.inspection.manage"), stableCode("safety.training.manage")], safetyAssignmentId: assignmentId };
function command(expectedVersion: number): SafetyCommand { seq += 1; return { actor, expectedVersion: version(expectedVersion), at: utcInstant(`2026-08-22T0${seq}:00:00Z`), commandId: u(100 + seq), correlationId: correlationId(`safety-app-${seq}`), idempotencyKey: idempotencyKey(`safety-app-${seq}`) }; }
function createCommand() { const { expectedVersion: _, ...rest } = command(0); void _; return rest; }
const retention = createSafetyRetention({ policyVersionId: u(3), policyChecksum: sha256("1".repeat(64)), referenceAt: utcInstant("2026-08-22T00:00:00Z") });
function context(overrides: Partial<SafetyTransactionContext> = {}): SafetyTransactionContext {
  return {
    assignments: { assertNoConflictingActiveAssignment: vi.fn(), insert: vi.fn() },
    inspections: { insert: vi.fn(), save: vi.fn(async () => true), appendItems: vi.fn(), appendFindings: vi.fn(), appendStopWorkOrder: vi.fn(), appendCorrectionAssignment: vi.fn(), appendCorrectionSubmission: vi.fn(), appendCorrectionVerification: vi.fn() },
    incidents: { insert: vi.fn(), save: vi.fn(async () => true), appendEmergencyResponse: vi.fn(), appendSiteSecuring: vi.fn(), appendInvestigation: vi.fn(), appendRecurrenceAction: vi.fn(), appendVerification: vi.fn(), listInvestigationSlaBreachesForUpdate: vi.fn(async () => []) },
    training: { insertSession: vi.fn(), insertAttendance: vi.fn() }, authority: { assertLabDirector: vi.fn(), assertActiveSafetyAuthority: vi.fn(), assertIncidentReportAuthority: vi.fn() },
    references: { assertScope: vi.fn(), assertPrivateEvidenceIds: vi.fn(), assertRetention: vi.fn(), assertTrainingSession: vi.fn() }, alerts: { insertIfAbsent: vi.fn(async () => "INSERTED") },
    evidence: { appendTransition: vi.fn(), appendAudit: vi.fn(), enqueue: vi.fn(), appendRecordAudit: vi.fn(), enqueueRecord: vi.fn() }, ...overrides
  };
}
const unit = (value: SafetyTransactionContext) => ({ transact: async <T>(work: (context: SafetyTransactionContext) => Promise<T>) => work(value) });
function planned() { return SafetyInspection.plan({ safetyInspectionId: u(10), inspectionNo: "SAFE-A", inspectionType: "MONTHLY_REGULAR", scope: { kind: "LAB" }, scheduledFor: "2026-08-22", frequencyPolicyVersionId: u(11), frequencyPolicyChecksum: sha256("2".repeat(64)), assignedSafetyManagerAssignmentId: assignmentId, retention }, createCommand()); }

describe("M13 Safety application UoW", () => {
  it("checks overlapping effective assignments before the Lab Director designation is inserted", async () => {
    const director: SafetyActor = { actorKind: "INTERNAL", userId: u(40), active: true, positionIds: [stableCode("POSITION_LAB_DIRECTOR")], permissionIds: [stableCode("safety.assignment.manage")] };
    const assignment = designateSafetyManager({ safetyManagerAssignmentId: u(41), assigneeUserId: u(42), assignmentKind: "TEAM_COORDINATOR", assignmentScope: { kind: "TEAM", teamId: u(43) }, validFrom: utcInstant("2026-08-22T00:00:00Z"), evidenceIds: [u(44)], retention }, director);
    const ctx = context();
    await persistSafetyManagerAssignment(unit(ctx), assignment, director, utcInstant("2026-08-22T00:00:00Z"), idempotencyKey("safety-assignment-41"));
    expect(ctx.assignments.assertNoConflictingActiveAssignment).toHaveBeenCalledWith(assignment);
    expect(ctx.assignments.insert).toHaveBeenCalledWith(assignment);
  });

  it("commits inspection, transition, audit and outbox after active assignment validation", async () => {
    const mutation = planned(); const ctx = context(); await persistSafetyInspectionMutation(unit(ctx), mutation);
    expect(ctx.authority.assertActiveSafetyAuthority).toHaveBeenCalledWith(expect.objectContaining({ assignmentId, actorUserId: managerId, eventId: "EVT-SAFETY-INSPECTION-PLAN" }));
    expect(ctx.inspections.insert).toHaveBeenCalledWith(expect.objectContaining({ state: "PLANNED", version: 1 }));
    expect(ctx.evidence.appendTransition).toHaveBeenCalledWith(expect.objectContaining({ fromVersion: 0, toVersion: 1 })); expect(ctx.evidence.appendAudit).toHaveBeenCalledOnce(); expect(ctx.evidence.enqueue).toHaveBeenCalledOnce();
  });

  it("fails optimistic save before emitting transition evidence", async () => {
    const inspection = SafetyInspection.restore(planned().snapshot); const mutation = inspection.start(command(1)); const ctx = context({ inspections: { ...context().inspections, save: vi.fn(async () => false) } });
    await expect(persistSafetyInspectionMutation(unit(ctx), mutation)).rejects.toMatchObject({ code: "SAFETY_INSPECTION_STALE_VERSION" });
    expect(ctx.evidence.appendTransition).not.toHaveBeenCalled(); expect(ctx.evidence.enqueue).not.toHaveBeenCalled();
  });

  it("delegates a new incident report to the trusted internal-or-exact-Vendor scope authority", async () => {
    const vendorReporter: SafetyActor = { actorKind: "VENDOR", userId: u(15), active: true, positionIds: [], permissionIds: [stableCode("safety.incident.report")] };
    const report = SafetyIncident.report({ safetyIncidentId: u(16), incidentNo: "INC-VENDOR", severity: "MINOR", scope: { kind: "PROJECT", projectId: u(17) }, summary: "외주 현장 신고", occurredAt: utcInstant("2026-08-22T00:00:00Z"), retention }, { ...createCommand(), actor: vendorReporter });
    const ctx = context(); await persistSafetyIncidentMutation(unit(ctx), report);
    expect(ctx.authority.assertIncidentReportAuthority).toHaveBeenCalledWith({ actor: vendorReporter, scope: { kind: "PROJECT", projectId: u(17) }, at: report.transition.occurredAt });
    expect(ctx.incidents.insert).toHaveBeenCalledWith(expect.objectContaining({ state: "REPORTED", reportedByUserId: vendorReporter.userId }));
  });

  it("persists remedial attendance as a fact with audit/outbox and no auto completion", async () => {
    const attendance = recordTrainingAttendance({ safetyTrainingAttendanceId: u(20), safetyTrainingSessionId: u(21), attendeeUserId: u(22), status: "INCOMPLETE", completionEvidenceIds: [], remedialRequired: true, remedialDueAt: utcInstant("2026-09-01T00:00:00Z"), retention }, actor, utcInstant("2026-08-22T03:00:00Z"));
    const ctx = context(); await persistTrainingAttendance(unit(ctx), attendance, actor, idempotencyKey("training-attendance-1"));
    expect(ctx.references.assertTrainingSession).toHaveBeenCalledWith(u(21)); expect(ctx.training.insertAttendance).toHaveBeenCalledWith(expect.objectContaining({ remedialRequired: true }));
    expect(ctx.evidence.enqueueRecord).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ autoCompleted: false, remedialRequired: true }) }));
  });

  it("emits idempotent 48-hour SLA alerts without changing or auto-completing incident state", async () => {
    const incident: SafetyIncidentSnapshot = { safetyIncidentId: u(30), incidentNo: "INC-A", severity: "MAJOR", scope: { kind: "LAB" }, summary: "사고", occurredAt: utcInstant("2026-08-20T00:00:00Z"), reportedAt: utcInstant("2026-08-20T00:00:00Z"), reportedByUserId: u(31), investigationDueAt: utcInstant("2026-08-22T00:00:00Z"), state: "SITE_SECURED", siteSecuringId: u(32), retention, version: version(3), updatedAt: utcInstant("2026-08-20T01:00:00Z") };
    const insertIfAbsent = vi.fn().mockResolvedValueOnce("INSERTED").mockResolvedValueOnce("ALREADY_EXISTS");
    const incidentRepo = { ...context().incidents, listInvestigationSlaBreachesForUpdate: vi.fn(async () => [incident]) };
    const ctx = context({ incidents: incidentRepo, alerts: { insertIfAbsent } }); const input = { detectedAt: utcInstant("2026-08-22T01:00:00Z"), recipientUserId: managerId, makeAlertId: () => u(33), makeIdempotencyKey: () => idempotencyKey("incident-30-48h") };
    await expect(emitIncidentInvestigationSlaAlerts(unit(ctx), input)).resolves.toEqual({ inserted: 1, alreadyExists: 0 });
    await expect(emitIncidentInvestigationSlaAlerts(unit(ctx), input)).resolves.toEqual({ inserted: 0, alreadyExists: 1 });
    expect(ctx.incidents.save).not.toHaveBeenCalled(); expect(incident.state).toBe("SITE_SECURED");
    expect(ctx.evidence.enqueueRecord).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ autoCompleted: false, stateObserved: "SITE_SECURED" }) }));
  });

  it("uses a runtime vendor allowlist and strips internal incident/finding fields", () => {
    const projected = projectVendorSafetyScope({ safetyRecordId: "task-1", recordKind: "CORRECTIVE_TASK", title: "방호덮개 보완", state: "OPEN", projectId: "project-1", contractId: "contract-1", dueAt: "2026-08-25T00:00:00Z", nextAction: stableCode("safety.vendor.correction.submit"), injuredPersonIdentity: "secret", medicalDetails: "secret", causeDeliberation: "secret", privateEvidence: ["secret"], signedUrl: "secret" });
    expect(projected).toEqual({ safetyRecordId: "task-1", recordKind: "CORRECTIVE_TASK", title: "방호덮개 보완", state: "OPEN", projectId: "project-1", contractId: "contract-1", dueAt: "2026-08-25T00:00:00Z", nextAction: "safety.vendor.correction.submit" });
  });
});
