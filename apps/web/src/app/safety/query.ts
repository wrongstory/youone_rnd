import type { SafetyIncidentState, SafetyInspectionState } from "@youone/feature-safety/public";

import { previewSafetyIncidents, previewSafetyInspections, previewSafetyOverview } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

export type { SafetyIncidentState, SafetyInspectionState } from "@youone/feature-safety/public";
export type SafetyTaskState = "OPEN" | "IN_PROGRESS" | "VERIFICATION" | "CLOSED";

export interface SafetyAssignmentView { readonly assignmentId: string; readonly role: "SAFETY_MANAGER" | "TEAM_COORDINATOR"; readonly assigneeDisplayName: string; readonly scopeLabel: string; readonly effectiveFrom: string; readonly effectiveTo?: string }
export interface SafetyInspectionListItemView { readonly inspectionId: string; readonly inspectionNo: string; readonly cadence: "WEEKLY" | "MONTHLY"; readonly areaLabel: string; readonly state: SafetyInspectionState; readonly assignedInspectorDisplayName: string; readonly scheduledAt: string; readonly openFindingCount: number; readonly stopWorkActive: boolean }
export interface SafetyFindingView { readonly findingId: string; readonly criterionLabel: string; readonly riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; readonly summary: string; readonly stopWorkRequired: boolean; readonly issuedAt: string }
export interface SafetyTaskView { readonly taskId: string; readonly title: string; readonly responsibleParty: "INTERNAL" | "VENDOR"; readonly responsibleDisplayName: string; readonly dueAt: string; readonly state: SafetyTaskState; readonly evidenceStatus: "NOT_SUBMITTED" | "SUBMITTED" | "VERIFIED" }
export interface SafetyVerificationView { readonly verificationId: string; readonly verifierDisplayName: string; readonly outcome: "PASSED" | "FAILED"; readonly verifiedAt: string; readonly evidenceCount: number }
export interface SafetyInspectionDetailView extends SafetyInspectionListItemView { readonly checklistTitle: string; readonly findings: readonly SafetyFindingView[]; readonly tasks: readonly SafetyTaskView[]; readonly verifications: readonly SafetyVerificationView[]; readonly timeline: readonly { readonly eventId: string; readonly label: string; readonly occurredAt: string }[] }
export interface SafetyTrainingView { readonly trainingId: string; readonly title: string; readonly scheduledAt: string; readonly instructorDisplayName: string; readonly attendeeCount: number; readonly absentCount: number; readonly makeUpRequiredCount: number; readonly completionRate: string }
export interface SafetyIncidentListItemView { readonly incidentId: string; readonly incidentNo: string; readonly title: string; readonly state: SafetyIncidentState; readonly occurredAt: string; readonly areaLabel: string; readonly investigationDueAt: string; readonly investigationSla: "ON_TRACK" | "DUE_SOON" | "OVERDUE" | "COMPLETED" }
export interface SafetyIncidentDetailView extends SafetyIncidentListItemView { readonly reporterDisplayName: string; readonly emergencyResponseSummary: string; readonly sitePreservationStatus: "REQUIRED" | "SECURED" | "RELEASED_WITH_EVIDENCE"; readonly investigationStartedAt?: string; readonly internalCauseAnalysis: string; readonly recurrenceTasks: readonly SafetyTaskView[]; readonly verificationSummary?: string; readonly protectedEvidenceCount: number; readonly timeline: readonly { readonly eventId: string; readonly label: string; readonly occurredAt: string }[] }
export interface SafetyDashboardView { readonly assignments: readonly SafetyAssignmentView[]; readonly inspections: readonly SafetyInspectionListItemView[]; readonly trainings: readonly SafetyTrainingView[]; readonly incidents: readonly SafetyIncidentListItemView[] }

export interface SafetyVendorContext { readonly vendorId: string; readonly activeMembership: boolean; readonly exactProjectScope: boolean; readonly exactContractScope: boolean; readonly assignedTaskIds: readonly string[] }
export interface VendorSafetyInstructionView { readonly recordKind: "INSPECTION" | "INCIDENT"; readonly recordId: string; readonly recordNo: string; readonly areaLabel: string; readonly state: SafetyInspectionState | SafetyIncidentState; readonly instruction: string; readonly assignedTasks: readonly Pick<SafetyTaskView, "taskId" | "title" | "dueAt" | "state" | "evidenceStatus">[] }

