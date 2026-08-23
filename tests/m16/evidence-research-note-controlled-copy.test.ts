import { describe, expect, it, vi } from "vitest";
import { AuthorizationService, TrustedActorContextFactory, TrustedResourceContextFactory } from "../../packages/core/authorization/src/public.js";
import { Attachment, TrustedDeliveryAuthorization, type AttachmentSnapshot } from "../../packages/core/file/src/public.js";
import {
  ResearchNote,
  VerifiedResearchNoteEntryFactory,
  type ResearchNoteActor,
  type ResearchNoteEntrySnapshot
} from "../../packages/features/research-note/src/public.js";
import { SupabasePrivateStorageAdapter } from "../../packages/infrastructure/supabase-storage/src/public.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const ids = {
  note: uuid("16300000-0000-4000-8000-000000000001"),
  project: uuid("16300000-0000-4000-8000-000000000002"),
  author: uuid("16300000-0000-4000-8000-000000000003"),
  director: uuid("16300000-0000-4000-8000-000000000004"),
  entry1: uuid("16300000-0000-4000-8000-000000000005"),
  entry2: uuid("16300000-0000-4000-8000-000000000006"),
  finalization: uuid("16300000-0000-4000-8000-000000000007"),
  attachment: uuid("16300000-0000-4000-8000-000000000008"),
  evidence: uuid("16300000-0000-4000-8000-000000000009"),
  documentVersion: uuid("16300000-0000-4000-8000-000000000010")
};
const t1 = utcInstant("2026-08-23T01:00:00Z");
const t2 = utcInstant("2026-08-23T02:00:00Z");
const t3 = utcInstant("2026-08-23T03:00:00Z");
const t4 = utcInstant("2026-08-23T04:00:00Z");
const entryFactory = new VerifiedResearchNoteEntryFactory({ validateCanonicalizeAndHash: (raw) => raw as ResearchNoteEntrySnapshot });

function researchActor(kind: ResearchNoteActor["kind"], userId: typeof ids.author, positions: string[], permissions: string[]): ResearchNoteActor {
  return { kind, userId, active: true, positionIds: positions.map(stableCode), permissionIds: permissions.map(stableCode) };
}
const author = researchActor("INTERNAL", ids.author, ["POSITION_RESEARCHER"], ["research_note.record.create", "research_note.record.submit", "research_note.record.correct"]);
const director = researchActor("INTERNAL", ids.director as typeof ids.author, ["POSITION_LAB_DIRECTOR"], ["research_note.record.finalize"]);

function noteEntry(input: { id?: typeof ids.entry1; versionNo?: number; kind?: "ORIGINAL" | "CORRECTION"; previousEntryId?: typeof ids.entry1; correctsEntryId?: typeof ids.entry1; reason?: string } = {}) {
  const versionNo = input.versionNo ?? 1;
  return entryFactory.create({
    entryId: input.id ?? ids.entry1,
    researchNoteId: ids.note,
    kind: input.kind ?? "ORIGINAL",
    entryVersion: version(versionNo),
    previousEntryId: input.previousEntryId,
    correctsEntryId: input.correctsEntryId,
    correctionReason: input.reason,
    projectId: ids.project,
    rndProgramIds: [],
    authorUserId: ids.author,
    researchDate: "2026-08-23",
    purpose: "복원 스냅샷 불변성 검증",
    work: versionNo === 1 ? "원본 연구 내용" : "정정 연구 내용",
    result: "검증 완료",
    attachments: [{ attachmentId: ids.attachment, rowVersion: version(3), checksum: sha256("c".repeat(64)), mimeType: "application/pdf", sizeBytes: 128, visibility: "PRIVATE" }],
    checksum: sha256((versionNo === 1 ? "a" : "b").repeat(64)),
    sealedAt: versionNo === 1 ? t2 : t4
  });
}

