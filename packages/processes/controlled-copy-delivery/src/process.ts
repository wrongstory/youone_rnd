import { TECH_COPY_PERMISSION_IDS, TechnicalDocumentCopy, VerifiedRenderedCopyFactory } from "@youone/feature-tech-copy/public";
import type { ControlledCopyRequestSnapshot, ControlledCopyUnitOfWork, ExactCopyRecipient, HandoverEvidence, PerPageWatermark, PrintEvidence, TechCopyCommand, TechCopyMutation, VerifiedControlledCopyRequestFactory } from "@youone/feature-tech-copy/public";
import type { Sha256, StableCode, UtcInstant, Uuid } from "@youone/shared-kernel/public";

export interface CreateControlledCopyInput {
  readonly technicalDocumentCopyId: Uuid;
  readonly documentVersionId: Uuid;
  readonly documentVersionNo: number;
  readonly documentChecksum: Sha256;
  readonly documentSealedAt: UtcInstant;
  readonly recipient: ExactCopyRecipient;
  readonly purpose: string;
  readonly purposeCode: StableCode;
  readonly purposeHash: Sha256;
  readonly returnOrDestructionDueAt: UtcInstant;
  readonly requestedCopyNo?: string;
  readonly reprintOfCopyId?: Uuid;
  readonly reprintReason?: string;
  readonly command: Omit<TechCopyCommand, "expectedVersion">;
}

export async function createControlledCopy(input: CreateControlledCopyInput, dependencies: { readonly unitOfWork: ControlledCopyUnitOfWork; readonly requestFactory: VerifiedControlledCopyRequestFactory }): Promise<ControlledCopyRequestSnapshot> {
  return dependencies.unitOfWork.transact(async (context) => {
    if (input.command.actor.kind !== "INTERNAL" || !input.command.actor.active || !input.command.actor.userId || !input.command.actor.permissionIds.includes(TECH_COPY_PERMISSION_IDS.REQUEST as StableCode)) throw named("TECH_COPY_INTERNAL_REQUESTER_REQUIRED", "A trusted internal requester with copy.request is required.");
    const document = await context.documents.getExactApproved({ documentVersionId: input.documentVersionId, versionNo: input.documentVersionNo, checksum: input.documentChecksum, sealedAt: input.documentSealedAt });
    if (document.documentVersionId !== input.documentVersionId || document.versionNo !== input.documentVersionNo || document.sealedSnapshotChecksum !== input.documentChecksum || document.sealedAt !== input.documentSealedAt) throw named("TECH_COPY_DOCUMENT_PORT_MISMATCH", "Document port must return the exact requested approved version.");
    const copyNo = await context.copyNumbers.reserveUnique({ technicalDocumentCopyId: input.technicalDocumentCopyId, requestedCopyNo: input.requestedCopyNo });
    if (await context.repository.copyNumberExists(copyNo)) throw named("TECH_COPY_NUMBER_CONFLICT", "Copy number must be globally unique.");
    const initialScope = await context.recipientScope.revalidate({ action: "REQUEST", recipient: input.recipient, projectId: document.projectId, ...(document.contractId ? { contractId: document.contractId } : {}), purposeHash: input.purposeHash, at: input.command.occurredAt });
    const verified = dependencies.requestFactory.create({ technicalDocumentCopyId: input.technicalDocumentCopyId, copyNo, document, recipient: input.recipient, initialScope, purpose: input.purpose, purposeCode: input.purposeCode, purposeHash: input.purposeHash, returnOrDestructionDueAt: input.returnOrDestructionDueAt, requestedByUserId: input.command.actor.userId, requestedAt: input.command.occurredAt, ...(input.reprintOfCopyId ? { reprintOfCopyId: input.reprintOfCopyId } : {}), ...(input.reprintReason ? { reprintReason: input.reprintReason } : {}) });
    const mutation = input.reprintOfCopyId
      ? TechnicalDocumentCopy.reprint(await required(context.repository.loadForUpdate(input.reprintOfCopyId)), verified, input.command)
      : TechnicalDocumentCopy.request(verified, input.command);
    await persist(context, mutation, true);
    return mutation.snapshot.request;
  });
}

export async function applyControlledCopyApproval(input: { readonly unitOfWork: ControlledCopyUnitOfWork; readonly technicalDocumentCopyId: Uuid; readonly approvalInstanceId: Uuid; readonly command: TechCopyCommand }): Promise<void> {
  await input.unitOfWork.transact(async (context) => {
    if (input.command.actor.kind !== "SYSTEM" || input.command.actor.serviceId !== "INTERNAL_DOCUMENT_SERVICE") throw named("TECH_COPY_TRUSTED_SERVICE_REQUIRED", "Only the internal document service may apply approval outcomes.");
    const snapshot = await required(context.repository.loadForUpdate(input.technicalDocumentCopyId));
    const approval = await context.approvals.getCompletedExact(input.approvalInstanceId);
    const aggregate = TechnicalDocumentCopy.restore(snapshot);
    const mutation = aggregate.applyCompletedApproval(input.command, approval);
    await persist(context, mutation, false);
  });
}

