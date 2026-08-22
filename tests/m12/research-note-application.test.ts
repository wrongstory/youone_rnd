import { describe, expect, it } from "vitest";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";
import { ResearchNote, VerifiedResearchNoteEntryFactory, persistResearchNoteMutation, projectResearchNoteList, type ResearchNoteActor, type ResearchNoteEntrySnapshot, type ResearchNoteUnitOfWork } from "../../packages/features/research-note/src/public.js";

const noteId = uuid("20000000-0000-4000-8000-000000000001"), projectId = uuid("20000000-0000-4000-8000-000000000002"), authorId = uuid("20000000-0000-4000-8000-000000000003"), entryId = uuid("20000000-0000-4000-8000-000000000004"), fileId = uuid("20000000-0000-4000-8000-000000000005");
const at = utcInstant("2026-08-22T05:00:00Z"), checksum = sha256("a".repeat(64));
const actor: ResearchNoteActor = { kind: "INTERNAL", userId: authorId, active: true, positionIds: [stableCode("POSITION_RESEARCHER")], permissionIds: [stableCode("research_note.record.create"), stableCode("research_note.record.submit")] };
const entryFactory = new VerifiedResearchNoteEntryFactory({ validateCanonicalizeAndHash: (raw) => raw as ResearchNoteEntrySnapshot });
function submitted() {
  const { aggregate } = ResearchNote.create({ researchNoteId: noteId, projectId, authorUserId: authorId, actor, occurredAt: at });
  return aggregate.submit({ actor, expectedVersion: version(0), route: "DIRECTOR_FINALIZATION", occurredAt: at, entry: entryFactory.create({ entryId, researchNoteId: noteId, kind: "ORIGINAL", entryVersion: version(1), projectId, rndProgramIds: [], authorUserId: authorId, researchDate: "2026-08-22", purpose: "p", work: "w", result: "r", attachments: [{ attachmentId: fileId, rowVersion: version(2), checksum, mimeType: "application/pdf", sizeBytes: 9, visibility: "PRIVATE" }], checksum, sealedAt: at }) });
}

describe("M12 ResearchNote application contracts", () => {
  it("persists root, immutable evidence, transition, audit and outbox inside one UoW", async () => {
    const calls: string[] = [];
    const unitOfWork: ResearchNoteUnitOfWork = { run: async (operation) => operation({ repository: { loadForUpdate: async () => undefined, save: async () => { calls.push("save"); }, appendEntry: async () => { calls.push("entry"); }, appendReview: async () => { calls.push("review"); }, appendFinalization: async () => { calls.push("finalization"); } }, references: { assertProject: async () => { calls.push("project"); }, assertRndPrograms: async () => { calls.push("rnd"); }, assertPrivateExactAttachments: async () => { calls.push("attachments"); } }, evidence: { appendAudit: async () => { calls.push("audit"); }, appendTransition: async () => { calls.push("transition"); }, appendOutbox: async () => { calls.push("outbox"); } } }) };
    await persistResearchNoteMutation({ unitOfWork, mutation: submitted(), expectedVersion: version(0), context: { correlationId: correlationId("m12-correlation"), idempotencyKey: idempotencyKey("m12-submit") } });
    expect(calls).toEqual(["project", "rnd", "attachments", "entry", "save", "transition", "audit", "outbox"]);
  });

  it("does not commit when evidence persistence fails", async () => {
    let committed = false;
    const unitOfWork: ResearchNoteUnitOfWork = { run: async (operation) => { const staged: string[] = []; try { const result = await operation({ repository: { loadForUpdate: async () => undefined, save: async () => { staged.push("save"); }, appendEntry: async () => { staged.push("entry"); }, appendReview: async () => {}, appendFinalization: async () => {} }, references: { assertProject: async () => {}, assertRndPrograms: async () => {}, assertPrivateExactAttachments: async () => {} }, evidence: { appendAudit: async () => { throw new Error("audit unavailable"); }, appendTransition: async () => {}, appendOutbox: async () => {} } }); committed = true; return result; } catch (error) { expect(staged).toEqual(["entry", "save"]); throw error; } } };
    await expect(persistResearchNoteMutation({ unitOfWork, mutation: submitted(), expectedVersion: version(0), context: { correlationId: correlationId("m12-rollback"), idempotencyKey: idempotencyKey("m12-rollback") } })).rejects.toThrow("audit unavailable");
    expect(committed).toBe(false);
  });

  it("returns an allowlisted list projection without content, files, reviews or actor positions", () => {
    const projection = projectResearchNoteList(submitted().snapshot);
    expect(Object.keys(projection).sort()).toEqual(["latestEntryChecksum", "latestEntryVersion", "projectId", "researchDate", "researchNoteId", "state", "updatedAt"].sort());
    expect(JSON.stringify(projection)).not.toContain("application/pdf");
  });
});