function finalizedNote() {
  const { aggregate } = ResearchNote.create({ researchNoteId: ids.note, projectId: ids.project, authorUserId: ids.author, actor: author, occurredAt: t1 });
  aggregate.submit({ actor: author, expectedVersion: version(0), entry: noteEntry(), route: "DIRECTOR_FINALIZATION", occurredAt: t2 });
  aggregate.finalize({ actor: director, expectedVersion: version(1), finalizationId: ids.finalization, entryId: ids.entry1, entryVersion: version(1), entryChecksum: sha256("a".repeat(64)), entrySealedAt: t2, occurredAt: t3 });
  return aggregate;
}

function availableAttachment(securityLevel: "L2" | "L3"): AttachmentSnapshot {
  const hash = sha256("d".repeat(64));
  const aggregate = Attachment.createIntent({ attachmentId: ids.attachment, storageProvider: "SUPABASE_STORAGE", storageKey: "private/m16/evidence.pdf", bucket: "documents-private", declaredMimeType: "application/pdf", declaredSizeBytes: 128, expectedSha256: hash, securityLevel, createdBy: ids.author, createdAt: t1, intentExpiresAt: t4 });
  const fileCommand = (expectedVersion: number) => ({ actorUserId: ids.author, actorKind: "SYSTEM" as const, at: t2, expectedVersion: version(expectedVersion), eventId: uuid(`16400000-0000-4000-8000-${String(expectedVersion + 1).padStart(12, "0")}`), correlationId: correlationId("m16:file"), idempotencyKey: idempotencyKey(`m16:file:${expectedVersion}`) });
  aggregate.uploadVerified(fileCommand(0), { intentOwnerUserId: ids.author, mimeType: "application/pdf", sizeBytes: 128, sha256: hash, headEvidenceId: ids.evidence });
  aggregate.beginScan(fileCommand(1));
  aggregate.scanCompleted(fileCommand(2), { clean: true, detectedMimeType: "application/pdf", scanEvidenceId: ids.evidence, scannerVersion: stableCode("SCANNER.V1") });
  return aggregate.snapshot();
}

async function deliveryAuthorization(file: AttachmentSnapshot, adminSystem = false) {
  const action = stableCode("technical_document.content.download");
  const permission = { assignmentId: uuid("16500000-0000-4000-8000-000000000001"), stableCode: action, validFrom: utcInstant("2026-01-01T00:00:00Z"), evidenceId: ids.evidence };
  const adminRole = { ...permission, assignmentId: uuid("16500000-0000-4000-8000-000000000002"), stableCode: stableCode("ADMIN_SYSTEM") };
  const actor = await new TrustedActorContextFactory(
    { verify: async () => ({ authSubject: "m16-user", sessionId: "m16-session", assuranceLevel: "AAL2" as const, expiresAt: utcInstant("2026-08-24T00:00:00Z") }) },
    { load: async () => ({ identity: { userId: ids.author, authSubject: "m16-user", accountKind: "INTERNAL" as const, accountStatus: "ACTIVE" as const, accountValidFrom: utcInstant("2026-01-01T00:00:00Z"), accountVersion: version(1), organizations: [], departments: [], positions: [], roles: adminSystem ? [adminRole] : [], permissions: [permission], vendorMemberships: [], actingAuthorities: [], evidenceIds: [ids.evidence] }, scopeGrants: [{ grantId: uuid("16500000-0000-4000-8000-000000000003"), scopeKind: "DOCUMENT_VERSION" as const, targetId: ids.documentVersion, actionSetId: stableCode("DOCUMENT_SOURCE_READ"), actionSetVersion: version(1), actions: [action], validFrom: utcInstant("2026-01-01T00:00:00Z"), evidenceId: ids.evidence }], securityEntitlements: [] }) },
    { now: () => t1 }
  ).create("trusted-session-token", correlationId("m16:delivery"));
  const resource = await new TrustedResourceContextFactory({ load: async () => ({ resourceType: stableCode("ATTACHMENT_SOURCE"), resourceId: file.attachmentId, documentVersionId: ids.documentVersion, ownerUserId: ids.author, securityLevel: file.securityLevel === "L3" ? "SEC_L3_CONFIDENTIAL" as const : "SEC_L2_INTERNAL" as const, workflowAllows: true, securityAllows: true, explicitDeny: false }) }).load({ resourceType: stableCode("ATTACHMENT_SOURCE"), resourceId: file.attachmentId }, t1);
  if (!resource) throw new Error("resource missing");
  return TrustedDeliveryAuthorization.evaluate(new AuthorizationService(), actor, resource, file, uuid("16500000-0000-4000-8000-000000000004"));
}

