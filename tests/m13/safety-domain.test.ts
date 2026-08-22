import { describe, expect, it } from "vitest";
import { SAFETY_INCIDENT_TRANSITIONS, SAFETY_INSPECTION_TRANSITIONS, SAFETY_P1_EXCLUDED, SafetyIncident, SafetyInspection, createSafetyRetention, createTrainingSession, designateSafetyManager, recordTrainingAttendance, type SafetyActor, type SafetyCommand } from "../../packages/features/safety/src/public.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const u = (n: number) => uuid(`a3000000-0000-4000-8000-${String(n).padStart(12, "0")}`); const directorId = u(1); const managerId = u(2); const ownerId = u(3); const verifierId = u(4); let seq = 0;
const actor = (userId: typeof directorId, positions: string[], ...permissions: string[]): SafetyActor => ({ actorKind: "INTERNAL", userId, active: true, positionIds: positions.map(stableCode), permissionIds: permissions.map(stableCode), safetyAssignmentId: u(90) });
const vendor: SafetyActor = { actorKind: "VENDOR", userId: u(5), active: true, positionIds: [], permissionIds: [stableCode("safety.inspection.manage")] };
function command(commandActor: SafetyActor, expectedVersion: number, at?: string): SafetyCommand { seq += 1; return { actor: commandActor, expectedVersion: version(expectedVersion), at: utcInstant(at ?? `2026-08-22T0${Math.min(9, seq)}:00:00Z`), commandId: u(100 + seq), correlationId: correlationId(`safety-${seq}`), idempotencyKey: idempotencyKey(`safety-${seq}`) }; }
function createCommand(commandActor: SafetyActor, at?: string) { const { expectedVersion: _, ...rest } = command(commandActor, 0, at); void _; return rest; }
const retention = createSafetyRetention({ policyVersionId: u(10), policyChecksum: sha256("1".repeat(64)), referenceAt: utcInstant("2026-08-22T00:00:00Z") });
const manager = (...permissions: string[]) => actor(managerId, [], ...permissions);
function plannedInspection() { return SafetyInspection.plan({ safetyInspectionId: u(20), inspectionNo: "SAFE-2026-08-W3", inspectionType: "WEEKLY_TEAM_SELF", scope: { kind: "TEAM", teamId: u(21) }, scheduledFor: "2026-08-22", frequencyPolicyVersionId: u(22), frequencyPolicyChecksum: sha256("2".repeat(64)), assignedSafetyManagerAssignmentId: u(90), retention }, createCommand(manager("safety.inspection.manage"), "2026-08-22T00:00:00Z")); }