export interface SafetyInspectionProjectionSource extends SafetyInspectionDetailView { readonly vendorId?: string; readonly projectId?: string; readonly contractId?: string; readonly vendorInstruction: string; readonly securityOriginalReference?: string; readonly [key: string]: unknown }
export interface SafetyIncidentProjectionSource extends SafetyIncidentDetailView { readonly vendorId?: string; readonly projectId?: string; readonly contractId?: string; readonly vendorInstruction: string; readonly securityOriginalReference?: string; readonly personalTrainingDetails?: readonly unknown[]; readonly [key: string]: unknown }

const freezeList = <T>(items: readonly T[]): readonly T[] => Object.freeze(items.map((item) => Object.freeze(structuredClone(item))));

export function projectSafetyInspectionInternal(source: SafetyInspectionProjectionSource): SafetyInspectionDetailView {
  return Object.freeze({ inspectionId: source.inspectionId, inspectionNo: source.inspectionNo, cadence: source.cadence, areaLabel: source.areaLabel, state: source.state, assignedInspectorDisplayName: source.assignedInspectorDisplayName, scheduledAt: source.scheduledAt, openFindingCount: source.openFindingCount, stopWorkActive: source.stopWorkActive, checklistTitle: source.checklistTitle, findings: freezeList(source.findings), tasks: freezeList(source.tasks), verifications: freezeList(source.verifications), timeline: freezeList(source.timeline) });
}
export function projectSafetyIncidentInternal(source: SafetyIncidentProjectionSource): SafetyIncidentDetailView {
  return Object.freeze({ incidentId: source.incidentId, incidentNo: source.incidentNo, title: source.title, state: source.state, occurredAt: source.occurredAt, areaLabel: source.areaLabel, investigationDueAt: source.investigationDueAt, investigationSla: source.investigationSla, reporterDisplayName: source.reporterDisplayName, emergencyResponseSummary: source.emergencyResponseSummary, sitePreservationStatus: source.sitePreservationStatus, investigationStartedAt: source.investigationStartedAt, internalCauseAnalysis: source.internalCauseAnalysis, recurrenceTasks: freezeList(source.recurrenceTasks), verificationSummary: source.verificationSummary, protectedEvidenceCount: source.protectedEvidenceCount, timeline: freezeList(source.timeline) });
}
function vendorScopeAllows(source: { vendorId?: string; projectId?: string; contractId?: string }, context: SafetyVendorContext): boolean {
  return context.activeMembership && context.exactProjectScope && source.vendorId === context.vendorId && Boolean(source.projectId) && (source.contractId === undefined || context.exactContractScope);
}
function ownTasks(tasks: readonly SafetyTaskView[], context: SafetyVendorContext) {
  return Object.freeze(tasks.filter((task) => task.responsibleParty === "VENDOR" && context.assignedTaskIds.includes(task.taskId)).map(({ taskId, title, dueAt, state, evidenceStatus }) => Object.freeze({ taskId, title, dueAt, state, evidenceStatus })));
}
function projectIncidentList(source: SafetyIncidentProjectionSource): SafetyIncidentListItemView {
  return Object.freeze({ incidentId: source.incidentId, incidentNo: source.incidentNo, title: source.title, state: source.state, occurredAt: source.occurredAt, areaLabel: source.areaLabel, investigationDueAt: source.investigationDueAt, investigationSla: source.investigationSla });
}
export function projectSafetyInspectionVendor(source: SafetyInspectionProjectionSource, context: SafetyVendorContext): VendorSafetyInstructionView | null {
  if (!vendorScopeAllows(source, context)) return null;
  return Object.freeze({ recordKind: "INSPECTION", recordId: source.inspectionId, recordNo: source.inspectionNo, areaLabel: source.areaLabel, state: source.state, instruction: source.vendorInstruction, assignedTasks: ownTasks(source.tasks, context) });
}
export function projectSafetyIncidentVendor(source: SafetyIncidentProjectionSource, context: SafetyVendorContext): VendorSafetyInstructionView | null {
  if (!vendorScopeAllows(source, context)) return null;
  return Object.freeze({ recordKind: "INCIDENT", recordId: source.incidentId, recordNo: source.incidentNo, areaLabel: source.areaLabel, state: source.state, instruction: source.vendorInstruction, assignedTasks: ownTasks(source.recurrenceTasks, context) });
}