describe("M16 research-note/file evidence regression", () => {
  it("clones and deep-freezes restored ResearchNote evidence snapshots", () => {
    const external = structuredClone(finalizedNote().snapshot());
    const restored = ResearchNote.restore(external);
    (external.entries[0] as { work: string }).work = "외부에서 변조한 내용";
    expect(restored.snapshot().entries[0]?.work).toBe("원본 연구 내용");
    expect(Object.isFrozen(restored.snapshot().entries[0])).toBe(true);
    expect(Object.isFrozen(restored.snapshot().entries[0]?.attachments)).toBe(true);
  });

  it("rejects forged correction lineage and any Vendor research-note creation", () => {
    const aggregate = finalizedNote();
    aggregate.addCorrection({ actor: author, expectedVersion: version(2), entry: noteEntry({ id: ids.entry2, versionNo: 2, kind: "CORRECTION", previousEntryId: ids.entry1, correctsEntryId: ids.entry1, reason: "오탈자 정정" }), occurredAt: t4 });
    const forged = structuredClone(aggregate.snapshot());
    (forged.entries[1] as { correctsEntryId: string }).correctsEntryId = uuid("16300000-0000-4000-8000-000000000099");
    expect(() => ResearchNote.restore(forged)).toThrow(/linked to its exact finalized entry/);

    const vendor = researchActor("VENDOR", ids.author, [], ["research_note.record.create"]);
    expect(() => ResearchNote.create({ researchNoteId: ids.note, projectId: ids.project, authorUserId: ids.author, actor: vendor, occurredAt: t1 })).toThrow(/active internal user/);
  });

  it("keeps source files private, denies Admin-System L3 source access, and never asks Supabase for a public/signed URL", async () => {
    const signedDownload = vi.fn(async () => "https://forbidden.example/signed");
    const broker = vi.fn(async () => ({ redemptionEndpoint: "/api/v1/files/redeem", oneTimeBrokerToken: "opaque-once" }));
    const adapter = new SupabasePrivateStorageAdapter(
      { createSignedUploadToken: async () => "opaque-upload", createSignedDownloadUrl: signedDownload, head: async () => ({ mimeType: "application/pdf", sizeBytes: 128, sha256: sha256("d".repeat(64)) }) },
      ["documents-private"],
      () => t1,
      { audited: async (_input, operation) => operation() },
      { issue: broker }
    );

    const l2 = availableAttachment("L2");
    const delivery = await adapter.createAuthorizedDelivery({ attachment: l2, authorization: await deliveryAuthorization(l2), requestedTtlSeconds: 30 });
    expect(delivery).toMatchObject({ redemptionEndpoint: "/api/v1/files/redeem", oneTimeBrokerToken: "opaque-once" });
    expect(JSON.stringify(delivery)).not.toMatch(/publicUrl|signedUrl|https?:\/\//i);
    expect(signedDownload).not.toHaveBeenCalled();

    const l3 = availableAttachment("L3");
    const denied = await deliveryAuthorization(l3, true);
    expect(denied.decision).toMatchObject({ allowed: false, reasonCode: "AUTHZ_SYSTEM_ADMIN_SOURCE_DENIED" });
    await expect(adapter.createAuthorizedDelivery({ attachment: l3, authorization: denied, requestedTtlSeconds: 30 })).rejects.toThrow("AUTHZ_SYSTEM_ADMIN_SOURCE_DENIED");
    expect(broker).toHaveBeenCalledTimes(1);
    expect(signedDownload).not.toHaveBeenCalled();
  });
});