describe("M13 Safety Light domain", () => {
  it("requires effective-dated Lab Director designation and keeps at least five-year/longer hold retention", () => {
    expect(retention).toMatchObject({ minimumYears: 5, retainUntil: "2031-08-22T00:00:00.000Z" });
    const held = createSafetyRetention({ policyVersionId: u(10), policyChecksum: sha256("1".repeat(64)), referenceAt: utcInstant("2026-08-22T00:00:00Z"), applicableRegulatoryYears: 7, legalHoldUntil: utcInstant("2035-01-01T00:00:00Z") });
    expect(held.retainUntil).toBe("2035-01-01T00:00:00.000Z");
    expect(() => designateSafetyManager({ safetyManagerAssignmentId: u(90), assigneeUserId: managerId, assignmentKind: "SAFETY_MANAGER", validFrom: utcInstant("2026-08-22T00:00:00Z"), evidenceIds: [u(11)], retention }, actor(directorId, [], "safety.assignment.manage"))).toThrowError(expect.objectContaining({ code: "SAFETY_MANAGER_DESIGNATION_INVALID" }));
    expect(designateSafetyManager({ safetyManagerAssignmentId: u(90), assigneeUserId: managerId, assignmentKind: "SAFETY_MANAGER", validFrom: utcInstant("2026-08-22T00:00:00Z"), validUntil: utcInstant("2027-08-22T00:00:00Z"), evidenceIds: [u(11)], retention }, actor(directorId, ["POSITION_LAB_DIRECTOR"], "safety.assignment.manage"))).toMatchObject({ designatedByLabDirectorUserId: directorId, version: 1 });
  });

  it("enforces constrained inspection/stop-work/correction/independent verification states", () => {
    expect(SAFETY_INSPECTION_TRANSITIONS["EVT-SAFETY-STOP-WORK"]).toEqual({ from: ["IN_PROGRESS", "FINDINGS_OPEN"], to: "STOP_WORK" });
    expect(() => SafetyInspection.restore(plannedInspection().snapshot).start(command(vendor, 1))).toThrowError(expect.objectContaining({ code: "SAFETY_INTERNAL_PERMISSION_REQUIRED" }));
    const inspection = SafetyInspection.restore(plannedInspection().snapshot); inspection.start(command(manager("safety.inspection.manage"), 1, "2026-08-22T01:00:00Z"));
    const item = { safetyInspectionItemId: u(23), checklistItemCode: stableCode("GUARD_INSTALLED"), result: "NONCONFORMING" as const, evidenceIds: [u(24)] };
    const findings = inspection.issueFindings(command(manager("safety.inspection.perform"), 2, "2026-08-22T02:00:00Z"), [item], [{ safetyFindingId: u(25), inspectionItemId: item.safetyInspectionItemId, severity: "CRITICAL", description: "회전체 방호덮개 이탈", imminentRisk: true, evidenceIds: [u(26)] }]);
    inspection.stopWork(command(manager("safety.inspection.manage"), 3, "2026-08-22T03:00:00Z"), { stopWorkOrderId: u(27), findingIds: [u(25)], scope: { kind: "WORK_AREA", workAreaCode: stableCode("MACHINE_CELL_A") }, reason: "즉시 끼임 위험", evidenceIds: [u(28)] }, findings.appendedFindings!);
    inspection.assignCorrection(command(manager("safety.finding.correct"), 4, "2026-08-22T04:00:00Z"), { safetyCorrectionAssignmentId: u(29), findingIds: [u(25)], ownerUserId: ownerId, dueAt: utcInstant("2026-08-23T00:00:00Z"), instruction: "방호덮개 재설치 및 인터록 점검", evidenceIds: [u(30)] });
    inspection.submitVerification(command(actor(ownerId, [], "safety.finding.correct"), 5, "2026-08-22T05:00:00Z"), { safetyCorrectionSubmissionId: u(31), summary: "재설치 완료", evidenceIds: [u(32)] });
    expect(() => inspection.verify(command(actor(ownerId, [], "safety.inspection.manage"), 6, "2026-08-22T06:00:00Z"), { safetyCorrectionVerificationId: u(33), effective: true, comment: "확인", evidenceIds: [u(34)] })).toThrowError(expect.objectContaining({ code: "SAFETY_INDEPENDENT_VERIFICATION_REQUIRED" }));
    const failed = inspection.verify(command(actor(verifierId, [], "safety.inspection.manage"), 6, "2026-08-22T06:00:00Z"), { safetyCorrectionVerificationId: u(33), effective: false, comment: "인터록 재시험 필요", evidenceIds: [u(34)] });
    expect(failed.snapshot.state).toBe("CORRECTION_PENDING");
    inspection.submitVerification(command(actor(ownerId, [], "safety.finding.correct"), 7, "2026-08-22T07:00:00Z"), { safetyCorrectionSubmissionId: u(35), summary: "인터록 보완", evidenceIds: [u(36)] });
    expect(inspection.verify(command(actor(verifierId, [], "safety.inspection.manage"), 8, "2026-08-22T08:00:00Z"), { safetyCorrectionVerificationId: u(37), effective: true, comment: "유효성 확인", evidenceIds: [u(38)] }).snapshot.state).toBe("CLOSED");
  });

  it("closes a completed clear checklist and cancels only a planned inspection with evidence", () => {
    const clear = SafetyInspection.restore(plannedInspection().snapshot);
    clear.start(command(manager("safety.inspection.manage"), 1, "2026-08-22T01:00:00Z"));
    expect(clear.closeClear(command(manager("safety.inspection.perform"), 2, "2026-08-22T02:00:00Z"), [{ safetyInspectionItemId: u(70), checklistItemCode: stableCode("EMERGENCY_EXIT_CLEAR"), result: "CONFORMING", evidenceIds: [u(71)] }]).snapshot.state).toBe("CLOSED");
    const cancelled = SafetyInspection.restore(plannedInspection().snapshot).cancel(command(manager("safety.inspection.manage"), 1, "2026-08-22T01:00:00Z"), "중복 일정", [u(72)]);
    expect(cancelled.snapshot.state).toBe("CANCELLED");
  });

  it("records training attendance and requires supplementary training for absence/incompletion", () => {
    const trainingActor = manager("safety.training.manage");
    const session = createTrainingSession({ safetyTrainingSessionId: u(40), trainingType: "SEMIANNUAL_REGULAR", title: "하반기 정기 안전교육", scheduledAt: utcInstant("2026-08-25T01:00:00Z"), trainerUserId: managerId, policyVersionId: u(41), policyChecksum: sha256("3".repeat(64)), materialAttachmentIds: [u(42)], retention }, trainingActor, utcInstant("2026-08-22T00:00:00Z"));
    expect(session.trainingType).toBe("SEMIANNUAL_REGULAR");
    expect(() => recordTrainingAttendance({ safetyTrainingAttendanceId: u(43), safetyTrainingSessionId: session.safetyTrainingSessionId, attendeeUserId: ownerId, status: "ABSENT", completionEvidenceIds: [], remedialRequired: false, retention }, trainingActor, utcInstant("2026-08-25T02:00:00Z"))).toThrowError(expect.objectContaining({ code: "SAFETY_TRAINING_ATTENDANCE_INVALID" }));
    expect(recordTrainingAttendance({ safetyTrainingAttendanceId: u(43), safetyTrainingSessionId: session.safetyTrainingSessionId, attendeeUserId: ownerId, status: "ABSENT", completionEvidenceIds: [], remedialRequired: true, remedialDueAt: utcInstant("2026-09-01T00:00:00Z"), retention }, trainingActor, utcInstant("2026-08-25T02:00:00Z"))).toMatchObject({ remedialRequired: true });
    expect(SAFETY_P1_EXCLUDED).toEqual(["HAZARDOUS_MATERIAL", "MSDS", "WASTE_LOG", "EMERGENCY_DRILL"]);
  });

  it("preserves the 48-hour incident SLA and requires Director independent effectiveness close", () => {
    expect(SAFETY_INCIDENT_TRANSITIONS["EVT-SAFETY-CLOSE"]).toEqual({ from: ["VERIFICATION"], to: "CLOSED" });
    expect(() => SafetyIncident.report({ safetyIncidentId: u(61), incidentNo: "INC-VENDOR-DENIED", severity: "MINOR", scope: { kind: "PROJECT", projectId: u(62) }, summary: "권한 없는 외주 신고", occurredAt: utcInstant("2026-08-22T00:00:00Z"), retention }, createCommand(vendor, "2026-08-22T00:10:00Z"))).toThrowError(expect.objectContaining({ code: "SAFETY_INCIDENT_REPORT_SCOPE_REQUIRED" }));
    const vendorReporter: SafetyActor = { ...vendor, permissionIds: [stableCode("safety.incident.report")] };
    expect(SafetyIncident.report({ safetyIncidentId: u(63), incidentNo: "INC-VENDOR-ALLOWED", severity: "MINOR", scope: { kind: "PROJECT", projectId: u(62) }, summary: "허용목록 기반 외주 신고", occurredAt: utcInstant("2026-08-22T00:00:00Z"), retention }, createCommand(vendorReporter, "2026-08-22T00:10:00Z")).snapshot.reportedByUserId).toBe(vendorReporter.userId);
    const reported = SafetyIncident.report({ safetyIncidentId: u(50), incidentNo: "INC-2026-003", severity: "MAJOR", scope: { kind: "LAB" }, summary: "시험대 전원부 연기", occurredAt: utcInstant("2026-08-22T00:00:00Z"), retention }, createCommand(actor(ownerId, [], "safety.incident.report"), "2026-08-22T00:10:00Z"));
    expect(reported.snapshot.investigationDueAt).toBe("2026-08-24T00:10:00.000Z");
    const incident = SafetyIncident.restore(reported.snapshot); incident.respond(command(manager("safety.incident.investigate"), 1, "2026-08-22T00:20:00Z"), { emergencyResponseId: u(51), actionsTaken: "전원 차단·초기 소화", notificationEvidenceIds: [u(52)] }); incident.secureSite(command(manager("safety.incident.investigate"), 2, "2026-08-22T00:30:00Z"), { siteSecuringId: u(53), preservationSummary: "전원부와 주변 부품 보존", evidenceIds: [u(54)] });
    const investigation = incident.startInvestigation(command(manager("safety.incident.investigate"), 3, "2026-08-22T01:00:00Z"), u(55)); expect(investigation.investigation).toMatchObject({ statutoryDeadlineValidated: false, internalSlaDueAt: reported.snapshot.investigationDueAt });
    incident.setRecurrenceAction(command(manager("safety.incident.investigate"), 4, "2026-08-22T02:00:00Z"), { incidentRecurrenceActionId: u(56), causeAnalysis: "단자 체결토크 미달", actionPlan: "토크렌치 이중 확인", ownerUserId: ownerId, dueAt: utcInstant("2026-08-23T00:00:00Z"), evidenceIds: [u(57)] }); incident.submitVerification(command(actor(ownerId, [], "safety.recurrence.submit"), 5, "2026-08-22T03:00:00Z"), [u(58)]);
    expect(() => incident.close(command(actor(ownerId, ["POSITION_LAB_DIRECTOR"], "safety.incident.close"), 6, "2026-08-22T04:00:00Z"), { incidentVerificationId: u(59), submittedByUserId: ownerId, evidenceIds: [u(60)] })).toThrowError(expect.objectContaining({ code: "SAFETY_INCIDENT_DIRECTOR_VERIFICATION_REQUIRED" }));
    expect(incident.close(command(actor(directorId, ["POSITION_LAB_DIRECTOR"], "safety.incident.close"), 6, "2026-08-22T04:00:00Z"), { incidentVerificationId: u(59), submittedByUserId: ownerId, evidenceIds: [u(60)] }).snapshot.state).toBe("CLOSED");
  });
});
