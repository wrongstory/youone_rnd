import type { Money, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import type { ContractMilestoneSnapshot, ContractMutation, ContractVersionSnapshot, GuaranteeSnapshot, VendorContractSnapshot, VendorContractState, WarrantyIssueSnapshot } from "../domain/contract.js";
import type { DeliverableMutation, DeliverableSnapshot, DeliverableState, DeliverableVersionSnapshot } from "../domain/deliverable.js";

/** List-safe Contract projection. Amount, payment and internal Vendor evaluation fields cannot be selected into this type. */
export interface VendorContractListSafeItem {
  readonly contractId: string;
  readonly contractNo: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly title: string;
  readonly state: VendorContractState;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
  readonly projectIds: readonly string[];
  readonly currentVersionNo?: number;
  readonly version: number;
}

export interface VendorContractBasicDetail extends VendorContractListSafeItem {
  readonly statementOfWorkDocumentVersionId?: string;
  readonly milestones: readonly {
    readonly contractMilestoneId: string;
    readonly sequenceNo: number;
    readonly milestoneCode: string;
    readonly title: string;
    readonly dueDate: string;
  }[];
  readonly deliverables: readonly {
    readonly deliverableId: string;
    readonly contractMilestoneId: string;
    readonly deliverableCode: string;
    readonly title: string;
    readonly state: DeliverableState;
    readonly submittedVersionId?: string;
  }[];
  readonly guarantees: readonly {
    readonly guaranteeId: string;
    readonly guaranteeTypeCode: string;
    readonly validFrom: string;
    readonly validTo: string;
    readonly state: GuaranteeSnapshot["state"];
  }[];
  readonly warrantyIssues: readonly Pick<WarrantyIssueSnapshot, "warrantyIssueId" | "issueCode" | "summary" | "state" | "responsibilityState">[];
}

/** Finance is a separate authorization path requiring contract.detail.finance.read and exact ContractScope. */
export interface VendorContractFinanceDetail {
  readonly contractId: string;
  readonly contractVersionId: string;
  readonly contractAmount: Money;
  readonly milestones: readonly {
    readonly contractMilestoneId: string;
    readonly sequenceNo: number;
    readonly plannedAmount: Money;
    readonly plannedRatio: string;
  }[];
  readonly policyProvenance: {
    readonly presetPolicyId: string;
    readonly presetPolicyVersion: number;
    readonly legalBaselineId: string;
    readonly legalBaselineVersion: number;
    readonly overrideApplied: boolean;
    readonly overrideReason?: string;
    readonly approvalInstanceId?: string;
  };
}

export type ContractListSafeResult = { readonly availability: "AVAILABLE"; readonly items: readonly VendorContractListSafeItem[] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type ContractBasicDetailResult = { readonly availability: "AVAILABLE"; readonly detail: VendorContractBasicDetail } | { readonly availability: "NOT_FOUND" | "FORBIDDEN"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type ContractFinanceDetailResult = { readonly availability: "AVAILABLE"; readonly detail: VendorContractFinanceDetail } | { readonly availability: "NOT_FOUND" | "FORBIDDEN"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface VendorContractQueryPort {
  listSafe(): Promise<ContractListSafeResult>;
  getBasicDetail(contractId: string): Promise<ContractBasicDetailResult>;
  getFinanceDetail(contractId: string): Promise<ContractFinanceDetailResult>;
}

export interface ContractRepository {
  insert(snapshot: VendorContractSnapshot): Promise<void>;
  save(snapshot: VendorContractSnapshot, expectedVersion: Version): Promise<boolean>;
  insertImmutableVersion(snapshot: ContractVersionSnapshot): Promise<void>;
  supersedeVersion(contractVersionId: Uuid, supersededByVersionId: Uuid): Promise<void>;
  insertMilestones(milestones: readonly ContractMilestoneSnapshot[]): Promise<void>;
}
export interface DeliverableRepository {
  insert(snapshot: DeliverableSnapshot): Promise<void>;
  save(snapshot: DeliverableSnapshot, expectedVersion: Version): Promise<boolean>;
  insertImmutableVersion(snapshot: DeliverableVersionSnapshot): Promise<void>;
}
export interface ContractScopePort {
  /** Implementation must validate active Vendor + membership, all exact projects and validity before issuing grants. */
  issueExactContractScopes(input: { readonly contractId: Uuid; readonly vendorId: Uuid; readonly projectIds: readonly Uuid[]; readonly validFrom: string; readonly validTo?: string }): Promise<void>;
  refreshExactContractScopes(input: { readonly contractId: Uuid; readonly vendorId: Uuid; readonly projectIds: readonly Uuid[]; readonly validFrom: string; readonly validTo?: string }): Promise<void>;
  revokeAllContractScopes(input: { readonly contractId: Uuid; readonly vendorId: Uuid; readonly revokedAt: UtcInstant; readonly reason: string }): Promise<void>;
}
export interface ContractEvidencePort {
  appendTransition(input: { readonly aggregateId: Uuid; readonly machineId: StableCode; readonly fromVersion: Version; readonly toVersion: Version; readonly eventType: StableCode; readonly occurredAt: UtcInstant }): Promise<void>;
  appendAudit(audit: ContractMutation["audit"] | DeliverableMutation["audit"]): Promise<void>;
  enqueue(event: ContractMutation["event"] | DeliverableMutation["event"]): Promise<void>;
}
export interface ContractTransactionContext { readonly contracts: ContractRepository; readonly deliverables: DeliverableRepository; readonly scopes: ContractScopePort; readonly evidence: ContractEvidencePort }
export interface ContractUnitOfWork { transact<T>(work: (context: ContractTransactionContext) => Promise<T>): Promise<T> }
export class ContractConcurrencyError extends Error { public readonly code = "CONTRACT_STALE_VERSION" as StableCode; }

async function appendContractEvidence(context: ContractTransactionContext, mutation: ContractMutation): Promise<void> {
  await context.evidence.appendTransition({ aggregateId: mutation.snapshot.contractId, machineId: mutation.event.machineId as StableCode, fromVersion: mutation.expectedVersion, toVersion: mutation.snapshot.version, eventType: mutation.event.eventType, occurredAt: mutation.event.occurredAt });
  await context.evidence.appendAudit(mutation.audit); await context.evidence.enqueue(mutation.event);
}
async function appendDeliverableEvidence(context: ContractTransactionContext, mutation: DeliverableMutation): Promise<void> {
  await context.evidence.appendTransition({ aggregateId: mutation.snapshot.deliverableId, machineId: mutation.event.machineId as StableCode, fromVersion: mutation.expectedVersion, toVersion: mutation.snapshot.version, eventType: mutation.event.eventType, occurredAt: mutation.event.occurredAt });
  await context.evidence.appendAudit(mutation.audit); await context.evidence.enqueue(mutation.event);
}

export async function persistContractCreation(unitOfWork: ContractUnitOfWork, mutation: ContractMutation): Promise<void> {
  if (mutation.expectedVersion !== 0 || mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-CONTRACT-CREATE" || mutation.scopeObligation !== "NONE") throw new ContractConcurrencyError("Contract creation must be the canonical version 0 to 1 transition.");
  await unitOfWork.transact(async (context) => { await context.contracts.insert(mutation.snapshot); await appendContractEvidence(context, mutation); });
}

export async function persistImmutableContractVersion(unitOfWork: ContractUnitOfWork, versionSnapshot: ContractVersionSnapshot, milestones: readonly ContractMilestoneSnapshot[]): Promise<void> {
  if (versionSnapshot.state !== "SEALED" && versionSnapshot.state !== "SIGNED") throw new Error("CONTRACT_VERSION_NOT_IMMUTABLE");
  await unitOfWork.transact(async (context) => { await context.contracts.insertImmutableVersion(versionSnapshot); await context.contracts.insertMilestones(milestones); });
}

export async function persistContractMutation(unitOfWork: ContractUnitOfWork, mutation: ContractMutation, currentSignedVersion?: ContractVersionSnapshot): Promise<void> {
  if (mutation.expectedVersion === 0) throw new ContractConcurrencyError("Create mutations require persistContractCreation.");
  const expectedObligation = mutation.event.eventType === "EVT-CONTRACT-ACTIVATE" ? "ISSUE" : mutation.event.eventType === "EVT-CONTRACT-CHANGE-EFFECTIVE" ? "REFRESH" : mutation.event.eventType === "EVT-CONTRACT-CLOSE" || mutation.event.eventType === "EVT-CONTRACT-TERMINATE" ? "REVOKE" : "NONE";
  if (mutation.scopeObligation !== expectedObligation) throw new Error("CONTRACT_SCOPE_OBLIGATION_MISMATCH");
  await unitOfWork.transact(async (context) => {
    if (!await context.contracts.save(mutation.snapshot, mutation.expectedVersion)) throw new ContractConcurrencyError("Concurrent Contract mutation lost optimistic lock.");
    const projectIds = mutation.snapshot.projectLinks.map((link) => link.projectId);
    if (mutation.scopeObligation === "ISSUE" || mutation.scopeObligation === "REFRESH") {
      if (!currentSignedVersion || currentSignedVersion.contractVersionId !== mutation.snapshot.currentSignedVersionId || currentSignedVersion.state !== "SIGNED") throw new Error("CONTRACT_CURRENT_SIGNED_VERSION_REQUIRED");
      const scope = { contractId: mutation.snapshot.contractId, vendorId: mutation.snapshot.vendorId, projectIds, validFrom: currentSignedVersion.effectiveFrom, ...(currentSignedVersion.effectiveTo ? { validTo: currentSignedVersion.effectiveTo } : {}) };
      if (mutation.scopeObligation === "ISSUE") await context.scopes.issueExactContractScopes(scope); else await context.scopes.refreshExactContractScopes(scope);
    } else if (mutation.scopeObligation === "REVOKE") {
      await context.scopes.revokeAllContractScopes({ contractId: mutation.snapshot.contractId, vendorId: mutation.snapshot.vendorId, revokedAt: mutation.event.occurredAt, reason: mutation.audit.reason ?? mutation.event.eventType });
    }
    await appendContractEvidence(context, mutation);
  });
}

export async function persistDeliverableCreation(unitOfWork: ContractUnitOfWork, mutation: DeliverableMutation): Promise<void> {
  if (mutation.expectedVersion !== 0 || mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-DELIVERABLE-DEFINE") throw new ContractConcurrencyError("Deliverable creation must be the canonical version 0 to 1 transition.");
  await unitOfWork.transact(async (context) => { await context.deliverables.insert(mutation.snapshot); await appendDeliverableEvidence(context, mutation); });
}
export async function persistDeliverableMutation(unitOfWork: ContractUnitOfWork, mutation: DeliverableMutation, exactVersion?: DeliverableVersionSnapshot): Promise<void> {
  if (mutation.expectedVersion === 0) throw new ContractConcurrencyError("Create mutations require persistDeliverableCreation.");
  await unitOfWork.transact(async (context) => {
    if (mutation.event.eventType === "EVT-DELIVERABLE-SUBMIT") { if (!exactVersion || exactVersion.deliverableVersionId !== mutation.snapshot.submittedVersionId || exactVersion.deliverableId !== mutation.snapshot.deliverableId) throw new Error("DELIVERABLE_EXACT_VERSION_REQUIRED"); await context.deliverables.insertImmutableVersion(exactVersion); }
    if (!await context.deliverables.save(mutation.snapshot, mutation.expectedVersion)) throw new ContractConcurrencyError("Concurrent Deliverable mutation lost optimistic lock.");
    await appendDeliverableEvidence(context, mutation);
  });
}

/** Acceptance and external payment confirmation are facts only; they never waive latent-defect, warranty or Vendor responsibility. */
export const CONTRACT_RESPONSIBILITY_INVARIANT = Object.freeze({ acceptanceWaivesVendorResponsibility: false, paymentWaivesVendorResponsibility: false, warrantySurvivesPerformanceCompletion: true });
