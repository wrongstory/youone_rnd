import type { Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";

export const RESEARCH_NOTE_MACHINE_ID = "SM-RESEARCH-NOTE-V1" as StableCode;
export const RESEARCH_NOTE_EVENT_IDS = {
  CREATE: "EVT-NOTE-CREATE",
  SUBMIT_SENIOR: "EVT-NOTE-SUBMIT-SENIOR",
  SUBMIT_DIRECTOR: "EVT-NOTE-SUBMIT-DIRECTOR",
  REQUEST_REVISION: "EVT-NOTE-REQUEST-REVISION",
  RESUBMIT: "EVT-NOTE-RESUBMIT",
  REVIEWED: "EVT-NOTE-REVIEWED",
  FINALIZE: "EVT-NOTE-FINALIZE",
  ADD_CORRECTION: "EVT-NOTE-ADD-CORRECTION"
} as const;

export const RESEARCH_NOTE_PERMISSION_IDS = {
  CREATE: "research_note.record.create",
  SUBMIT: "research_note.record.submit",
  REVIEW: "research_note.record.review",
  FINALIZE: "research_note.record.finalize",
  CORRECT: "research_note.record.correct",
  READ: "research_note.record.read"
} as const;

export type ResearchNoteState =
  | "DRAFT"
  | "SENIOR_REVIEW_PENDING"
  | "REVISION_REQUIRED"
  | "DIRECTOR_FINALIZATION_PENDING"
  | "FINALIZED"
  | "CORRECTED_BY_ADDENDUM"
  | "VOIDED_BY_POLICY";
export type ResearchNoteEntryKind = "ORIGINAL" | "CORRECTION" | "ADDENDUM";

export interface ResearchNoteActor {
  readonly kind: "INTERNAL" | "VENDOR" | "SYSTEM";
  readonly userId?: Uuid;
  readonly active: boolean;
  readonly positionIds: readonly StableCode[];
  readonly permissionIds: readonly StableCode[];
}

export interface PrivateAttachmentRef {
  readonly attachmentId: Uuid;
  readonly rowVersion: Version;
  readonly checksum: Sha256;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly visibility: "PRIVATE";
}

export interface ResearchNoteEntryContent {
  readonly researchDate: string;
  readonly purpose: string;
  readonly work: string;
  readonly result: string;
}

export interface ResearchNoteEntrySnapshot extends ResearchNoteEntryContent {
  readonly entryId: Uuid;
  readonly researchNoteId: Uuid;
  readonly kind: ResearchNoteEntryKind;
  readonly entryVersion: Version;
  readonly previousEntryId?: Uuid;
  readonly correctsEntryId?: Uuid;
  readonly correctionReason?: string;
  readonly projectId: Uuid;
  readonly rndProgramIds: readonly Uuid[];
  readonly authorUserId: Uuid;
  readonly attachments: readonly PrivateAttachmentRef[];
  readonly checksum: Sha256;
  readonly sealedAt: UtcInstant;
}

const trustedEntries = new WeakSet<object>();
const entryFactoryToken = Symbol("ResearchNoteEntryFactory");
export class VerifiedResearchNoteEntry {
  public constructor(private readonly value: ResearchNoteEntrySnapshot, token: symbol) {
    if (token !== entryFactoryToken) fail("RESEARCH_NOTE_ENTRY_UNTRUSTED", "Trusted entry factory is required.");
    trustedEntries.add(this);
  }

  public snapshot(): ResearchNoteEntrySnapshot {
    if (!trustedEntries.has(this)) fail("RESEARCH_NOTE_ENTRY_UNTRUSTED", "Entry must be minted by the trusted canonicalizer boundary.");
    return this.value;
  }

  public static assertTrusted(value: VerifiedResearchNoteEntry): void {
    if (!trustedEntries.has(value)) fail("RESEARCH_NOTE_ENTRY_UNTRUSTED", "Entry must be minted by the trusted canonicalizer boundary.");
  }
}

export interface ResearchNoteEntryCanonicalizerPort {
  /** Validates the schema, normalizes the exact content/file manifest and calculates its checksum. */
  validateCanonicalizeAndHash(raw: unknown): ResearchNoteEntrySnapshot;
}

export class VerifiedResearchNoteEntryFactory {
  public constructor(private readonly canonicalizer: ResearchNoteEntryCanonicalizerPort) {}

  public create(raw: unknown): VerifiedResearchNoteEntry {
    const value = this.canonicalizer.validateCanonicalizeAndHash(raw);
    assertEntryShape(value);
    return new VerifiedResearchNoteEntry(deepFreezeEntry(value), entryFactoryToken);
  }
}

export interface ResearchNoteReviewSnapshot {
  readonly reviewId: Uuid;
  readonly entryId: Uuid;
  readonly entryVersion: Version;
  readonly entryChecksum: Sha256;
  readonly entrySealedAt: UtcInstant;
  readonly reviewerUserId: Uuid;
  readonly reviewerPositionId: "POSITION_SENIOR_RESEARCHER";
  readonly outcome: "REVIEWED" | "REVISION_REQUIRED";
  readonly reason?: string;
  readonly occurredAt: UtcInstant;
  readonly officialApproval: false;
}

export interface ResearchNoteFinalizationSnapshot {
  readonly finalizationId: Uuid;
  readonly entryId: Uuid;
  readonly entryVersion: Version;
  readonly entryChecksum: Sha256;
  readonly entrySealedAt: UtcInstant;
  readonly finalizedByUserId: Uuid;
  readonly finalizedByPositionId: "POSITION_LAB_DIRECTOR";
  readonly finalizedAt: UtcInstant;
}

export interface ResearchNoteSnapshot {
  readonly researchNoteId: Uuid;
  readonly projectId: Uuid;
  readonly rndProgramIds: readonly Uuid[];
  readonly authorUserId: Uuid;
  readonly state: ResearchNoteState;
  readonly rowVersion: Version;
  readonly assignedSeniorReviewerUserId?: Uuid;
  readonly entries: readonly ResearchNoteEntrySnapshot[];
  readonly reviews: readonly ResearchNoteReviewSnapshot[];
  readonly finalization?: ResearchNoteFinalizationSnapshot;
  readonly createdAt: UtcInstant;
  readonly updatedAt: UtcInstant;
}

export interface ResearchNoteTransition {
  readonly machineId: typeof RESEARCH_NOTE_MACHINE_ID;
  readonly eventId: (typeof RESEARCH_NOTE_EVENT_IDS)[keyof typeof RESEARCH_NOTE_EVENT_IDS];
  readonly fromState?: ResearchNoteState;
  readonly toState: ResearchNoteState;
  readonly occurredAt: UtcInstant;
  readonly actorUserId: Uuid;
  readonly exactEntryId?: Uuid;
  readonly exactEntryVersion?: Version;
  readonly exactEntryChecksum?: Sha256;
}

export interface ResearchNoteMutation {
  readonly snapshot: ResearchNoteSnapshot;
  readonly transition: ResearchNoteTransition;
  readonly appendedEntry?: ResearchNoteEntrySnapshot;
  readonly appendedReview?: ResearchNoteReviewSnapshot;
  readonly finalization?: ResearchNoteFinalizationSnapshot;
}

export class ResearchNote {
  private constructor(private current: ResearchNoteSnapshot) {}

  public static create(input: {
    researchNoteId: Uuid;
    projectId: Uuid;
    rndProgramIds?: readonly Uuid[];
    authorUserId: Uuid;
    actor: ResearchNoteActor;
    occurredAt: UtcInstant;
  }): ResearchNoteMutation & { aggregate: ResearchNote } {
    assertDirectInternal(input.actor, input.authorUserId, RESEARCH_NOTE_PERMISSION_IDS.CREATE);
    if (!input.projectId) fail("RESEARCH_NOTE_PROJECT_REQUIRED", "A typed Project reference is required.");
    const snapshot: ResearchNoteSnapshot = Object.freeze({
      researchNoteId: input.researchNoteId,
      projectId: input.projectId,
      rndProgramIds: Object.freeze([...(input.rndProgramIds ?? [])]),
      authorUserId: input.authorUserId,
      state: "DRAFT",
      rowVersion: 0 as Version,
      entries: Object.freeze([]),
      reviews: Object.freeze([]),
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt
    });
    const aggregate = new ResearchNote(snapshot);
    return { aggregate, snapshot, transition: aggregate.transition(undefined, "DRAFT", RESEARCH_NOTE_EVENT_IDS.CREATE, input.occurredAt, input.authorUserId) };
  }

  public static restore(snapshot: ResearchNoteSnapshot): ResearchNote {
    assertSnapshot(snapshot);
    return new ResearchNote(deepFreezeSnapshot(snapshot));
  }

  public snapshot(): ResearchNoteSnapshot { return this.current; }

  public submit(input: {
    actor: ResearchNoteActor;
    expectedVersion: Version;
    entry: VerifiedResearchNoteEntry;
    route: "SENIOR_REVIEW" | "DIRECTOR_FINALIZATION";
    assignedSeniorReviewerUserId?: Uuid;
    occurredAt: UtcInstant;
  }): ResearchNoteMutation {
    this.expectVersion(input.expectedVersion);
    if (this.current.state !== "DRAFT") fail("RESEARCH_NOTE_STATE_INVALID", "Only a draft may be submitted initially.");
    assertDirectInternal(input.actor, this.current.authorUserId, RESEARCH_NOTE_PERMISSION_IDS.SUBMIT);
    const entry = this.assertNextEntry(input.entry, "ORIGINAL");
    if (input.route === "SENIOR_REVIEW" && !input.assignedSeniorReviewerUserId) fail("RESEARCH_NOTE_SENIOR_ASSIGNMENT_REQUIRED", "Senior review requires an assigned reviewer.");
    if (input.route === "DIRECTOR_FINALIZATION" && input.assignedSeniorReviewerUserId) fail("RESEARCH_NOTE_DIRECT_ROUTE_INVALID", "Direct finalization cannot carry a Senior gate.");
    const toState = input.route === "SENIOR_REVIEW" ? "SENIOR_REVIEW_PENDING" : "DIRECTOR_FINALIZATION_PENDING";
    const eventId = input.route === "SENIOR_REVIEW" ? RESEARCH_NOTE_EVENT_IDS.SUBMIT_SENIOR : RESEARCH_NOTE_EVENT_IDS.SUBMIT_DIRECTOR;
    return this.apply(toState, eventId, input.actor.userId!, input.occurredAt, { entry, assignedSeniorReviewerUserId: input.assignedSeniorReviewerUserId });
  }

  public review(input: {
    actor: ResearchNoteActor;
    expectedVersion: Version;
    reviewId: Uuid;
    outcome: "REVIEWED" | "REVISION_REQUIRED";
    reason?: string;
    occurredAt: UtcInstant;
  }): ResearchNoteMutation {
    this.expectVersion(input.expectedVersion);
    if (this.current.state !== "SENIOR_REVIEW_PENDING") fail("RESEARCH_NOTE_STATE_INVALID", "No Senior review is pending.");
    assertActor(input.actor, RESEARCH_NOTE_PERMISSION_IDS.REVIEW, "POSITION_SENIOR_RESEARCHER");
    if (input.actor.userId !== this.current.assignedSeniorReviewerUserId) fail("RESEARCH_NOTE_REVIEWER_NOT_ASSIGNED", "Only the assigned Senior may review.");
    if (input.outcome === "REVISION_REQUIRED" && !input.reason?.trim()) fail("RESEARCH_NOTE_REVIEW_REASON_REQUIRED", "Revision requires a reason.");
    const entry = latest(this.current.entries);
    const review: ResearchNoteReviewSnapshot = Object.freeze({ reviewId: input.reviewId, entryId: entry.entryId, entryVersion: entry.entryVersion, entryChecksum: entry.checksum, entrySealedAt: entry.sealedAt, reviewerUserId: input.actor.userId!, reviewerPositionId: "POSITION_SENIOR_RESEARCHER", outcome: input.outcome, reason: input.reason?.trim(), occurredAt: input.occurredAt, officialApproval: false });
    const toState = input.outcome === "REVIEWED" ? "DIRECTOR_FINALIZATION_PENDING" : "REVISION_REQUIRED";
    const eventId = input.outcome === "REVIEWED" ? RESEARCH_NOTE_EVENT_IDS.REVIEWED : RESEARCH_NOTE_EVENT_IDS.REQUEST_REVISION;
    return this.apply(toState, eventId, input.actor.userId!, input.occurredAt, { review });
  }

  public resubmit(input: {
    actor: ResearchNoteActor;
    expectedVersion: Version;
    entry: VerifiedResearchNoteEntry;
    route: "SENIOR_REVIEW" | "DIRECTOR_FINALIZATION";
    assignedSeniorReviewerUserId?: Uuid;
    occurredAt: UtcInstant;
  }): ResearchNoteMutation {
    this.expectVersion(input.expectedVersion);
    if (this.current.state !== "REVISION_REQUIRED") fail("RESEARCH_NOTE_STATE_INVALID", "Only revision-required notes may be resubmitted.");
    assertDirectInternal(input.actor, this.current.authorUserId, RESEARCH_NOTE_PERMISSION_IDS.SUBMIT);
    const entry = this.assertNextEntry(input.entry, "ORIGINAL");
    if (input.route === "SENIOR_REVIEW" && !input.assignedSeniorReviewerUserId) fail("RESEARCH_NOTE_SENIOR_ASSIGNMENT_REQUIRED", "Senior review requires an assigned reviewer.");
    if (input.route === "DIRECTOR_FINALIZATION" && input.assignedSeniorReviewerUserId) fail("RESEARCH_NOTE_DIRECT_ROUTE_INVALID", "Direct finalization cannot carry a Senior gate.");
    const toState = input.route === "SENIOR_REVIEW" ? "SENIOR_REVIEW_PENDING" : "DIRECTOR_FINALIZATION_PENDING";
    return this.apply(toState, RESEARCH_NOTE_EVENT_IDS.RESUBMIT, input.actor.userId!, input.occurredAt, { entry, assignedSeniorReviewerUserId: input.route === "SENIOR_REVIEW" ? input.assignedSeniorReviewerUserId : undefined });
  }

  public finalize(input: {
    actor: ResearchNoteActor;
    expectedVersion: Version;
    finalizationId: Uuid;
    entryId: Uuid;
    entryVersion: Version;
    entryChecksum: Sha256;
    entrySealedAt: UtcInstant;
    occurredAt: UtcInstant;
  }): ResearchNoteMutation {
    this.expectVersion(input.expectedVersion);
    if (this.current.state !== "DIRECTOR_FINALIZATION_PENDING") fail("RESEARCH_NOTE_STATE_INVALID", "Director finalization is not pending.");
    assertActor(input.actor, RESEARCH_NOTE_PERMISSION_IDS.FINALIZE, "POSITION_LAB_DIRECTOR");
    if (input.actor.positionIds.includes("POSITION_REPRESENTATIVE" as StableCode) && !input.actor.positionIds.includes("POSITION_LAB_DIRECTOR" as StableCode)) fail("RESEARCH_NOTE_REPRESENTATIVE_DENIED", "Representative position has no ResearchNote finalization authority.");
    const entry = latest(this.current.entries);
    assertExactEntry(entry, input);
    const finalization: ResearchNoteFinalizationSnapshot = Object.freeze({ finalizationId: input.finalizationId, entryId: entry.entryId, entryVersion: entry.entryVersion, entryChecksum: entry.checksum, entrySealedAt: entry.sealedAt, finalizedByUserId: input.actor.userId!, finalizedByPositionId: "POSITION_LAB_DIRECTOR", finalizedAt: input.occurredAt });
    return this.apply("FINALIZED", RESEARCH_NOTE_EVENT_IDS.FINALIZE, input.actor.userId!, input.occurredAt, { finalization });
  }

  public addCorrection(input: {
    actor: ResearchNoteActor;
    expectedVersion: Version;
    entry: VerifiedResearchNoteEntry;
    occurredAt: UtcInstant;
  }): ResearchNoteMutation {
    this.expectVersion(input.expectedVersion);
    if (this.current.state !== "FINALIZED") fail("RESEARCH_NOTE_STATE_INVALID", "A correction/addendum may be appended once to a finalized original.");
    const isAuthor = input.actor.userId === this.current.authorUserId;
    const isDirector = input.actor.positionIds.includes("POSITION_LAB_DIRECTOR" as StableCode);
    assertActor(input.actor, RESEARCH_NOTE_PERMISSION_IDS.CORRECT);
    if (!isAuthor && !isDirector) fail("RESEARCH_NOTE_CORRECTION_AUTHORITY_REQUIRED", "Only the author or Lab Director may append a correction.");
    const entry = this.assertNextEntry(input.entry);
    if (entry.kind === "ORIGINAL" || !entry.correctionReason?.trim()) fail("RESEARCH_NOTE_CORRECTION_INVALID", "A correction/addendum kind and reason are required.");
    const prior = latest(this.current.entries);
    if (entry.previousEntryId !== prior.entryId || entry.correctsEntryId !== this.current.finalization?.entryId) fail("RESEARCH_NOTE_CORRECTION_LINEAGE_INVALID", "Correction must directly link the latest entry and finalized original.");
    return this.apply("CORRECTED_BY_ADDENDUM", RESEARCH_NOTE_EVENT_IDS.ADD_CORRECTION, input.actor.userId!, input.occurredAt, { entry });
  }

  private assertNextEntry(verified: VerifiedResearchNoteEntry, requiredKind?: ResearchNoteEntryKind): ResearchNoteEntrySnapshot {
    VerifiedResearchNoteEntry.assertTrusted(verified);
    const entry = verified.snapshot();
    if (entry.researchNoteId !== this.current.researchNoteId || entry.projectId !== this.current.projectId || entry.authorUserId !== this.current.authorUserId) fail("RESEARCH_NOTE_ENTRY_SUBJECT_MISMATCH", "Entry subject, Project, and author must match the note root.");
    if (requiredKind && entry.kind !== requiredKind) fail("RESEARCH_NOTE_ENTRY_KIND_INVALID", `Entry kind must be ${requiredKind}.`);
    const prior = this.current.entries.at(-1);
    const expected = (prior ? Number(prior.entryVersion) + 1 : 1) as Version;
    if (entry.entryVersion !== expected || (prior && entry.previousEntryId !== prior.entryId) || (!prior && entry.previousEntryId !== undefined)) fail("RESEARCH_NOTE_ENTRY_LINEAGE_INVALID", "Entry must be the direct next immutable version.");
    if (JSON.stringify([...entry.rndProgramIds].sort()) !== JSON.stringify([...this.current.rndProgramIds].sort())) fail("RESEARCH_NOTE_RND_LINK_MISMATCH", "R&D links must match the typed note links.");
    return entry;
  }

  private apply(toState: ResearchNoteState, eventId: ResearchNoteTransition["eventId"], actorUserId: Uuid, occurredAt: UtcInstant, append: { entry?: ResearchNoteEntrySnapshot; review?: ResearchNoteReviewSnapshot; finalization?: ResearchNoteFinalizationSnapshot; assignedSeniorReviewerUserId?: Uuid }): ResearchNoteMutation {
    const fromState = this.current.state;
    const entries = append.entry ? Object.freeze([...this.current.entries, append.entry]) : this.current.entries;
    const reviews = append.review ? Object.freeze([...this.current.reviews, append.review]) : this.current.reviews;
    const assignedSeniorReviewerUserId = Object.prototype.hasOwnProperty.call(append, "assignedSeniorReviewerUserId")
      ? append.assignedSeniorReviewerUserId
      : this.current.assignedSeniorReviewerUserId;
    this.current = Object.freeze({ ...this.current, state: toState, rowVersion: (Number(this.current.rowVersion) + 1) as Version, entries, reviews, assignedSeniorReviewerUserId, finalization: append.finalization ?? this.current.finalization, updatedAt: occurredAt });
    const exact = append.entry ?? entries.at(-1);
    return { snapshot: this.current, transition: this.transition(fromState, toState, eventId, occurredAt, actorUserId, exact), appendedEntry: append.entry, appendedReview: append.review, finalization: append.finalization };
  }

  private transition(fromState: ResearchNoteState | undefined, toState: ResearchNoteState, eventId: ResearchNoteTransition["eventId"], occurredAt: UtcInstant, actorUserId: Uuid, entry?: ResearchNoteEntrySnapshot): ResearchNoteTransition {
    return Object.freeze({ machineId: RESEARCH_NOTE_MACHINE_ID, eventId, fromState, toState, occurredAt, actorUserId, exactEntryId: entry?.entryId, exactEntryVersion: entry?.entryVersion, exactEntryChecksum: entry?.checksum });
  }

  private expectVersion(expected: Version): void { if (this.current.rowVersion !== expected) fail("RESEARCH_NOTE_VERSION_CONFLICT", "Optimistic version conflict."); }
}

function assertEntryShape(entry: ResearchNoteEntrySnapshot): void {
  if (!entry.projectId || !entry.researchNoteId || !entry.entryId) fail("RESEARCH_NOTE_ENTRY_INVALID", "Typed IDs are required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.researchDate)) fail("RESEARCH_NOTE_DATE_INVALID", "Research date must be YYYY-MM-DD.");
  for (const [name, value] of [["purpose", entry.purpose], ["work", entry.work], ["result", entry.result]] as const) if (!value.trim()) fail("RESEARCH_NOTE_CONTENT_REQUIRED", `${name} is required.`);
  if (!Number.isSafeInteger(entry.entryVersion) || entry.entryVersion < 1) fail("RESEARCH_NOTE_ENTRY_VERSION_INVALID", "Entry version must be positive.");
  const ids = new Set<string>();
  for (const file of entry.attachments) {
    if (file.visibility !== "PRIVATE" || file.rowVersion < 0 || file.sizeBytes < 0 || !file.mimeType.trim()) fail("RESEARCH_NOTE_ATTACHMENT_INVALID", "Attachment must be a private exact tuple.");
    if (ids.has(file.attachmentId)) fail("RESEARCH_NOTE_ATTACHMENT_DUPLICATE", "Attachment IDs must be unique.");
    ids.add(file.attachmentId);
  }
  if ((entry.kind === "CORRECTION" || entry.kind === "ADDENDUM") && (!entry.previousEntryId || !entry.correctsEntryId || !entry.correctionReason?.trim())) fail("RESEARCH_NOTE_CORRECTION_INVALID", "Correction lineage and reason are required.");
}

function deepFreezeEntry(entry: ResearchNoteEntrySnapshot): ResearchNoteEntrySnapshot {
  return Object.freeze({ ...entry, rndProgramIds: Object.freeze([...entry.rndProgramIds]), attachments: Object.freeze(entry.attachments.map((file) => Object.freeze({ ...file }))) });
}
function deepFreezeSnapshot(snapshot: ResearchNoteSnapshot): ResearchNoteSnapshot {
  const cloned = structuredClone(snapshot);
  return Object.freeze({
    ...cloned,
    rndProgramIds: Object.freeze([...cloned.rndProgramIds]),
    entries: Object.freeze(cloned.entries.map(deepFreezeEntry)),
    reviews: Object.freeze(cloned.reviews.map((review) => Object.freeze({ ...review }))),
    finalization: cloned.finalization ? Object.freeze({ ...cloned.finalization }) : undefined
  });
}
function assertSnapshot(snapshot: ResearchNoteSnapshot): void {
  if (!snapshot.projectId || !snapshot.researchNoteId || !snapshot.authorUserId) fail("RESEARCH_NOTE_SNAPSHOT_INVALID", "Root IDs are required.");
  if (!Number.isSafeInteger(snapshot.rowVersion) || snapshot.rowVersion < 0) fail("RESEARCH_NOTE_SNAPSHOT_INVALID", "A non-negative optimistic row version is required.");
  snapshot.entries.forEach((entry, index) => {
    assertEntryShape(entry);
    if (entry.researchNoteId !== snapshot.researchNoteId || entry.projectId !== snapshot.projectId || entry.authorUserId !== snapshot.authorUserId) fail("RESEARCH_NOTE_ENTRY_SUBJECT_MISMATCH", "Every restored entry must belong to the exact note root.");
    const previous = snapshot.entries[index - 1];
    if (Number(entry.entryVersion) !== index + 1 || (previous ? entry.previousEntryId !== previous.entryId : entry.previousEntryId !== undefined)) fail("RESEARCH_NOTE_ENTRY_LINEAGE_INVALID", "Restored entries must form one direct immutable version chain.");
  });
  if ((snapshot.state === "FINALIZED" || snapshot.state === "CORRECTED_BY_ADDENDUM") && !snapshot.finalization) fail("RESEARCH_NOTE_FINALIZATION_REQUIRED", "Finalized state requires exact finalization evidence.");
  if (snapshot.finalization) {
    const finalizedEntry = snapshot.entries.find((entry) => entry.entryId === snapshot.finalization!.entryId) ?? fail("RESEARCH_NOTE_FINALIZED_ENTRY_MISSING", "Finalized entry is missing.");
    assertExactEntry(finalizedEntry, snapshot.finalization);
    const latestEntry = latest(snapshot.entries);
    if (snapshot.state === "FINALIZED" && latestEntry.entryId !== finalizedEntry.entryId) fail("RESEARCH_NOTE_FINALIZATION_LINEAGE_INVALID", "A finalized note cannot contain entries after its exact finalized entry.");
    if (snapshot.state === "CORRECTED_BY_ADDENDUM" && (latestEntry.kind === "ORIGINAL" || latestEntry.correctsEntryId !== finalizedEntry.entryId)) fail("RESEARCH_NOTE_CORRECTION_LINEAGE_INVALID", "A corrected note must end with an addendum linked to its exact finalized entry.");
  }
}
function assertExactEntry(entry: ResearchNoteEntrySnapshot, exact: { entryId: Uuid; entryVersion: Version; entryChecksum: Sha256; entrySealedAt: UtcInstant }): void {
  if (entry.entryId !== exact.entryId || entry.entryVersion !== exact.entryVersion || entry.checksum !== exact.entryChecksum || entry.sealedAt !== exact.entrySealedAt) fail("RESEARCH_NOTE_EXACT_ENTRY_MISMATCH", "Exact immutable entry snapshot does not match.");
}
function assertDirectInternal(actor: ResearchNoteActor, userId: Uuid, permission: string): void {
  assertActor(actor, permission);
  if (actor.userId !== userId) fail("RESEARCH_NOTE_DIRECT_ACTOR_REQUIRED", "Authenticated author must act directly.");
}
function assertActor(actor: ResearchNoteActor, permission: string, requiredPosition?: string): void {
  if (!actor.active || actor.kind !== "INTERNAL" || !actor.userId) fail("RESEARCH_NOTE_INTERNAL_ACTOR_REQUIRED", "An active internal user is required.");
  if (!actor.permissionIds.includes(permission as StableCode)) fail("RESEARCH_NOTE_PERMISSION_DENIED", `Missing permission ${permission}.`);
  if (requiredPosition && !actor.positionIds.includes(requiredPosition as StableCode)) fail("RESEARCH_NOTE_POSITION_DENIED", `Position ${requiredPosition} is required.`);
}
function latest<T>(items: readonly T[]): T { const item = items.at(-1); if (!item) return fail("RESEARCH_NOTE_ENTRY_REQUIRED", "An exact entry is required."); return item; }
function fail(code: string, message: string): never { const error = new Error(message); error.name = code; throw error; }