export async function renderApprovedControlledCopy(input: { readonly unitOfWork: ControlledCopyUnitOfWork; readonly technicalDocumentCopyId: Uuid; readonly issuerUserId: Uuid; readonly issuerDisplayName: string; readonly printedAt: UtcInstant; readonly redistributionProhibition: string; readonly command: TechCopyCommand }): Promise<void> {
  await input.unitOfWork.transact(async (context) => {
    if (input.command.actor.kind !== "SYSTEM" || input.command.actor.serviceId !== "INTERNAL_DOCUMENT_SERVICE") throw named("TECH_COPY_TRUSTED_SERVICE_REQUIRED", "Only the internal document service may render controlled copies.");
    const snapshot = await required(context.repository.loadForUpdate(input.technicalDocumentCopyId));
    if (!snapshot.approval) throw named("TECH_COPY_APPROVAL_REQUIRED", "Completed approval is required before rendering.");
    const request = snapshot.request;
    const scope = await context.recipientScope.revalidate({ action: "RENDER", recipient: request.recipient, projectId: request.document.projectId, ...(request.document.contractId ? { contractId: request.document.contractId } : {}), purposeHash: request.purposeHash, at: input.command.occurredAt });
    const watermark: PerPageWatermark = Object.freeze({ recipientDisplayName: request.recipient.recipientDisplayName, vendorDisplayName: request.recipient.vendorDisplayName, projectId: request.document.projectId, copyNo: request.copyNo, securityLevel: request.document.securityLevel, issuerUserId: input.issuerUserId, issuerDisplayName: input.issuerDisplayName, printedAt: input.printedAt, purpose: request.purpose, redistributionProhibition: input.redistributionProhibition });
    const rendered = await context.renderer.render({ request, watermark, approval: snapshot.approval });
    const verified = new VerifiedRenderedCopyFactory().create({ request, issuerUserId: input.issuerUserId, printedAt: input.printedAt }, rendered);
    const aggregate = TechnicalDocumentCopy.restore(snapshot);
    const mutation = aggregate.render(input.command, verified, scope);
    await persist(context, mutation, false);
  });
}

export async function printControlledCopy(input: { readonly unitOfWork: ControlledCopyUnitOfWork; readonly technicalDocumentCopyId: Uuid; readonly evidence: PrintEvidence; readonly command: TechCopyCommand }): Promise<void> {
  await input.unitOfWork.transact(async (context) => {
    if (input.command.actor.kind !== "INTERNAL" || !input.command.actor.active || !input.command.actor.userId || !input.command.actor.permissionIds.includes(TECH_COPY_PERMISSION_IDS.PRINT as StableCode)) throw named("TECH_COPY_INTERNAL_PERMISSION_REQUIRED", "Only an authorized internal print operator may print.");
    const snapshot = await required(context.repository.loadForUpdate(input.technicalDocumentCopyId)); const request = snapshot.request;
    const scope = await context.recipientScope.revalidate({ action: "PRINT", recipient: request.recipient, projectId: request.document.projectId, ...(request.document.contractId ? { contractId: request.document.contractId } : {}), purposeHash: request.purposeHash, at: input.command.occurredAt });
    const mutation = TechnicalDocumentCopy.restore(snapshot).print(input.command, input.evidence, scope); await persist(context, mutation, false);
  });
}

export async function handoverControlledCopy(input: { readonly unitOfWork: ControlledCopyUnitOfWork; readonly technicalDocumentCopyId: Uuid; readonly evidence: HandoverEvidence; readonly command: TechCopyCommand }): Promise<void> {
  await input.unitOfWork.transact(async (context) => {
    if (input.command.actor.kind !== "INTERNAL" || !input.command.actor.active || !input.command.actor.userId || !input.command.actor.permissionIds.includes(TECH_COPY_PERMISSION_IDS.CUSTODY as StableCode)) throw named("TECH_COPY_INTERNAL_PERMISSION_REQUIRED", "Only an authorized internal custodian may hand over.");
    const snapshot = await required(context.repository.loadForUpdate(input.technicalDocumentCopyId)); const request = snapshot.request;
    const scope = await context.recipientScope.revalidate({ action: "HANDOVER", recipient: request.recipient, projectId: request.document.projectId, ...(request.document.contractId ? { contractId: request.document.contractId } : {}), purposeHash: request.purposeHash, at: input.command.occurredAt });
    const mutation = TechnicalDocumentCopy.restore(snapshot).handover(input.command, input.evidence, scope); await persist(context, mutation, false);
  });
}

export async function persistControlledCopyMutation(unitOfWork: ControlledCopyUnitOfWork, mutation: TechCopyMutation): Promise<void> { await unitOfWork.transact(async (context) => persist(context, mutation, false)); }

async function persist(context: Parameters<Parameters<ControlledCopyUnitOfWork["transact"]>[0]>[0], mutation: TechCopyMutation, insert: boolean): Promise<void> {
  if (insert) await context.repository.insert(mutation.snapshot);
  else if (!await context.repository.save(mutation.snapshot, mutation.expectedVersion)) throw named("TECH_COPY_VERSION_CONFLICT", "Optimistic write lost.");
  await context.evidence.appendCustody(mutation.custodyEvent);
  await context.evidence.appendAudit({ actionId: mutation.auditActionId, technicalDocumentCopyId: mutation.snapshot.request.technicalDocumentCopyId, actorUserId: mutation.custodyEvent.actorUserId, occurredAt: mutation.custodyEvent.occurredAt, correlationId: mutation.correlationId });
  await context.evidence.enqueue({ eventId: mutation.auditActionId, technicalDocumentCopyId: mutation.snapshot.request.technicalDocumentCopyId, version: mutation.snapshot.optimisticVersion, correlationId: mutation.correlationId, idempotencyKey: mutation.idempotencyKey });
}
async function required<T>(promise: Promise<T | undefined>): Promise<T> { const value = await promise; if (!value) throw named("TECH_COPY_NOT_FOUND", "Controlled copy was not found."); return value; }
function named(code: string, message: string): Error { const error = new Error(message); error.name = code; return error; }
