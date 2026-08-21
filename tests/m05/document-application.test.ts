import { describe, expect, it } from "vitest";
import { DocumentSealService, DocumentVersion, StrictEditorContentCanonicalizer, VerifiedEditorContentFactory, type DocumentSealRepository } from "../../packages/core/document/src/public.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const at = utcInstant("2026-08-22T02:00:00Z");
const author = uuid("41000000-0000-4000-8000-000000000001");
const contentHash = sha256("1".repeat(64));
async function draft() {
  const verifiedContent = await new VerifiedEditorContentFactory({ validateCanonicalizeAndHash: async () => ({ content: { schemaId: stableCode("EDITOR.DOC.V1"), schemaVersion: 1, data: { type: "doc" } }, checksum: contentHash, validationEvidenceId: uuid("44000000-0000-4000-8000-000000000001") }) }).create({ type: "doc" });
  return DocumentVersion.draft({ documentVersionId: uuid("42000000-0000-4000-8000-000000000001"), documentId: uuid("43000000-0000-4000-8000-000000000001"), versionNo: 1, securityLevel: "L2", templateSource: "FREE_FORM", authorUserId: author, creationReason: stableCode("DOCUMENT.CREATE"), verifiedContent }).snapshot();
}
const command = { actor: { userId: author, actorKind: "INTERNAL" as const, at }, expectedVersion: version(0), eventId: uuid("45000000-0000-4000-8000-000000000001"), correlationId: correlationId("m05:seal"), idempotencyKey: idempotencyKey("m05:seal") };

describe("document seal transaction", () => {
  it("rejects unknown schemas/raw HTML and delegates hashing to PostgreSQL canonical JSON", async () => { const hashed: unknown[] = []; const canonicalizer = new StrictEditorContentCanonicalizer({ validateAndCanonicalize: async (id,_v,data) => id === "EDITOR.DOC.V1" ? data as never : null }, { hashCanonicalJson: async (value) => { hashed.push(value); return contentHash; } }, () => uuid("48000000-0000-4000-8000-000000000001")); await expect(canonicalizer.validateCanonicalizeAndHash({ schemaId: "UNKNOWN", schemaVersion: 1, data: {} })).rejects.toThrow(/UNKNOWN_OR_INVALID/); await expect(canonicalizer.validateCanonicalizeAndHash({ schemaId: "EDITOR.DOC.V1", schemaVersion: 1, data: { rawHtml: "<script>x</script>" } })).rejects.toThrow(/UNSAFE/); await expect(canonicalizer.validateCanonicalizeAndHash({schemaId:"EDITOR.DOC.V1",schemaVersion:1,data:{b:2,a:1}})).resolves.toMatchObject({checksum:contentHash}); expect(hashed).toEqual([{b:2,a:1}]); });
  it("rolls back version/evidence when outbox fails", async () => {
    let persisted = await draft(); let evidence = 0; const before = structuredClone(persisted);
    const repo: DocumentSealRepository = { loadExact: async () => persisted, loadForUpdate: async () => persisted, listAvailableAttachmentsForUpdate: async () => [{ attachmentId: uuid("46000000-0000-4000-8000-000000000001"), sha256: sha256("2".repeat(64)), mimeType: "application/pdf", sizeBytes: 4, securityLevel: "L2" }], save: async (next) => { persisted = next; return true; }, appendEvidence: async () => { evidence++; }, enqueue: async () => { throw new Error("OUTBOX_FAIL"); } };
    const uow = { transact: async <T>(work: (r: DocumentSealRepository) => Promise<T>) => { const saved = structuredClone(persisted); const count = evidence; try { return await work(repo); } catch (error) { persisted = saved; evidence = count; throw error; } } };
    const service = new DocumentSealService(uow, { build: async (input) => ({ ...input, checksum: sha256("3".repeat(64)), evidenceId: uuid("47000000-0000-4000-8000-000000000001") }) });
    await expect(service.seal({ documentVersionId: persisted.documentVersionId, command, rendererId: stableCode("RENDERER.PDF"), rendererVersion: stableCode("V1") })).rejects.toThrow("OUTBOX_FAIL");
    expect(persisted).toEqual(before); expect(evidence).toBe(0);
  });
});
