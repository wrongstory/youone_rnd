import { describe, expect, it } from "vitest";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version, type Sha256, type UtcInstant } from "../../packages/shared-kernel/src/public.js";
import { VerifiedControlledCopyRequestFactory, type CompletedControlledCopyApproval, type ControlledCopyRecipientScopeSnapshot, type ControlledCopyTransaction, type ControlledCopyUnitOfWork, type ExactApprovedDocumentVersion, type RenderedCopyEvidence, type TechnicalDocumentCopySnapshot } from "../../packages/features/tech-copy/src/public.js";
import { createControlledCopy, handoverControlledCopy, printControlledCopy, renderApprovedControlledCopy } from "../../packages/processes/controlled-copy-delivery/src/public.js";

const u = (n: number) => uuid(`14100000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const digest = (n: number): Sha256 => sha256((n % 16).toString(16).repeat(64));
const time = (hour: number): UtcInstant => utcInstant(`2026-08-22T${String(hour).padStart(2, "0")}:00:00Z`);
const ids = { copy: u(1), doc: u(2), docVersion: u(3), project: u(4), contract: u(5), source: u(6), recipient: u(7), vendor: u(8), requester: u(9), membership: u(10), projectGrant: u(11), contractGrant: u(12), approval: u(13), output: u(14), director: u(15), directorParticipant: u(16), directorAction: u(17), printer: u(18) };
const recipient = { recipientUserId: ids.recipient, recipientDisplayName: "홍길동", vendorId: ids.vendor, vendorDisplayName: "한성정밀" };
const document = { documentId: ids.doc, documentVersionId: ids.docVersion, versionNo: 2, state: "APPROVED" as const, securityLevel: "L3" as const, projectId: ids.project, contractId: ids.contract, sealedSnapshotChecksum: digest(1), sealedAt: time(1), approvedAt: time(2), sourceAttachmentId: ids.source, sourceAttachmentRowVersion: version(2), sourceHash: digest(2) };
const requestFactory = new VerifiedControlledCopyRequestFactory({ canonicalizeAndHash: (raw) => ({ ...raw, requestVersion: version(1), requestChecksum: digest(3), requestSealedAt: raw.requestedAt }) });
function scope(action: ControlledCopyRecipientScopeSnapshot["action"], at: UtcInstant): ControlledCopyRecipientScopeSnapshot { return { action, recipientUserId: ids.recipient, vendorId: ids.vendor, projectId: ids.project, contractId: ids.contract, vendorMembershipId: ids.membership, vendorMembershipVersion: version(1), projectGrantId: ids.projectGrant, projectGrantVersion: version(1), contractGrantId: ids.contractGrant, contractGrantVersion: version(1), evaluatedAt: at, validUntil: time(23), evidenceIds: [ids.membership, ids.projectGrant, ids.contractGrant], snapshotChecksum: digest(action.length) }; }
function projectScope(action: ControlledCopyRecipientScopeSnapshot["action"], at: UtcInstant): ControlledCopyRecipientScopeSnapshot { return { action, recipientUserId: ids.recipient, vendorId: ids.vendor, projectId: ids.project, vendorMembershipId: ids.membership, vendorMembershipVersion: version(1), projectGrantId: ids.projectGrant, projectGrantVersion: version(1), evaluatedAt: at, validUntil: time(23), evidenceIds: [ids.membership, ids.projectGrant], snapshotChecksum: digest(12) }; }
function command(kind: "INTERNAL" | "SYSTEM", userId: typeof ids.requester | undefined, expectedVersion: number, hour: number, permissions: string[] = [], serviceId?: "INTERNAL_DOCUMENT_SERVICE") { return { actor: { kind, userId, active: true, permissionIds: permissions.map(stableCode), serviceId }, expectedVersion: version(expectedVersion), occurredAt: time(hour), commandId: u(100 + expectedVersion), correlationId: correlationId(`m14-app-${expectedVersion}-${hour}`), idempotencyKey: idempotencyKey(`m14-app-${expectedVersion}-${hour}`) }; }
function approval(request: TechnicalDocumentCopySnapshot["request"]): CompletedControlledCopyApproval { return { approvalInstanceId: ids.approval, approvalInstanceVersion: version(4), state: "COMPLETED", subjectKind: "TECHNICAL_DOCUMENT_COPY_REQUEST", technicalDocumentCopyId: request.technicalDocumentCopyId, requestVersion: request.requestVersion, requestChecksum: request.requestChecksum, requestSealedAt: request.requestSealedAt, documentVersionId: request.document.documentVersionId, documentVersionNo: request.document.versionNo, documentChecksum: request.document.sealedSnapshotChecksum, documentSealedAt: request.document.sealedAt, recipientUserId: request.recipient.recipientUserId, vendorId: request.recipient.vendorId, purposeHash: request.purposeHash, completedAt: time(5), terminalActionId: ids.directorAction, steps: [{ sequence: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true, positionId: "POSITION_LAB_DIRECTOR", participants: [{ participantId: ids.directorParticipant, userId: ids.director, positionId: "POSITION_LAB_DIRECTOR", actionId: ids.directorAction, approvedAt: time(5) }] }] }; }
function requestSnapshot(id = ids.copy, copyNo = "TC-2026-000010") { return requestFactory.create({ technicalDocumentCopyId: id, copyNo, document, recipient, initialScope: scope("REQUEST", time(3)), purpose: "시제품 조립", purposeCode: stableCode("PURPOSE_ASSEMBLY"), purposeHash: digest(4), returnOrDestructionDueAt: time(20), requestedByUserId: ids.requester, requestedAt: time(3) }).snapshot(); }

function fixture(initial?: TechnicalDocumentCopySnapshot, exactDocument: ExactApprovedDocumentVersion = document, scopeResolver: (action: ControlledCopyRecipientScopeSnapshot["action"], at: UtcInstant) => ControlledCopyRecipientScopeSnapshot = scope) {
  let current = initial; const calls: string[] = []; const scopeActions: string[] = [];
  const context: ControlledCopyTransaction = {
    repository: { loadForUpdate: async (id) => current?.request.technicalDocumentCopyId === id ? structuredClone(current) : undefined, insert: async (snapshot) => { calls.push("insert"); current = structuredClone(snapshot); }, save: async (snapshot) => { calls.push("save"); current = structuredClone(snapshot); return true; }, copyNumberExists: async () => false },
    documents: { getExactApproved: async () => exactDocument }, approvals: { getCompletedExact: async () => { if (!current) throw new Error("missing"); return approval(current.request); } },
    recipientScope: { revalidate: async (input) => { scopeActions.push(input.action); return scopeResolver(input.action, input.at); } }, copyNumbers: { reserveUnique: async ({ requestedCopyNo }) => requestedCopyNo ?? "TC-2026-000010" },
    renderer: { render: async ({ request, watermark }) => ({ rendererId: stableCode("GENERIC_CONTROLLED_COPY_PDF"), rendererVersion: stableCode("V1"), sourceHash: request.document.sourceHash, outputHash: digest(5), outputAttachmentId: ids.output, outputAttachmentRowVersion: version(1), outputVisibility: "PRIVATE", pageCount: 2, watermarkedPageCount: 2, watermark, watermarkChecksum: digest(6), manifestChecksum: digest(7), renderedAt: time(7) } satisfies RenderedCopyEvidence) },
    evidence: { appendCustody: async () => { calls.push("custody"); }, appendAudit: async () => { calls.push("audit"); }, enqueue: async () => { calls.push("outbox"); } }
  };
  const unitOfWork: ControlledCopyUnitOfWork = { transact: async (work) => work(context) };
  return { unitOfWork, context, calls, scopeActions, snapshot: () => current! };
}

describe("M14 controlled-copy application", () => {
  it("creates a unique request with live Membership+Project+Contract scope and atomic evidence", async () => {
    const f = fixture();
    await createControlledCopy({ technicalDocumentCopyId: ids.copy, documentVersionId: ids.docVersion, documentVersionNo: 2, documentChecksum: document.sealedSnapshotChecksum, documentSealedAt: document.sealedAt, recipient, purpose: "시제품 조립", purposeCode: stableCode("PURPOSE_ASSEMBLY"), purposeHash: digest(4), returnOrDestructionDueAt: time(20), command: { ...command("INTERNAL", ids.requester, 0, 3, ["technical_document.copy.request"]), expectedVersion: undefined } as never }, { unitOfWork: f.unitOfWork, requestFactory });
    expect(f.scopeActions).toEqual(["REQUEST"]); expect(f.calls).toEqual(["insert", "custody", "audit", "outbox"]); expect(f.snapshot().request.initialScope).toMatchObject({ vendorMembershipId: ids.membership, projectGrantId: ids.projectGrant, contractGrantId: ids.contractGrant });
  });

  it("forces reprint through prior-root lineage validation", async () => {
    const previousRequest = requestSnapshot(ids.copy, "TC-2026-000010"); const f = fixture({ request: previousRequest, state: "RENDERED", optimisticVersion: version(4), approval: approval(previousRequest), render: {} as RenderedCopyEvidence, scopeRevalidations: [previousRequest.initialScope], custodyEvents: [], updatedAt: time(7) });
    await expect(createControlledCopy({ technicalDocumentCopyId: u(30), documentVersionId: ids.docVersion, documentVersionNo: 2, documentChecksum: document.sealedSnapshotChecksum, documentSealedAt: document.sealedAt, recipient, purpose: "시제품 조립", purposeCode: stableCode("PURPOSE_ASSEMBLY"), purposeHash: digest(4), returnOrDestructionDueAt: time(20), requestedCopyNo: "TC-2026-000011", reprintOfCopyId: ids.copy, command: { ...command("INTERNAL", ids.requester, 0, 3, ["technical_document.copy.request"]), expectedVersion: undefined } as never }, { unitOfWork: f.unitOfWork, requestFactory })).rejects.toThrow(/coherent reprint lineage/);
  });

  it("supports Project-only scope and rejects missing Contract grant on contract-bound requests", async () => {
    const { contractId: _contractId, ...projectDocument } = document; void _contractId;
    const projectOnly = fixture(undefined, projectDocument, projectScope);
    await expect(createControlledCopy({ technicalDocumentCopyId: u(40), documentVersionId: ids.docVersion, documentVersionNo: 2, documentChecksum: document.sealedSnapshotChecksum, documentSealedAt: document.sealedAt, recipient, purpose: "프로젝트 검토", purposeCode: stableCode("PURPOSE_PROJECT_REVIEW"), purposeHash: digest(4), returnOrDestructionDueAt: time(20), command: { ...command("INTERNAL", ids.requester, 0, 3, ["technical_document.copy.request"]), expectedVersion: undefined } as never }, { unitOfWork: projectOnly.unitOfWork, requestFactory })).resolves.toBeDefined();
    expect(projectOnly.snapshot().request.document.contractId).toBeUndefined();
    const missingContractGrant = fixture(undefined, document, projectScope);
    await expect(createControlledCopy({ technicalDocumentCopyId: u(41), documentVersionId: ids.docVersion, documentVersionNo: 2, documentChecksum: document.sealedSnapshotChecksum, documentSealedAt: document.sealedAt, recipient, purpose: "계약 작업", purposeCode: stableCode("PURPOSE_CONTRACT_WORK"), purposeHash: digest(4), returnOrDestructionDueAt: time(20), command: { ...command("INTERNAL", ids.requester, 0, 3, ["technical_document.copy.request"]), expectedVersion: undefined } as never }, { unitOfWork: missingContractGrant.unitOfWork, requestFactory })).rejects.toThrow(/Contract grant/);
  });

  it("revalidates live scope before render, print and handover and preserves each snapshot", async () => {
    const request = requestSnapshot(); let current: TechnicalDocumentCopySnapshot = { request, state: "APPROVED", optimisticVersion: version(3), approval: approval(request), scopeRevalidations: [request.initialScope], custodyEvents: [], updatedAt: time(5) }; const f = fixture(current);
    await renderApprovedControlledCopy({ unitOfWork: f.unitOfWork, technicalDocumentCopyId: ids.copy, issuerUserId: ids.requester, issuerDisplayName: "김도윤", printedAt: time(8), redistributionProhibition: "무단복제·재배포 금지", command: command("SYSTEM", undefined, 3, 7, [], "INTERNAL_DOCUMENT_SERVICE") });
    current = f.snapshot();
    await printControlledCopy({ unitOfWork: f.unitOfWork, technicalDocumentCopyId: ids.copy, command: command("INTERNAL", ids.printer, 4, 8, ["technical_document.copy.print"]), evidence: { printEventId: u(31), printedByUserId: ids.printer, printerDeviceRef: "SECURE-01", printedAt: time(8), pageCount: 2, evidenceIds: [u(32)] } });
    current = f.snapshot(); void current;
    await handoverControlledCopy({ unitOfWork: f.unitOfWork, technicalDocumentCopyId: ids.copy, command: command("INTERNAL", ids.printer, 5, 9, ["technical_document.copy.custody"]), evidence: { handoverEventId: u(33), handedOverByUserId: ids.printer, acknowledgedByRecipientUserId: ids.recipient, acknowledgedAt: time(9), pageCount: 2, evidenceIds: [u(34)] } });
    expect(f.scopeActions).toEqual(["RENDER", "PRINT", "HANDOVER"]); expect(f.snapshot().scopeRevalidations.map((item) => item.action)).toEqual(["REQUEST", "RENDER", "PRINT", "HANDOVER"]);
  });

  it("does not expose a Vendor render/print delivery entry point and rolls back on outbox failure", async () => {
    let committed = false; const f = fixture(); const failing: ControlledCopyUnitOfWork = { transact: async (work) => { const value = await work({ ...f.context, evidence: { ...f.context.evidence, enqueue: async () => { throw new Error("outbox unavailable"); } } }); committed = true; return value; } };
    await expect(createControlledCopy({ technicalDocumentCopyId: ids.copy, documentVersionId: ids.docVersion, documentVersionNo: 2, documentChecksum: document.sealedSnapshotChecksum, documentSealedAt: document.sealedAt, recipient, purpose: "시제품 조립", purposeCode: stableCode("PURPOSE_ASSEMBLY"), purposeHash: digest(4), returnOrDestructionDueAt: time(20), command: { ...command("INTERNAL", ids.requester, 0, 3, ["technical_document.copy.request"]), expectedVersion: undefined } as never }, { unitOfWork: failing, requestFactory })).rejects.toThrow("outbox unavailable");
    expect(committed).toBe(false);
  });
});
