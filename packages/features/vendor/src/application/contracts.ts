import type { StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import type { VendorEvaluationMutation, VendorEvaluationSnapshot, VendorMutation, VendorProfileSnapshot, VendorState } from "../domain/vendor.js";

/** Vendor-visible list shape. Finance, payment and internal evaluation fields are deliberately absent. */
export interface VendorListSafeItem {
  readonly vendorId: string;
  readonly vendorCode: string;
  readonly legalName: string;
  readonly state: VendorState;
}

export interface VendorInternalDetail extends VendorListSafeItem {
  readonly businessRegistrationNumber: string;
  readonly representativeName: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly evaluations: readonly VendorEvaluationSnapshot[];
  readonly version: number;
}

export type VendorListSafeResult = { readonly availability: "AVAILABLE"; readonly items: readonly VendorListSafeItem[] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type VendorInternalDetailResult = { readonly availability: "AVAILABLE"; readonly detail: VendorInternalDetail } | { readonly availability: "NOT_FOUND" | "FORBIDDEN"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface VendorQueryPort { listSafe(): Promise<VendorListSafeResult>; getInternalDetail(vendorId: string): Promise<VendorInternalDetailResult> }

export interface VendorRepository {
  insert(snapshot: VendorProfileSnapshot): Promise<void>;
  save(snapshot: VendorProfileSnapshot, expectedVersion: Version): Promise<boolean>;
  appendEvaluation(snapshot: VendorEvaluationSnapshot, expectedVendorVersion: Version): Promise<boolean>;
}
export interface VendorEvidencePort {
  appendTransition(input: { readonly vendorId: Uuid; readonly fromVersion: Version; readonly toVersion: Version; readonly eventType: StableCode; readonly occurredAt: UtcInstant }): Promise<void>;
  appendAudit(audit: VendorMutation["audit"]): Promise<void>;
  enqueue(event: VendorMutation["event"]): Promise<void>;
}
export interface VendorTransactionContext { readonly vendors: VendorRepository; readonly evidence: VendorEvidencePort }
export interface VendorUnitOfWork { transact<T>(work: (context: VendorTransactionContext) => Promise<T>): Promise<T> }

export class VendorConcurrencyError extends Error { public readonly code = "VENDOR_STALE_VERSION" as StableCode; }

async function appendEvidence(context: VendorTransactionContext, mutation: VendorMutation): Promise<void> {
  await context.evidence.appendTransition({ vendorId: mutation.snapshot.vendorId, fromVersion: mutation.expectedVersion, toVersion: mutation.snapshot.version, eventType: mutation.event.eventType, occurredAt: mutation.event.occurredAt });
  await context.evidence.appendAudit(mutation.audit);
  await context.evidence.enqueue(mutation.event);
}

export async function persistVendorCreation(unitOfWork: VendorUnitOfWork, mutation: VendorMutation): Promise<void> {
  if (mutation.expectedVersion !== 0 || mutation.snapshot.version !== 1 || mutation.event.eventType !== "EVT-VENDOR-CREATE") throw new VendorConcurrencyError("Vendor creation must be version 0 to 1.");
  await unitOfWork.transact(async (context) => { await context.vendors.insert(mutation.snapshot); await appendEvidence(context, mutation); });
}

export async function persistVendorMutation(unitOfWork: VendorUnitOfWork, mutation: VendorMutation): Promise<void> {
  if (mutation.expectedVersion === 0) throw new VendorConcurrencyError("Create mutations require persistVendorCreation.");
  await unitOfWork.transact(async (context) => {
    if (!await context.vendors.save(mutation.snapshot, mutation.expectedVersion)) throw new VendorConcurrencyError("Concurrent Vendor mutation lost optimistic lock.");
    await appendEvidence(context, mutation);
  });
}

export async function persistVendorEvaluation(unitOfWork: VendorUnitOfWork, mutation: VendorEvaluationMutation): Promise<void> {
  await unitOfWork.transact(async (context) => {
    if (!await context.vendors.appendEvaluation(mutation.snapshot, mutation.expectedVendorVersion)) throw new VendorConcurrencyError("Vendor changed before evaluation could be appended.");
    await context.evidence.appendAudit(mutation.audit);
    await context.evidence.enqueue(mutation.event);
  });
}
