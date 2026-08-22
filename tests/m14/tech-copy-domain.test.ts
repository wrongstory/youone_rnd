import { describe, expect, it } from "vitest";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";
import { TECH_COPY_EVENT_IDS, TechnicalDocumentCopy, VerifiedControlledCopyRequestFactory, VerifiedRenderedCopyFactory, type CompletedControlledCopyApproval, type ControlledCopyRecipientScopeSnapshot, type ControlledCopyRequestSnapshot, type TechCopyActor, type TechCopyCommand, type TechCopySecurityLevel } from "../../packages/features/tech-copy/src/public.js";

const u = (n: number) => uuid(`14000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const h = (char: string) => sha256((char.charCodeAt(0) % 16).toString(16).repeat(64));
const t = (hour: number) => utcInstant(`2026-08-22T${String(hour).padStart(2, "0")}:00:00Z`);
const ids = { copy: u(1), doc: u(2), version: u(3), project: u(4), contract: u(5), source: u(6), recipient: u(7), vendor: u(8), requester: u(9), director: u(10), rep1: u(11), rep2: u(12), approval: u(13), directorParticipant: u(14), repParticipant1: u(15), repParticipant2: u(16), actionDirector: u(17), actionRep: u(18), membership: u(19), projectGrant: u(20), contractGrant: u(21), output: u(22) };

const actor = (kind: TechCopyActor["kind"], userId: typeof ids.requester | undefined, permissions: string[], serviceId?: TechCopyActor["serviceId"]): TechCopyActor => ({ kind, userId, active: true, permissionIds: permissions.map(stableCode), serviceId });
const requester = actor("INTERNAL", ids.requester, ["technical_document.copy.request"]);
const service = actor("SYSTEM", undefined, [], "INTERNAL_DOCUMENT_SERVICE");
const printer = actor("INTERNAL", u(30), ["technical_document.copy.print", "technical_document.copy.custody", "technical_document.copy.return", "technical_document.copy.destroy"]);
const followUp = actor("SYSTEM", undefined, [], "TECH_COPY_FOLLOW_UP");

function scope(action: ControlledCopyRecipientScopeSnapshot["action"], at: ReturnType<typeof t>): ControlledCopyRecipientScopeSnapshot { return { action, recipientUserId: ids.recipient, vendorId: ids.vendor, projectId: ids.project, contractId: ids.contract, vendorMembershipId: ids.membership, vendorMembershipVersion: version(2), projectGrantId: ids.projectGrant, projectGrantVersion: version(3), contractGrantId: ids.contractGrant, contractGrantVersion: version(4), evaluatedAt: at, validUntil: t(23), evidenceIds: [ids.membership, ids.projectGrant, ids.contractGrant], snapshotChecksum: h(action[0]!.toLowerCase()) }; }
function projectScope(action: ControlledCopyRecipientScopeSnapshot["action"], at: ReturnType<typeof t>): ControlledCopyRecipientScopeSnapshot { return { action, recipientUserId: ids.recipient, vendorId: ids.vendor, projectId: ids.project, vendorMembershipId: ids.membership, vendorMembershipVersion: version(2), projectGrantId: ids.projectGrant, projectGrantVersion: version(3), evaluatedAt: at, validUntil: t(23), evidenceIds: [ids.membership, ids.projectGrant], snapshotChecksum: h("e") }; }
function factory() { return new VerifiedControlledCopyRequestFactory({ canonicalizeAndHash: (raw) => ({ ...raw, requestVersion: version(1), requestChecksum: h("a"), requestSealedAt: raw.requestedAt }) }); }
function verifiedRequest(level: TechCopySecurityLevel = "L3", overrides: Partial<Parameters<ReturnType<typeof factory>["create"]>[0]> = {}) {
  return factory().create({ technicalDocumentCopyId: ids.copy, copyNo: "TC-2026-000001", document: { documentId: ids.doc, documentVersionId: ids.version, versionNo: 3, state: "APPROVED", securityLevel: level, projectId: ids.project, contractId: ids.contract, sealedSnapshotChecksum: h("d"), sealedAt: t(1), approvedAt: t(2), sourceAttachmentId: ids.source, sourceAttachmentRowVersion: version(5), sourceHash: h("s") }, recipient: { recipientUserId: ids.recipient, recipientDisplayName: "홍길동", vendorId: ids.vendor, vendorDisplayName: "한성정밀" }, initialScope: scope("REQUEST", t(3)), purpose: "시제품 조립 작업 참고", purposeCode: stableCode("PURPOSE_PROTOTYPE_ASSEMBLY"), purposeHash: h("p"), returnOrDestructionDueAt: t(20), requestedByUserId: ids.requester, requestedAt: t(3), ...overrides });
}
function command(actorValue: TechCopyActor, expected: number, hour: number): TechCopyCommand { return { actor: actorValue, expectedVersion: version(expected), occurredAt: t(hour), commandId: u(100 + expected), correlationId: correlationId(`m14-${expected}-${hour}`), idempotencyKey: idempotencyKey(`m14-${expected}-${hour}`) }; }
function approval(level: TechCopySecurityLevel, request: ControlledCopyRequestSnapshot): CompletedControlledCopyApproval {
  const steps: CompletedControlledCopyApproval["steps"] = [
    { sequence: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true, positionId: "POSITION_LAB_DIRECTOR", participants: [{ participantId: ids.directorParticipant, userId: ids.director, positionId: "POSITION_LAB_DIRECTOR", actionId: ids.actionDirector, approvedAt: t(5) }] },
    ...(level === "L4" ? [{ sequence: 2, role: "APPROVAL" as const, completionMode: "ANY_ONE" as const, required: true as const, positionId: "POSITION_REPRESENTATIVE" as const, participants: [{ participantId: ids.repParticipant1, userId: ids.rep1, positionId: "POSITION_REPRESENTATIVE" as const, actionId: ids.actionRep, approvedAt: t(6) }, { participantId: ids.repParticipant2, userId: ids.rep2, positionId: "POSITION_REPRESENTATIVE" as const }] }] : [])
  ];
  return { approvalInstanceId: ids.approval, approvalInstanceVersion: version(7), state: "COMPLETED", subjectKind: "TECHNICAL_DOCUMENT_COPY_REQUEST", technicalDocumentCopyId: request.technicalDocumentCopyId, requestVersion: request.requestVersion, requestChecksum: request.requestChecksum, requestSealedAt: request.requestSealedAt, documentVersionId: request.document.documentVersionId, documentVersionNo: request.document.versionNo, documentChecksum: request.document.sealedSnapshotChecksum, documentSealedAt: request.document.sealedAt, recipientUserId: request.recipient.recipientUserId, vendorId: request.recipient.vendorId, purposeHash: request.purposeHash, completedAt: level === "L4" ? t(6) : t(5), terminalActionId: level === "L4" ? ids.actionRep : ids.actionDirector, steps };
}
function requested(level: TechCopySecurityLevel = "L3") { const verified = verifiedRequest(level); return TechnicalDocumentCopy.request(verified, { ...command(requester, 0, 3), expectedVersion: undefined } as unknown as Omit<TechCopyCommand, "expectedVersion">); }
function approve(level: TechCopySecurityLevel = "L3") { const created = requested(level), aggregate = created.aggregate; aggregate.submit(command(requester, 1, 4)); const request = aggregate.snapshot().request; aggregate.applyCompletedApproval(command(service, 2, level === "L4" ? 6 : 5), approval(level, request)); return aggregate; }
function rendered(level: TechCopySecurityLevel = "L3") { const aggregate = approve(level), request = aggregate.snapshot().request; const evidence = { rendererId: stableCode("GENERIC_CONTROLLED_COPY_PDF"), rendererVersion: stableCode("V1.0.0"), sourceHash: request.document.sourceHash, outputHash: h("o"), outputAttachmentId: ids.output, outputAttachmentRowVersion: version(1), outputVisibility: "PRIVATE" as const, pageCount: 3, watermarkedPageCount: 3, watermark: { recipientDisplayName: request.recipient.recipientDisplayName, vendorDisplayName: request.recipient.vendorDisplayName, projectId: request.document.projectId, copyNo: request.copyNo, securityLevel: request.document.securityLevel, issuerUserId: ids.requester, issuerDisplayName: "김도윤", printedAt: t(8), purpose: request.purpose, redistributionProhibition: "무단복제·재배포 금지" }, watermarkChecksum: h("w"), manifestChecksum: h("m"), renderedAt: t(7) }; const verified = new VerifiedRenderedCopyFactory().create({ request, issuerUserId: ids.requester, printedAt: t(8) }, evidence); aggregate.render(command(service, 3, 7), verified, scope("RENDER", t(7))); return aggregate; }

describe("M14 controlled copy domain", () => {
  it("accepts L3 Director-only and exact L4 Director + two-Representative ANY_ONE approval matrices", () => {
    expect(approve("L3").snapshot().state).toBe("APPROVED");
    expect(approve("L4").snapshot().approval?.steps[1]).toMatchObject({ positionId: "POSITION_REPRESENTATIVE", completionMode: "ANY_ONE" });
  });
  it("rejects L4 without its exact Representative ANY_ONE step and mismatched approval subjects", () => {
    const created = requested("L4"), aggregate = created.aggregate; aggregate.submit(command(requester, 1, 4)); const exact = approval("L4", aggregate.snapshot().request);
    expect(() => aggregate.applyCompletedApproval(command(service, 2, 6), { ...exact, steps: exact.steps.slice(0, 1) })).toThrow(/L4 requires/);
    expect(() => aggregate.applyCompletedApproval(command(service, 2, 6), { ...exact, documentChecksum: h("x") })).toThrow(/exact request/);
  });
  it("denies rendering before approval, Vendor actions and incomplete per-page watermark evidence", () => {
    const created = requested(), aggregate = created.aggregate; aggregate.submit(command(requester, 1, 4));
    const forged = { snapshot: () => ({}) } as never;
    expect(() => aggregate.render(command(service, 2, 5), forged, scope("RENDER", t(5)))).toThrow(/State/);
    const vendor = actor("VENDOR", ids.recipient, ["technical_document.copy.print"]);
    expect(() => rendered().print(command(vendor, 4, 8), { printEventId: u(60), printedByUserId: ids.recipient, printerDeviceRef: "VENDOR-PRINTER", printedAt: t(8), pageCount: 3, evidenceIds: [u(61)] }, scope("PRINT", t(8)))).toThrow(/Vendor render, print and custody actions are prohibited/);
    const exact = approve().snapshot().request;
    expect(() => new VerifiedRenderedCopyFactory().create({ request: exact, issuerUserId: ids.requester, printedAt: t(8) }, { rendererId: stableCode("R"), rendererVersion: stableCode("V1"), sourceHash: exact.document.sourceHash, outputHash: h("o"), outputAttachmentId: ids.output, outputAttachmentRowVersion: version(1), outputVisibility: "PRIVATE", pageCount: 3, watermarkedPageCount: 2, watermark: { recipientDisplayName: "홍길동", vendorDisplayName: "한성정밀", projectId: ids.project, copyNo: exact.copyNo, securityLevel: "L3", issuerUserId: ids.requester, issuerDisplayName: "김도윤", printedAt: t(8), purpose: exact.purpose, redistributionProhibition: "금지" }, watermarkChecksum: h("w"), manifestChecksum: h("m"), renderedAt: t(7) })).toThrow(/every-page/);
  });
  it("keeps append-only custody through print, handover, due, overdue, return and destruction", () => {
    const aggregate = rendered();
    aggregate.print(command(printer, 4, 8), { printEventId: u(31), printedByUserId: printer.userId!, printerDeviceRef: "PRINTER-SECURE-01", printedAt: t(8), pageCount: 3, evidenceIds: [u(32)] }, scope("PRINT", t(8)));
    aggregate.handover(command(printer, 5, 9), { handoverEventId: u(33), handedOverByUserId: printer.userId!, acknowledgedByRecipientUserId: ids.recipient, acknowledgedAt: t(9), pageCount: 3, evidenceIds: [u(34)] }, scope("HANDOVER", t(9)));
    aggregate.markReturnDue(command(followUp, 6, 20)); aggregate.markOverdue(command(followUp, 7, 21));
    aggregate.recordReturn(command(printer, 8, 22), { eventId: u(35), completedByUserId: printer.userId!, pageCountReconciled: 3, reason: "전량 회수", evidenceIds: [u(36)], completedAt: t(22) });
    const done = aggregate.recordDestruction(command(printer, 9, 23), { eventId: u(37), completedByUserId: printer.userId!, pageCountReconciled: 3, reason: "보안 파쇄", evidenceIds: [u(38)], completedAt: t(23) });
    expect(done.snapshot.state).toBe("DESTROYED"); expect(done.snapshot.custodyEvents.map((event) => event.eventType)).toEqual([TECH_COPY_EVENT_IDS.REQUEST, TECH_COPY_EVENT_IDS.SUBMIT, TECH_COPY_EVENT_IDS.APPROVE, TECH_COPY_EVENT_IDS.RENDER, TECH_COPY_EVENT_IDS.PRINT, TECH_COPY_EVENT_IDS.HANDOVER, TECH_COPY_EVENT_IDS.RETURN_DUE, TECH_COPY_EVENT_IDS.OVERDUE, TECH_COPY_EVENT_IDS.RETURN, TECH_COPY_EVENT_IDS.DESTROY]);
    expect(done.snapshot.scopeRevalidations.map((item) => item.action)).toEqual(["REQUEST", "RENDER", "PRINT", "HANDOVER"]);
  });
  it("creates a reprint as a new root and rejects reused copy numbers or changed subjects", () => {
    const previous = rendered().snapshot();
    const nextId = u(50); const verified = verifiedRequest("L3", { technicalDocumentCopyId: nextId, copyNo: "TC-2026-000002", reprintOfCopyId: ids.copy, reprintReason: "출력 중 2페이지 훼손" });
    const mutation = TechnicalDocumentCopy.reprint(previous, verified, { ...command(requester, 0, 3), commandId: u(51) } as Omit<TechCopyCommand, "expectedVersion">);
    expect(mutation.snapshot.request).toMatchObject({ technicalDocumentCopyId: nextId, reprintOfCopyId: ids.copy, copyNo: "TC-2026-000002" });
    expect(() => TechnicalDocumentCopy.reprint(previous, verifiedRequest("L3", { technicalDocumentCopyId: nextId, reprintOfCopyId: ids.copy, reprintReason: "재출력" }), { ...command(requester, 0, 3), commandId: u(52) } as Omit<TechCopyCommand, "expectedVersion">)).toThrow(/new copy number/);
  });
  it("allows Project-only scope but requires exact Contract grant evidence for contract-bound copies", () => {
    const projectDocument = { ...verifiedRequest().snapshot().document, contractId: undefined };
    const projectOnly = verifiedRequest("L3", { document: projectDocument, initialScope: projectScope("REQUEST", t(3)) });
    expect(TechnicalDocumentCopy.request(projectOnly, { ...command(requester, 0, 3), expectedVersion: undefined } as unknown as Omit<TechCopyCommand, "expectedVersion">).snapshot.state).toBe("REQUESTED");
    expect(() => verifiedRequest("L3", { initialScope: projectScope("REQUEST", t(3)) })).toThrow(/Contract grant/);
  });
});
