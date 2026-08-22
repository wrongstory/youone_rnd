import type { StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import { assertTrustedApprovedPurchaseOutcome, assertTrustedNegativePurchaseOutcome, type TrustedApprovedPurchaseOutcome, type TrustedNegativePurchaseOutcome, type VerifiedPurchaseApprovalOutcomePort } from "../approval/contracts.js";
import { PurchaseRequest, type ExternalPaymentFactSnapshot, type PurchaseAuditObligation, type PurchaseCommand, type PurchaseDomainEvent, type PurchaseInspectionLinkSnapshot, type PurchaseInspectionOutcomeSnapshot, type PurchaseMutation, type PurchaseNegativeApprovalOutcomeSnapshot, type PurchaseRequestVersionSnapshot, type PurchaseResolutionSnapshot, type PurchaseSnapshot, type QuotationSnapshot, type ReceiptOverageDiscrepancySnapshot, type ReceiptSnapshot, type SupplierSnapshot, type ItemSnapshot, type SupplierVendorLinkSnapshot, type VerifiedPurchaseApprovalSnapshot } from "../domain/purchase.js";

export const PURCHASE_PERMISSION_IDS = Object.freeze({ REQUEST_CREATE: "purchase.request.create", REQUEST_MANAGE: "purchase.request.manage", REQUEST_APPROVE_TRUSTED_SYSTEM: "purchase.request.approve", RESOLUTION_MANAGE: "purchase.resolution.manage", PAYMENT_RECORD: "purchase.payment.record", RECEIPT_RECORD: "purchase.receipt.record", INSPECTION_RECORD: "purchase.inspection.record", READ: "purchase.request.read" } as const);
export const PURCHASE_APPROVAL_SUBJECT_KIND = "PURCHASE_REQUEST_VERSION" as const;

export interface PurchaseRepository { loadForUpdate(id: Uuid): Promise<PurchaseSnapshot | null>; loadLatestNegativeApprovalOutcome(purchaseRequestVersionId: Uuid): Promise<PurchaseNegativeApprovalOutcomeSnapshot | null>; insert(snapshot: PurchaseSnapshot): Promise<void>; save(snapshot: PurchaseSnapshot, expectedVersion: Version): Promise<boolean>; appendImmutableRequestVersion(snapshot: PurchaseRequestVersionSnapshot): Promise<void>; appendImmutableApproval(snapshot: VerifiedPurchaseApprovalSnapshot): Promise<void>; appendImmutableNegativeApprovalOutcome(snapshot: PurchaseNegativeApprovalOutcomeSnapshot): Promise<void>; appendImmutableResolution(snapshot: PurchaseResolutionSnapshot): Promise<void>; appendImmutablePaymentFact(snapshot: ExternalPaymentFactSnapshot): Promise<void>; appendImmutableReceipt(snapshot: ReceiptSnapshot): Promise<void>; appendImmutableReceiptOverage(snapshot: ReceiptOverageDiscrepancySnapshot): Promise<void>; appendImmutableInspectionLink(snapshot: PurchaseInspectionLinkSnapshot): Promise<void>; appendImmutableInspectionOutcome(snapshot: PurchaseInspectionOutcomeSnapshot): Promise<void> }
export interface SupplierItemRepository { insertSupplier(snapshot: SupplierSnapshot): Promise<void>; insertItem(snapshot: ItemSnapshot): Promise<void>; appendReviewedSupplierVendorLink(snapshot: SupplierVendorLinkSnapshot): Promise<void> }
export interface PurchaseLinkValidationPort { assertProjects(projectIds: readonly Uuid[]): Promise<void>; assertRndPrograms(rndProgramIds: readonly Uuid[]): Promise<void>; assertItems(itemIds: readonly Uuid[]): Promise<void>; assertSuppliers(supplierIds: readonly Uuid[]): Promise<void>; assertPrivateQuotationEvidence(quotes: readonly QuotationSnapshot[]): Promise<void>; assertTypedInspection(input: PurchaseInspectionLinkSnapshot): Promise<void> }
export interface PurchaseEvidencePort { appendTransition(input: { readonly aggregateId: Uuid; readonly machineId: typeof import("../domain/purchase.js").PURCHASE_MACHINE_ID; readonly fromVersion: Version; readonly toVersion: Version; readonly eventType: StableCode; readonly occurredAt: UtcInstant }): Promise<void>; appendAudit(obligation: PurchaseAuditObligation): Promise<void>; enqueue(event: PurchaseDomainEvent): Promise<void> }
export interface PurchaseTransactionContext { readonly purchases: PurchaseRepository; readonly masters: SupplierItemRepository; readonly links: PurchaseLinkValidationPort; readonly evidence: PurchaseEvidencePort }
export interface PurchaseUnitOfWork { transact<T>(work: (context: PurchaseTransactionContext) => Promise<T>): Promise<T> }
export class PurchaseApplicationError extends Error { public constructor(public readonly code: StableCode, message: string) { super(message); this.name = "PurchaseApplicationError"; } }

async function appendEvidence(context: PurchaseTransactionContext, mutation: PurchaseMutation): Promise<void> { if (mutation.snapshot.version !== mutation.expectedVersion + 1) throw new PurchaseApplicationError("PURCHASE_VERSION_NOT_DIRECT_NEXT" as StableCode, "Purchase mutation must increment version exactly once."); await context.evidence.appendTransition({ aggregateId: mutation.snapshot.purchaseRequestId, machineId: "SM-PURCHASE-V1", fromVersion: mutation.expectedVersion, toVersion: mutation.snapshot.version, eventType: mutation.event.eventType, occurredAt: mutation.event.occurredAt }); await context.evidence.appendAudit(mutation.audit); await context.evidence.enqueue(mutation.event); }
async function save(context: PurchaseTransactionContext, mutation: PurchaseMutation): Promise<void> { if (mutation.expectedVersion === 0) { if (mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-PURCHASE-CREATE") throw new PurchaseApplicationError("PURCHASE_CREATE_VERSION_INVALID" as StableCode, "Creation must be version 0 to 1."); await context.links.assertProjects(mutation.snapshot.projectIds); await context.links.assertRndPrograms(mutation.snapshot.rndProgramIds); await context.links.assertItems(mutation.snapshot.lines.map((line) => line.itemId)); await context.links.assertSuppliers(mutation.snapshot.quotations.map((quote) => quote.supplierId)); await context.links.assertPrivateQuotationEvidence(mutation.snapshot.quotations); await context.purchases.insert(mutation.snapshot); } else if (!await context.purchases.save(mutation.snapshot, mutation.expectedVersion)) throw new PurchaseApplicationError("PURCHASE_STALE_VERSION" as StableCode, "Purchase optimistic lock lost."); if (mutation.immutableRequestVersion) await context.purchases.appendImmutableRequestVersion(mutation.immutableRequestVersion); if (mutation.immutableApproval) await context.purchases.appendImmutableApproval(mutation.immutableApproval); if (mutation.immutableResolution) await context.purchases.appendImmutableResolution(mutation.immutableResolution); if (mutation.immutablePaymentFact) await context.purchases.appendImmutablePaymentFact(mutation.immutablePaymentFact); if (mutation.immutableReceipt) await context.purchases.appendImmutableReceipt(mutation.immutableReceipt); for (const overage of mutation.immutableReceiptOverages ?? []) await context.purchases.appendImmutableReceiptOverage(overage); if (mutation.immutableInspectionLink) { await context.links.assertTypedInspection(mutation.immutableInspectionLink); await context.purchases.appendImmutableInspectionLink(mutation.immutableInspectionLink); } if (mutation.immutableInspectionOutcome) await context.purchases.appendImmutableInspectionOutcome(mutation.immutableInspectionOutcome); await appendEvidence(context, mutation); }
export async function persistPurchaseMutation(unitOfWork: PurchaseUnitOfWork, mutation: PurchaseMutation): Promise<void> { if (mutation.event.eventType === "EVT-PURCHASE-APPROVED" || mutation.snapshot.state === "REQUEST_APPROVED") throw new PurchaseApplicationError("PURCHASE_TRUSTED_APPROVAL_OUTCOME_REQUIRED" as StableCode, "Purchase Approval completion must enter through the trusted Approval adapter boundary."); await unitOfWork.transact((context) => save(context, mutation)); }

function assertExactApprovalSubject(snapshot: PurchaseSnapshot, input: TrustedApprovedPurchaseOutcome | TrustedNegativePurchaseOutcome): void {
  const exact = input.exactVersion;
  const exactSubjectId = input.snapshot.subject.kind === "PURCHASE_REQUEST_VERSION" ? input.snapshot.subject.purchaseRequestVersionId : undefined;
  if (exactSubjectId !== exact.purchaseRequestVersionId || exact.purchaseRequestId !== snapshot.purchaseRequestId ||
    exact.purchaseRequestVersionId !== snapshot.sealedRequestVersionId || exact.subjectVersion !== snapshot.sealedRequestVersionNo ||
    exact.sealedSnapshotChecksum !== snapshot.sealedRequestChecksum || exact.sealedAt !== snapshot.sealedRequestAt ||
    exact.sealedVatInclusiveTotalBurden.amount !== snapshot.totalExpectedAmount.amount ||
    exact.sealedVatInclusiveTotalBurden.currency !== snapshot.totalExpectedAmount.currency) {
    throw new PurchaseApplicationError("PURCHASE_APPROVAL_EXACT_VERSION_MISMATCH" as StableCode, "Approval outcome must match the locked PurchaseRequestVersion and its VAT-inclusive total burden exactly.");
  }
}

export class PurchaseApprovalOutcomeService implements VerifiedPurchaseApprovalOutcomePort {
  public constructor(private readonly unitOfWork: PurchaseUnitOfWork) {}

  public async applyApprovedOutcome(input: TrustedApprovedPurchaseOutcome): Promise<void> {
    assertTrustedApprovedPurchaseOutcome(input);
    await this.unitOfWork.transact(async (context) => {
      const snapshot = await context.purchases.loadForUpdate(input.exactVersion.purchaseRequestId);
      if (!snapshot) throw new PurchaseApplicationError("PURCHASE_NOT_FOUND" as StableCode, "Purchase request was not found.");
      if (snapshot.state !== "APPROVAL_PENDING") throw new PurchaseApplicationError("PURCHASE_APPROVAL_STATE_INVALID" as StableCode, "Only a locked approval-pending request may consume a completed Approval outcome.");
      assertExactApprovalSubject(snapshot, input);
      const completed = input.completedApproval;
      if (completed.subject.purchaseRequestVersionId !== input.exactVersion.purchaseRequestVersionId ||
        completed.subjectVersion !== input.exactVersion.subjectVersion || completed.subjectChecksum !== input.exactVersion.sealedSnapshotChecksum ||
        completed.subjectSealedAt !== input.exactVersion.sealedAt || completed.approvalPolicyVersionId !== input.policySnapshot.approvalPolicyVersionId ||
        completed.approvalPolicyChecksum !== input.policySnapshot.approvalPolicyChecksum) {
        throw new PurchaseApplicationError("PURCHASE_COMPLETED_APPROVAL_MISMATCH" as StableCode, "Completed Approval evidence must bind the exact request and policy snapshots.");
      }
      const approval: VerifiedPurchaseApprovalSnapshot = Object.freeze({
        approvalInstanceId: completed.approvalInstanceId, approvalVersion: completed.approvalVersion,
        approvalPolicyVersionId: completed.approvalPolicyVersionId, approvalPolicyChecksum: completed.approvalPolicyChecksum,
        approvalStepId: completed.approvalStepId, approvalParticipantId: completed.approvalParticipantId,
        purchaseRequestVersionId: input.exactVersion.purchaseRequestVersionId, subjectVersion: completed.subjectVersion,
        subjectChecksum: completed.subjectChecksum, subjectSealedAt: completed.subjectSealedAt, completedAt: completed.completedAt,
        officialApproverUserId: completed.officialApproverUserId, officialApproverPositionId: completed.officialApproverPositionId,
        ...(completed.actingAuthorityEvidenceId === undefined ? {} : { actingAuthorityEvidenceId: completed.actingAuthorityEvidenceId })
      });
      const command: PurchaseCommand = {
        actor: { actorKind: "SYSTEM", userId: completed.officialApproverUserId, active: true, authorities: [PURCHASE_PERMISSION_IDS.REQUEST_APPROVE_TRUSTED_SYSTEM as StableCode] },
        expectedVersion: snapshot.version, at: input.provenance.occurredAt, eventId: input.provenance.terminalAction.actionId,
        correlationId: input.provenance.correlationId, idempotencyKey: input.provenance.idempotencyKey
      };
      await save(context, PurchaseRequest.restore(snapshot).recordVerifiedApproval(command, approval));
    });
  }

  public async retainNegativeOutcome(input: TrustedNegativePurchaseOutcome): Promise<void> {
    assertTrustedNegativePurchaseOutcome(input);
    await this.unitOfWork.transact(async (context) => {
      const snapshot = await context.purchases.loadForUpdate(input.exactVersion.purchaseRequestId);
      if (!snapshot) throw new PurchaseApplicationError("PURCHASE_NOT_FOUND" as StableCode, "Purchase request was not found.");
      if (snapshot.state !== "APPROVAL_PENDING" || snapshot.resolution !== undefined) throw new PurchaseApplicationError("PURCHASE_NEGATIVE_OUTCOME_STATE_INVALID" as StableCode, "Negative Approval evidence is retained only for an unresolved approval-pending request.");
      assertExactApprovalSubject(snapshot, input);
      const actorUserId = input.provenance.actor.effectiveUserId;
      const negative: PurchaseNegativeApprovalOutcomeSnapshot = Object.freeze({
        purchaseNegativeOutcomeId: input.provenance.terminalAction.actionId, approvalInstanceId: input.approvalInstanceId,
        approvalVersion: input.approvalVersion, purchaseRequestId: snapshot.purchaseRequestId,
        purchaseRequestVersionId: input.exactVersion.purchaseRequestVersionId, subjectVersion: input.exactVersion.subjectVersion,
        subjectChecksum: input.exactVersion.sealedSnapshotChecksum, subjectSealedAt: input.exactVersion.sealedAt,
        outcome: input.outcome,
        ...(input.provenance.terminalReasonCode === undefined ? {} : { terminalReasonCode: input.provenance.terminalReasonCode }),
        occurredAt: input.provenance.occurredAt,
        ...(actorUserId === undefined ? {} : { actorEffectiveUserId: actorUserId }),
        ...(input.provenance.actingAuthorityEvidenceId === undefined ? {} : { actingAuthorityEvidenceId: input.provenance.actingAuthorityEvidenceId }),
        correlationId: input.provenance.correlationId, idempotencyKey: input.provenance.idempotencyKey
      });
      await context.purchases.appendImmutableNegativeApprovalOutcome(negative);
      const actor = input.provenance.actor;
      const auditActor = actor.accountKind === "INTERNAL" && actor.effectiveUserId
        ? { actorKind: "INTERNAL" as const, userId: actor.effectiveUserId, active: true, authorities: [] as readonly StableCode[] }
        : { actorKind: "SYSTEM" as const, active: true, authorities: [] as readonly StableCode[] };
      const evidenceIds = input.provenance.actingAuthorityEvidenceId === undefined ? [] : [input.provenance.actingAuthorityEvidenceId];
      await context.evidence.appendAudit({ eventType: "EVT-PURCHASE-RETAIN-NEGATIVE-APPROVAL" as StableCode, actor: auditActor,
        aggregateId: snapshot.purchaseRequestId, occurredAt: input.provenance.occurredAt, correlationId: input.provenance.correlationId,
        evidenceIds, ...(input.provenance.terminalReasonCode === undefined ? {} : { reason: input.provenance.terminalReasonCode }) });
      await context.evidence.enqueue({ eventId: input.provenance.terminalAction.actionId, eventType: "EVT-PURCHASE-RETAIN-NEGATIVE-APPROVAL" as StableCode,
        aggregateId: snapshot.purchaseRequestId, aggregateVersion: snapshot.version, occurredAt: input.provenance.occurredAt,
        correlationId: input.provenance.correlationId, idempotencyKey: input.provenance.idempotencyKey,
        payload: { outcome: input.outcome, purchaseRequestVersionId: input.exactVersion.purchaseRequestVersionId, resolutionAllowed: false } });
    });
  }
}

export async function revisePurchaseRequestAfterNegativeApproval(unitOfWork: PurchaseUnitOfWork, input: {
  readonly purchaseRequestId: Uuid;
  readonly command: PurchaseCommand;
  readonly revision: Omit<PurchaseRequestVersionSnapshot, "purchaseRequestId" | "sealedAt" | "sealedByUserId">;
}): Promise<PurchaseSnapshot> {
  return unitOfWork.transact(async (context) => {
    const snapshot = await context.purchases.loadForUpdate(input.purchaseRequestId);
    if (!snapshot) throw new PurchaseApplicationError("PURCHASE_NOT_FOUND" as StableCode, "Purchase request was not found.");
    if (!snapshot.sealedRequestVersionId) throw new PurchaseApplicationError("PURCHASE_SEALED_VERSION_REQUIRED" as StableCode, "A current immutable request version is required.");
    const negative = await context.purchases.loadLatestNegativeApprovalOutcome(snapshot.sealedRequestVersionId);
    if (!negative) throw new PurchaseApplicationError("PURCHASE_NEGATIVE_APPROVAL_REQUIRED" as StableCode, "A verified negative Approval outcome is required before creating a replacement version.");
    const mutation = PurchaseRequest.restore(snapshot).reviseAfterNegativeApproval(input.command, input.revision, negative);
    await context.links.assertProjects(mutation.snapshot.projectIds);
    await context.links.assertRndPrograms(mutation.snapshot.rndProgramIds);
    await context.links.assertItems(mutation.snapshot.lines.map((line) => line.itemId));
    await context.links.assertSuppliers(mutation.snapshot.quotations.map((quote) => quote.supplierId));
    await context.links.assertPrivateQuotationEvidence(mutation.snapshot.quotations);
    await save(context, mutation);
    return mutation.snapshot;
  });
}

export async function createPurchaseResolution(unitOfWork: PurchaseUnitOfWork, input: { readonly purchaseRequestId: Uuid; readonly command: PurchaseCommand; readonly resolution: Omit<PurchaseResolutionSnapshot, "purchaseRequestId" | "approvedPurchaseRequestVersionId" | "generation" | "createdByUserId" | "createdAt"> }): Promise<PurchaseSnapshot> { return unitOfWork.transact(async (context) => { const snapshot = await context.purchases.loadForUpdate(input.purchaseRequestId); if (!snapshot) throw new PurchaseApplicationError("PURCHASE_NOT_FOUND" as StableCode, "Purchase request was not found."); if (!snapshot.approval || snapshot.state !== "REQUEST_APPROVED") throw new PurchaseApplicationError("PURCHASE_APPROVAL_REQUIRED" as StableCode, "Resolution requires the exact approved request version."); const mutation = PurchaseRequest.restore(snapshot).createResolution(input.command, input.resolution); await save(context, mutation); return mutation.snapshot; }); }

export interface PurchaseListItemView { readonly purchaseRequestId: string; readonly requestNo: string; readonly purpose: string; readonly state: PurchaseSnapshot["state"]; readonly totalExpectedAmount: { readonly amount: string; readonly currency: string }; readonly selectedSupplierName?: string; readonly receivedLineCount: number; readonly totalLineCount: number; readonly inspectionStatus: "NOT_REQUESTED" | "PENDING" | "CORRECTION_REQUIRED" | "PASSED"; readonly nextAction: StableCode | null }
export interface PurchaseDetailView extends PurchaseListItemView { readonly lines: readonly { readonly lineId: string; readonly itemCode: string; readonly name: string; readonly specification: string; readonly quantity: string; readonly receivedQuantity: string; readonly unitCode: string }[]; readonly quotationSummaries: readonly { readonly supplierName: string; readonly quotedAmount: { readonly amount: string; readonly currency: string }; readonly evidenceAvailable: boolean }[]; readonly externalPaymentStatus: "NOT_RECORDED" | "CONFIRMED" }
export interface PurchaseProjectionSource extends PurchaseDetailView { readonly [key: string]: unknown }
export function projectPurchaseListItem(source: PurchaseProjectionSource): PurchaseListItemView { return Object.freeze({ purchaseRequestId: source.purchaseRequestId, requestNo: source.requestNo, purpose: source.purpose, state: source.state, totalExpectedAmount: Object.freeze({ amount: source.totalExpectedAmount.amount, currency: source.totalExpectedAmount.currency }), ...(source.selectedSupplierName !== undefined ? { selectedSupplierName: source.selectedSupplierName } : {}), receivedLineCount: source.receivedLineCount, totalLineCount: source.totalLineCount, inspectionStatus: source.inspectionStatus, nextAction: source.nextAction }); }
export function projectPurchaseDetail(source: PurchaseProjectionSource): PurchaseDetailView { return Object.freeze({ ...projectPurchaseListItem(source), lines: Object.freeze(source.lines.map((line) => Object.freeze({ lineId: line.lineId, itemCode: line.itemCode, name: line.name, specification: line.specification, quantity: line.quantity, receivedQuantity: line.receivedQuantity, unitCode: line.unitCode }))), quotationSummaries: Object.freeze(source.quotationSummaries.map((quote) => Object.freeze({ supplierName: quote.supplierName, quotedAmount: Object.freeze({ amount: quote.quotedAmount.amount, currency: quote.quotedAmount.currency }), evidenceAvailable: quote.evidenceAvailable }))), externalPaymentStatus: source.externalPaymentStatus }); }
export type PurchaseListResult = { readonly availability: "AVAILABLE"; readonly items: readonly PurchaseListItemView[] } | { readonly availability: "FORBIDDEN"; readonly items: readonly [] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type PurchaseDetailResult = { readonly availability: "AVAILABLE"; readonly detail: PurchaseDetailView } | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface PurchaseQueryPort { listMine(): Promise<PurchaseListResult>; getMine(purchaseRequestId: string): Promise<PurchaseDetailResult>; listForHeadquartersReadOnly(): Promise<PurchaseListResult> }
export interface PurchaseCommandPort { submitRequest(input: { readonly purchaseRequestId: string; readonly expectedVersion: number }): Promise<{ readonly availability: "ACCEPTED"; readonly newVersion: number } | { readonly availability: "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" } | { readonly availability: "UNAVAILABLE"; readonly reason: "COMMAND_ADAPTER_NOT_CONFIGURED" }>; recordExternalPaymentFact(input: { readonly purchaseRequestId: string; readonly expectedVersion: number; readonly externalReference: string }): Promise<{ readonly availability: "ACCEPTED"; readonly newVersion: number } | { readonly availability: "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" } | { readonly availability: "UNAVAILABLE"; readonly reason: "COMMAND_ADAPTER_NOT_CONFIGURED" }> }
export const PURCHASE_FORBIDDEN_CAPABILITIES = Object.freeze(["BANK_TRANSFER", "PAYMENT_INSTRUCTION", "ACCOUNTING_JOURNAL", "VENDOR_PURCHASE_ACCESS"] as const);
