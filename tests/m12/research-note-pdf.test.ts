import { describe, expect, it } from "vitest";
import { sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";
import { ResearchNote, VerifiedResearchNoteEntryFactory, buildResearchNotePdfManifest, type ResearchNoteActor, type ResearchNoteEntrySnapshot } from "../../packages/features/research-note/src/public.js";

const id = (last: string) => uuid(`30000000-0000-4000-8000-${last.padStart(12, "0")}`);
const h1 = sha256("1".repeat(64)), h2 = sha256("2".repeat(64)), hm = sha256("f".repeat(64));
const t = utcInstant("2026-08-22T06:00:00Z"), authorId = id("1"), directorId = id("2"), noteId = id("3"), projectId = id("4"), entryId = id("5"), sourceId = id("6"), outputId = id("7");
const author: ResearchNoteActor = { kind: "INTERNAL", active: true, userId: authorId, positionIds: [stableCode("POSITION_RESEARCHER")], permissionIds: [stableCode("research_note.record.create"), stableCode("research_note.record.submit")] };
const director: ResearchNoteActor = { kind: "INTERNAL", active: true, userId: directorId, positionIds: [stableCode("POSITION_LAB_DIRECTOR")], permissionIds: [stableCode("research_note.record.finalize")] };
const entryFactory = new VerifiedResearchNoteEntryFactory({ validateCanonicalizeAndHash: (raw) => raw as ResearchNoteEntrySnapshot });
function snapshot(finalized = true) {
  const { aggregate } = ResearchNote.create({ researchNoteId: noteId, projectId, authorUserId: authorId, actor: author, occurredAt: t });
  aggregate.submit({ actor: author, expectedVersion: version(0), route: "DIRECTOR_FINALIZATION", occurredAt: t, entry: entryFactory.create({ entryId, researchNoteId: noteId, kind: "ORIGINAL", entryVersion: version(1), projectId, rndProgramIds: [], authorUserId: authorId, researchDate: "2026-08-22", purpose: "p", work: "w", result: "r", attachments: [{ attachmentId: sourceId, rowVersion: version(4), checksum: h1, mimeType: "image/png", sizeBytes: 11, visibility: "PRIVATE" }], checksum: h2, sealedAt: t }) });
  if (finalized) aggregate.finalize({ actor: director, expectedVersion: version(1), finalizationId: id("8"), entryId, entryVersion: version(1), entryChecksum: h2, entrySealedAt: t, occurredAt: t });
  return aggregate.snapshot();
}

describe("M12 ResearchNote PDF manifest", () => {
  it("binds exact entry/file hashes and renderer identity into a canonical manifest checksum", async () => {
    let hashed: unknown;
    const result = await buildResearchNotePdfManifest({ snapshot: snapshot(), generatedAt: t, renderer: { render: async () => ({ rendererId: "generic-research-note-pdf", rendererVersion: "1.0.0", renderedPdfChecksum: hm, output: { attachmentId: outputId, rowVersion: version(1), checksum: hm, mimeType: "application/pdf", sizeBytes: 100, visibility: "PRIVATE" } }) }, hasher: { sha256Canonical: async (value) => { hashed = value; return h1; } } });
    expect(result.manifest).toMatchObject({ entryId, entryVersion: 1, entryChecksum: h2, rendererId: "generic-research-note-pdf", rendererVersion: "1.0.0", renderedPdfChecksum: hm, manifestChecksum: h1 });
    expect(result.manifest.entries).toEqual([{ entryId, entryVersion: 1, entryChecksum: h2, entrySealedAt: t, kind: "ORIGINAL" }]);
    expect(result.manifest.files).toEqual([{ entryId, attachmentId: sourceId, rowVersion: 4, checksum: h1 }]);
    expect(hashed).not.toHaveProperty("manifestChecksum");
    expect(result.output.visibility).toBe("PRIVATE");
  });

  it("rejects draft rendering and mismatched renderer output hashes", async () => {
    const hasher = { sha256Canonical: async () => h1 };
    const renderer = { render: async () => ({ rendererId: "r", rendererVersion: "1", renderedPdfChecksum: hm, output: { attachmentId: outputId, rowVersion: version(1), checksum: h2, mimeType: "application/pdf", sizeBytes: 10, visibility: "PRIVATE" as const } }) };
    await expect(buildResearchNotePdfManifest({ snapshot: snapshot(false), generatedAt: t, renderer, hasher })).rejects.toThrow(/finalized/);
    await expect(buildResearchNotePdfManifest({ snapshot: snapshot(), generatedAt: t, renderer, hasher })).rejects.toThrow(/matching its checksum/);
  });
});
