import { describe, expect, it } from "vitest";
import { PURCHASE_TRANSITION_MAP, PurchaseRequest, createSupplierVendorLink, type PurchaseActorSnapshot, type PurchaseCommand, type PurchaseSnapshot, type VerifiedPurchaseApprovalSnapshot } from "../../packages/features/purchase/src/domain/purchase.js";
import { correlationId, idempotencyKey, money, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const u = (n: number) => uuid(`91000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const at = (minute: number) => utcInstant(`2026-08-22T01:${String(minute).padStart(2, "0")}:00Z`);
const requester = u(1); const requestId = u(2); const lineId = u(3); const requestVersionId = u(4); const supplierId = u(5);
let seq = 0;
const actor = (kind: PurchaseActorSnapshot["actorKind"], userId: typeof requester, ...permissions: string[]): PurchaseActorSnapshot => ({ actorKind: kind, userId, active: true, authorities: permissions.map(stableCode) });
function command(commandActor: PurchaseActorSnapshot, expectedVersion: number, minute = ++seq): PurchaseCommand { return { actor: commandActor, expectedVersion: version(expectedVersion), at: at(minute), eventId: u(100 + seq), correlationId: correlationId(`purchase-domain-${seq}`), idempotencyKey: idempotencyKey(`purchase-domain-${seq}`) }; }
function createCommand(commandActor: PurchaseActorSnapshot) { const { expectedVersion: _, ...rest } = command(commandActor, 0); void _; return rest; }
function create() {
  return PurchaseRequest.create({ purchaseRequestId: requestId, requestNo: "PR-001", requesterUserId: requester, purpose: "시험재료 구매",
    lines: [{ purchaseRequestLineId: lineId, itemId: u(6), specification: "SUS304", quantity: "10", unitCode: stableCode("EA"), expectedUnitPrice: money("1000", "KRW"), expectedAmount: money("10000", "KRW") }],
    quotations: [{ quotationId: u(7), supplierId, quotedAmount: money("10000", "KRW"), attachmentId: u(8), attachmentChecksum: sha256("1".repeat(64)), quotedAt: at(0) }],
    projectIds: [u(9)], rndProgramIds: [u(10)], totalExpectedAmount: money("10000", "KRW") }, createCommand(actor("INTERNAL", requester, "purchase.request.create")));
}
function pending(): PurchaseSnapshot { const aggregate = PurchaseRequest.restore(create().snapshot); aggregate.draftRequest(command(actor("INTERNAL", requester), 1)); return aggregate.submit(command(actor("INTERNAL", requester), 2), { purchaseRequestVersionId: requestVersionId, revisionNo: 1, checksum: sha256("2".repeat(64)) }).snapshot; }
function approval(snapshot: PurchaseSnapshot): VerifiedPurchaseApprovalSnapshot { return { approvalInstanceId: u(11), approvalVersion: version(3), approvalPolicyVersionId: u(12), approvalPolicyChecksum: sha256("3".repeat(64)), approvalStepId: u(13), approvalParticipantId: u(14), purchaseRequestVersionId: snapshot.sealedRequestVersionId!, subjectVersion: version(1), subjectChecksum: snapshot.sealedRequestChecksum!, subjectSealedAt: snapshot.sealedRequestAt!, completedAt: at(5), officialApproverUserId: u(15), officialApproverPositionId: stableCode("POSITION_LAB_DIRECTOR") }; }
function paid(): PurchaseRequest { const p = pending(); const aggregate = PurchaseRequest.restore(p); aggregate.recordVerifiedApproval(command(actor("SYSTEM", u(15), "purchase.request.approve"), 3, 5), approval(p)); aggregate.createResolution(command(actor("INTERNAL", requester, "purchase.resolution.manage"), 4, 6), { purchaseResolutionId: u(16), selectedSupplierId: supplierId, finalAmount: money("10000", "KRW"), decisionReason: "최저가·납기 적합" }); aggregate.resolve(command(actor("INTERNAL", requester, "purchase.resolution.manage"), 5, 7)); aggregate.awaitExternalPayment(command(actor("SYSTEM", requester, "purchase.payment.record"), 6, 8)); aggregate.confirmExternalPayment(command(actor("INTERNAL", requester, "purchase.payment.record"), 7, 9), { externalPaymentFactId: u(17), externalSystemCode: stableCode("BANK_STATEMENT"), externalReference: "BANK-1", amount: money("10000", "KRW") }); return aggregate; }

describe("SM-PURCHASE-V1 domain", () => {
  it("publishes only constrained canonical transitions and denies user/HQ approval mutation", () => {
    expect(PURCHASE_TRANSITION_MAP["EVT-PURCHASE-APPROVED"]).toEqual({ from: ["APPROVAL_PENDING"], to: "REQUEST_APPROVED" });
    const snapshot = pending();
    expect(() => PurchaseRequest.restore(snapshot).recordVerifiedApproval(command(actor("INTERNAL", u(15), "purchase.request.approve"), 3), approval(snapshot))).toThrowError(expect.objectContaining({ code: "PURCHASE_TRUSTED_APPROVAL_SYSTEM_REQUIRED" }));
    expect(() => PurchaseRequest.restore(snapshot).recordVerifiedApproval(command(actor("HEADQUARTERS", u(15), "purchase.request.approve"), 3), approval(snapshot))).toThrowError(expect.objectContaining({ code: "PURCHASE_TRUSTED_APPROVAL_SYSTEM_REQUIRED" }));
  });

  it("keeps Supplier and Vendor identities separate behind reviewed evidence", () => {
    expect(() => createSupplierVendorLink({ supplierVendorLinkId: u(20), supplierId, vendorId: supplierId, reviewedByUserId: requester, evidenceIds: [u(21)], reviewedAt: at(1) })).toThrowError(expect.objectContaining({ code: "SUPPLIER_VENDOR_ID_COLLAPSE_FORBIDDEN" }));
    expect(createSupplierVendorLink({ supplierVendorLinkId: u(20), supplierId, vendorId: u(22), reviewedByUserId: requester, evidenceIds: [u(21)], reviewedAt: at(1) })).toMatchObject({ supplierId, vendorId: u(22) });
  });

  it("records partial and quarantined excess receipt without adding excess to accepted totals", () => {
    const aggregate = paid();
    const partial = aggregate.receive(command(actor("INTERNAL", requester, "purchase.receipt.record"), 8, 10), { receiptId: u(30), receivedOn: "2026-08-22", lines: [{ receiptLineId: u(31), purchaseRequestLineId: lineId, receivedQuantity: "4" }], evidenceIds: [u(32)], overages: [] });
    expect(partial.snapshot).toMatchObject({ state: "PARTIALLY_RECEIVED", receivedQuantities: { [lineId]: "4" } });
    expect(() => aggregate.receive(command(actor("INTERNAL", requester, "purchase.receipt.record"), 9, 11), { receiptId: u(33), receivedOn: "2026-08-22", lines: [{ receiptLineId: u(34), purchaseRequestLineId: lineId, receivedQuantity: "8" }], evidenceIds: [u(35)], overages: [] })).toThrowError(expect.objectContaining({ code: "PURCHASE_OVERAGE_DISCREPANCY_REQUIRED" }));
    const complete = aggregate.receive(command(actor("INTERNAL", requester, "purchase.receipt.record"), 9, 11), { receiptId: u(33), receivedOn: "2026-08-22", lines: [{ receiptLineId: u(34), purchaseRequestLineId: lineId, receivedQuantity: "8" }], evidenceIds: [u(35)], overages: [{ receiptOverageDiscrepancyId: u(36), purchaseRequestLineId: lineId, observedQuantity: "8", acceptedQuantity: "6", excessQuantity: "2", reason: "공급사 과납", evidenceIds: [u(37)] }] });
    expect(complete.snapshot).toMatchObject({ state: "RECEIVED", receivedQuantities: { [lineId]: "10" } });
    expect(complete.immutableReceiptOverages?.[0]).toMatchObject({ excessQuantity: "2", quarantined: true, resolutionStatus: "PENDING" });
  });

  it("requires exact receipt-linked typed PurchaseInspection and immutable photo evidence", () => {
    const aggregate = paid(); aggregate.receive(command(actor("INTERNAL", requester, "purchase.receipt.record"), 8, 10), { receiptId: u(40), receivedOn: "2026-08-22", lines: [{ receiptLineId: u(41), purchaseRequestLineId: lineId, receivedQuantity: "10" }], evidenceIds: [u(42)], overages: [] });
    expect(() => aggregate.requestInspection(command(actor("INTERNAL", requester, "purchase.inspection.record"), 9, 11), { purchaseInspectionId: u(43), receiptId: u(99), inspectionId: u(44) })).toThrowError(expect.objectContaining({ code: "PURCHASE_INSPECTION_RECEIPT_MISMATCH" }));
    aggregate.requestInspection(command(actor("INTERNAL", requester, "purchase.inspection.record"), 9, 11), { purchaseInspectionId: u(43), receiptId: u(40), inspectionId: u(44) });
    const result = aggregate.recordInspection(command(actor("INTERNAL", u(45), "purchase.inspection.record"), 10, 12), { purchaseInspectionOutcomeId: u(46), inspectionAttemptId: u(47), verdict: "PASS", quantityResult: "10/10", specificationResult: "적합", appearanceResult: "적합", performanceResult: "적합", photoAttachmentIds: [u(48)], evidenceIds: [u(49)] });
    expect(result.snapshot.state).toBe("COMPLETED"); expect(result.immutableInspectionOutcome).toMatchObject({ purchaseInspectionId: u(43), inspectionAttemptId: u(47) });
  });
});
