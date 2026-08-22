import { describe, expect, it } from "vitest";
import { sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";
import { RESEARCH_NOTE_EVENT_IDS, ResearchNote, VerifiedResearchNoteEntry, VerifiedResearchNoteEntryFactory, type ResearchNoteActor, type ResearchNoteEntryKind, type ResearchNoteEntrySnapshot } from "../../packages/features/research-note/src/public.js";

const ids = {
  note: uuid("10000000-0000-4000-8000-000000000001"), project: uuid("10000000-0000-4000-8000-000000000002"), rnd: uuid("10000000-0000-4000-8000-000000000003"), author: uuid("10000000-0000-4000-8000-000000000004"), senior: uuid("10000000-0000-4000-8000-000000000005"), director: uuid("10000000-0000-4000-8000-000000000006"), representative: uuid("10000000-0000-4000-8000-000000000007"), entry1: uuid("10000000-0000-4000-8000-000000000008"), entry2: uuid("10000000-0000-4000-8000-000000000009"), review: uuid("10000000-0000-4000-8000-000000000010"), finalization: uuid("10000000-0000-4000-8000-000000000011"), attachment: uuid("10000000-0000-4000-8000-000000000012")
};
const t1 = utcInstant("2026-08-22T01:00:00Z"), t2 = utcInstant("2026-08-22T02:00:00Z"), t3 = utcInstant("2026-08-22T03:00:00Z"), t4 = utcInstant("2026-08-22T04:00:00Z");
const h1 = sha256("1".repeat(64)), h2 = sha256("2".repeat(64)), fh = sha256("a".repeat(64));
const entryFactory = new VerifiedResearchNoteEntryFactory({ validateCanonicalizeAndHash: (raw) => raw as ResearchNoteEntrySnapshot });

function actor(userId: typeof ids.author, positions: string[], permissions: string[]): ResearchNoteActor {
  return { kind: "INTERNAL", userId, active: true, positionIds: positions.map(stableCode), permissionIds: permissions.map(stableCode) };
}
const author = actor(ids.author, ["POSITION_RESEARCHER"], ["research_note.record.create", "research_note.record.submit", "research_note.record.correct"]);
const senior = actor(ids.senior as typeof ids.author, ["POSITION_SENIOR_RESEARCHER"], ["research_note.record.review"]);
const director = actor(ids.director as typeof ids.author, ["POSITION_LAB_DIRECTOR"], ["research_note.record.finalize", "research_note.record.correct"]);

function entry(input: { id?: typeof ids.entry1; entryVersion?: number; checksum?: typeof h1; previousEntryId?: typeof ids.entry1; kind?: ResearchNoteEntryKind; correctionReason?: string; correctsEntryId?: typeof ids.entry1 } = {}) {
  return entryFactory.create({
    entryId: input.id ?? ids.entry1, researchNoteId: ids.note, kind: input.kind ?? "ORIGINAL", entryVersion: version(input.entryVersion ?? 1), previousEntryId: input.previousEntryId, correctsEntryId: input.correctsEntryId, correctionReason: input.correctionReason, projectId: ids.project, rndProgramIds: [ids.rnd], authorUserId: ids.author, researchDate: "2026-08-22", purpose: "목적", work: "수행 내용", result: "결과", attachments: [{ attachmentId: ids.attachment, rowVersion: version(3), checksum: fh, mimeType: "application/pdf", sizeBytes: 100, visibility: "PRIVATE" }], checksum: input.checksum ?? h1, sealedAt: input.entryVersion === 2 ? t3 : t2
  });
}
function create() { return ResearchNote.create({ researchNoteId: ids.note, projectId: ids.project, rndProgramIds: [ids.rnd], authorUserId: ids.author, actor: author, occurredAt: t1 }); }

describe("M12 ResearchNote domain", () => {
  it("allows the author to bypass optional Senior review and binds Director finalization to the exact entry", () => {
    const { aggregate } = create();
    const submitted = aggregate.submit({ actor: author, expectedVersion: version(0), entry: entry(), route: "DIRECTOR_FINALIZATION", occurredAt: t2 });
    expect(submitted.transition.eventId).toBe(RESEARCH_NOTE_EVENT_IDS.SUBMIT_DIRECTOR);
    expect(submitted.snapshot.state).toBe("DIRECTOR_FINALIZATION_PENDING");
    const finalized = aggregate.finalize({ actor: director, expectedVersion: version(1), finalizationId: ids.finalization, entryId: ids.entry1, entryVersion: version(1), entryChecksum: h1, entrySealedAt: t2, occurredAt: t3 });
    expect(finalized.snapshot.state).toBe("FINALIZED");
    expect(finalized.finalization?.finalizedByPositionId).toBe("POSITION_LAB_DIRECTOR");
    expect(() => aggregate.finalize({ actor: director, expectedVersion: version(2), finalizationId: ids.finalization, entryId: ids.entry1, entryVersion: version(1), entryChecksum: h2, entrySealedAt: t2, occurredAt: t4 })).toThrow();
  });

  it("records Senior review as non-official evidence and permits a newer direct resubmission", () => {
    const { aggregate } = create();
    aggregate.submit({ actor: author, expectedVersion: version(0), entry: entry(), route: "SENIOR_REVIEW", assignedSeniorReviewerUserId: ids.senior, occurredAt: t2 });
    const requested = aggregate.review({ actor: senior, expectedVersion: version(1), reviewId: ids.review, outcome: "REVISION_REQUIRED", reason: "보완", occurredAt: t3 });
    expect(requested.appendedReview).toMatchObject({ officialApproval: false, reviewerPositionId: "POSITION_SENIOR_RESEARCHER" });
    const resubmitted = aggregate.resubmit({ actor: author, expectedVersion: version(2), entry: entry({ id: ids.entry2, entryVersion: 2, checksum: h2, previousEntryId: ids.entry1 }), route: "DIRECTOR_FINALIZATION", occurredAt: t4 });
    expect(resubmitted.snapshot.state).toBe("DIRECTOR_FINALIZATION_PENDING");
    expect(resubmitted.appendedEntry?.entryVersion).toBe(2);
    expect(resubmitted.snapshot.assignedSeniorReviewerUserId).toBeUndefined();
  });

  it("denies Representative and Senior finalization even when they carry the permission", () => {
    const { aggregate } = create();
    aggregate.submit({ actor: author, expectedVersion: version(0), entry: entry(), route: "DIRECTOR_FINALIZATION", occurredAt: t2 });
    const rep = actor(ids.representative as typeof ids.author, ["POSITION_REPRESENTATIVE"], ["research_note.record.finalize"]);
    const elevatedSenior = actor(ids.senior as typeof ids.author, ["POSITION_SENIOR_RESEARCHER"], ["research_note.record.finalize"]);
    const command = { expectedVersion: version(1), finalizationId: ids.finalization, entryId: ids.entry1, entryVersion: version(1), entryChecksum: h1, entrySealedAt: t2, occurredAt: t3 };
    expect(() => aggregate.finalize({ ...command, actor: rep })).toThrow(/POSITION_LAB_DIRECTOR/);
    expect(() => aggregate.finalize({ ...command, actor: elevatedSenior })).toThrow(/POSITION_LAB_DIRECTOR/);
  });

  it("preserves the finalized original and appends a direct linked correction", () => {
    const { aggregate } = create();
    aggregate.submit({ actor: author, expectedVersion: version(0), entry: entry(), route: "DIRECTOR_FINALIZATION", occurredAt: t2 });
    aggregate.finalize({ actor: director, expectedVersion: version(1), finalizationId: ids.finalization, entryId: ids.entry1, entryVersion: version(1), entryChecksum: h1, entrySealedAt: t2, occurredAt: t3 });
    const before = aggregate.snapshot().entries[0];
    const mutation = aggregate.addCorrection({ actor: author, expectedVersion: version(2), entry: entry({ id: ids.entry2, entryVersion: 2, checksum: h2, previousEntryId: ids.entry1, correctsEntryId: ids.entry1, kind: "CORRECTION", correctionReason: "오탈자 정정" }), occurredAt: t4 });
    expect(mutation.snapshot.state).toBe("CORRECTED_BY_ADDENDUM");
    expect(mutation.snapshot.entries[0]).toEqual(before);
    expect(mutation.appendedEntry).toMatchObject({ previousEntryId: ids.entry1, correctsEntryId: ids.entry1, kind: "CORRECTION" });
  });

  it("rejects public attachments, stale versions and forged structural entries", () => {
    expect(() => entryFactory.create({ ...entry().snapshot(), attachments: [{ ...entry().snapshot().attachments[0]!, visibility: "PUBLIC" as "PRIVATE" }] })).toThrow(/private exact tuple/);
    const { aggregate } = create();
    expect(() => aggregate.submit({ actor: author, expectedVersion: version(9), entry: entry(), route: "DIRECTOR_FINALIZATION", occurredAt: t2 })).toThrow(/Optimistic/);
    const forged = { snapshot: () => entry().snapshot() } as VerifiedResearchNoteEntry;
    expect(() => aggregate.submit({ actor: author, expectedVersion: version(0), entry: forged, route: "DIRECTOR_FINALIZATION", occurredAt: t2 })).toThrow(/trusted canonicalizer/);
  });
});