export type SafetyDashboardResult = { readonly availability: "AVAILABLE"; readonly dashboard: SafetyDashboardView } | { readonly availability: "FORBIDDEN"; readonly dashboard: null } | { readonly availability: "UNAVAILABLE"; readonly dashboard: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type SafetyInspectionResult = { readonly availability: "AVAILABLE"; readonly detail: SafetyInspectionDetailView } | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type SafetyIncidentResult = { readonly availability: "AVAILABLE"; readonly detail: SafetyIncidentDetailView } | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type VendorSafetyInstructionResult = { readonly availability: "AVAILABLE"; readonly detail: VendorSafetyInstructionView } | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null };
export interface SafetyQueryPort {
  getInternalDashboard(): Promise<SafetyDashboardResult>;
  getInternalInspection(inspectionId: string): Promise<SafetyInspectionResult>;
  getInternalIncident(incidentId: string): Promise<SafetyIncidentResult>;
  getVendorInstruction(recordKind: "INSPECTION" | "INCIDENT", recordId: string, context: SafetyVendorContext): Promise<VendorSafetyInstructionResult>;
  getAdminSystemOriginal(recordId: string): Promise<{ readonly availability: "FORBIDDEN"; readonly original: null; readonly capability: "NONE" }>;
}

class UnavailableSafetyQuery implements SafetyQueryPort {
  async getInternalDashboard(): Promise<SafetyDashboardResult> { return { availability: "UNAVAILABLE", dashboard: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
  async getInternalInspection(inspectionId: string): Promise<SafetyInspectionResult> { void inspectionId; return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
  async getInternalIncident(incidentId: string): Promise<SafetyIncidentResult> { void incidentId; return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
  async getVendorInstruction(recordKind: "INSPECTION" | "INCIDENT", recordId: string, context: SafetyVendorContext): Promise<VendorSafetyInstructionResult> { void recordKind; void recordId; void context; return { availability: "FORBIDDEN", detail: null }; }
  async getAdminSystemOriginal(recordId: string) { void recordId; return { availability: "FORBIDDEN" as const, original: null, capability: "NONE" as const }; }
}

class PreviewSafetyQuery extends UnavailableSafetyQuery {
  override async getInternalDashboard(): Promise<SafetyDashboardResult> { return { availability: "AVAILABLE", dashboard: Object.freeze({ assignments: freezeList(previewSafetyOverview.assignments), inspections: freezeList(previewSafetyInspections.map(projectSafetyInspectionInternal)), trainings: freezeList(previewSafetyOverview.trainings), incidents: freezeList(previewSafetyIncidents.map(projectIncidentList)) }) }; }
  override async getInternalInspection(inspectionId: string): Promise<SafetyInspectionResult> { const detail = previewSafetyInspections.find((item) => item.inspectionId === inspectionId); return detail ? { availability: "AVAILABLE", detail: projectSafetyInspectionInternal(detail) } : { availability: "NOT_FOUND", detail: null }; }
  override async getInternalIncident(incidentId: string): Promise<SafetyIncidentResult> { const detail = previewSafetyIncidents.find((item) => item.incidentId === incidentId); return detail ? { availability: "AVAILABLE", detail: projectSafetyIncidentInternal(detail) } : { availability: "NOT_FOUND", detail: null }; }
  override async getVendorInstruction(recordKind: "INSPECTION" | "INCIDENT", recordId: string, context: SafetyVendorContext): Promise<VendorSafetyInstructionResult> { const detail = recordKind === "INSPECTION" ? previewSafetyInspections.find((item) => item.inspectionId === recordId) : previewSafetyIncidents.find((item) => item.incidentId === recordId); if (!detail) return { availability: "NOT_FOUND", detail: null }; const projected = recordKind === "INSPECTION" ? projectSafetyInspectionVendor(detail as SafetyInspectionProjectionSource, context) : projectSafetyIncidentVendor(detail as SafetyIncidentProjectionSource, context); return projected ? { availability: "AVAILABLE", detail: projected } : { availability: "FORBIDDEN", detail: null }; }
}

export function safetyQuery(usePreviewData = previewDataEnabled()): SafetyQueryPort { return usePreviewData ? new PreviewSafetyQuery() : new UnavailableSafetyQuery(); }
