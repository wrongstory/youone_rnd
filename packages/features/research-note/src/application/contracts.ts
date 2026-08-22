import type { CorrelationId, IdempotencyKey, Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import type { PrivateAttachmentRef, ResearchNoteMutation, ResearchNoteSnapshot, ResearchNoteTransition } from "../domain/research-note.js";

export interface ResearchNoteRepository {
  loadForUpdate(researchNoteId: Uuid): Promise<ResearchNoteSnapshot | undefined>;
  save(snapshot: ResearchNoteSnapshot, expectedVersion: Version): Promise<void>;
  appendEntry(entry: ResearchNoteSnapshot["entries"][number]): Promise<void>;
  appendReview(review: ResearchNoteSnapshot["reviews"][number]): Promise<void>;
  appendFinalization(finalization: NonNullable<ResearchNoteSnapshot["finalization"]>): Promise<void>;
}
export interface ResearchNoteReferencePort {
  assertProject(projectId: Uuid): Promise<void>;
  assertRndPrograms(rndProgramIds: readonly Uuid[]): Promise<void>;
  assertPrivateExactAttachments(attachments: readonly PrivateAttachmentRef[]): Promise<void>;
}
export interface ResearchNoteEvidencePort {
  appendAudit(input: { eventId: StableCode; researchNoteId: Uuid; actorUserId: Uuid; occurredAt: UtcInstant; correlationId: CorrelationId }): Promise<void>;
  appendTransition(transition: ResearchNoteTransition): Promise<void>;
  appendOutbox(input: { eventId: StableCode; researchNoteId: Uuid; rowVersion: Version; correlationId: CorrelationId; idempotencyKey: IdempotencyKey }): Promise<void>;
}
export interface ResearchNoteUnitOfWork {
  run<T>(operation: (ports: { repository: ResearchNoteRepository; references: ResearchNoteReferencePort; evidence: ResearchNoteEvidencePort }) => Promise<T>): Promise<T>;
}
export interface ResearchNoteCommandContext {
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
}

export async function persistResearchNoteMutation(input: {
  readonly unitOfWork: ResearchNoteUnitOfWork;
  readonly mutation: ResearchNoteMutation;
  readonly expectedVersion: Version;
  readonly context: ResearchNoteCommandContext;
}): Promise<void> {
  await input.unitOfWork.run(async ({ repository, references, evidence }) => {
    const snapshot = input.mutation.snapshot;
    await references.assertProject(snapshot.projectId);
    await references.assertRndPrograms(snapshot.rndProgramIds);
    if (input.mutation.appendedEntry) {
      await references.assertPrivateExactAttachments(input.mutation.appendedEntry.attachments);
      await repository.appendEntry(input.mutation.appendedEntry);
    }
    if (input.mutation.appendedReview) await repository.appendReview(input.mutation.appendedReview);
    if (input.mutation.finalization) await repository.appendFinalization(input.mutation.finalization);
    await repository.save(snapshot, input.expectedVersion);
    await evidence.appendTransition(input.mutation.transition);
    await evidence.appendAudit({ eventId: input.mutation.transition.eventId as StableCode, researchNoteId: snapshot.researchNoteId, actorUserId: input.mutation.transition.actorUserId, occurredAt: input.mutation.transition.occurredAt, correlationId: input.context.correlationId });
    await evidence.appendOutbox({ eventId: input.mutation.transition.eventId as StableCode, researchNoteId: snapshot.researchNoteId, rowVersion: snapshot.rowVersion, correlationId: input.context.correlationId, idempotencyKey: input.context.idempotencyKey });
  });
}

/** Explicit allowlist. Content, file location, internal reviews and actor deliberation are absent. */
export interface ResearchNoteListProjection {
  readonly researchNoteId: Uuid;
  readonly projectId: Uuid;
  readonly state: ResearchNoteSnapshot["state"];
  readonly latestEntryVersion?: Version;
  readonly latestEntryChecksum?: Sha256;
  readonly researchDate?: string;
  readonly updatedAt: UtcInstant;
}
export function projectResearchNoteList(snapshot: ResearchNoteSnapshot): ResearchNoteListProjection {
  const latest = snapshot.entries.at(-1);
  return Object.freeze({ researchNoteId: snapshot.researchNoteId, projectId: snapshot.projectId, state: snapshot.state, latestEntryVersion: latest?.entryVersion, latestEntryChecksum: latest?.checksum, researchDate: latest?.researchDate, updatedAt: snapshot.updatedAt });
}
