import type { Sha256, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import type { PrivateAttachmentRef, ResearchNoteSnapshot } from "../domain/research-note.js";

export interface ResearchNotePdfManifestBasis {
  readonly researchNoteId: Uuid;
  readonly projectId: Uuid;
  readonly entries: readonly {
    readonly entryId: Uuid;
    readonly entryVersion: Version;
    readonly entryChecksum: Sha256;
    readonly entrySealedAt: UtcInstant;
    readonly kind: "ORIGINAL" | "CORRECTION" | "ADDENDUM";
  }[];
  readonly entryId: Uuid;
  readonly entryVersion: Version;
  readonly entryChecksum: Sha256;
  readonly entrySealedAt: UtcInstant;
  readonly files: readonly (Pick<PrivateAttachmentRef, "attachmentId" | "rowVersion" | "checksum"> & { readonly entryId: Uuid })[];
  readonly rendererId: string;
  readonly rendererVersion: string;
  readonly renderedPdfChecksum: Sha256;
  readonly generatedAt: UtcInstant;
}
export interface ResearchNotePdfManifest extends ResearchNotePdfManifestBasis { readonly manifestChecksum: Sha256; }
export interface ResearchNotePdfRendererPort {
  render(input: { researchNoteId: Uuid; entries: ResearchNotePdfManifestBasis["entries"] }): Promise<{ rendererId: string; rendererVersion: string; renderedPdfChecksum: Sha256; output: PrivateAttachmentRef }>;
}
export interface CanonicalManifestHashPort { sha256Canonical(value: ResearchNotePdfManifestBasis): Promise<Sha256>; }

export async function buildResearchNotePdfManifest(input: {
  readonly snapshot: ResearchNoteSnapshot;
  readonly renderer: ResearchNotePdfRendererPort;
  readonly hasher: CanonicalManifestHashPort;
  readonly generatedAt: UtcInstant;
}): Promise<{ manifest: ResearchNotePdfManifest; output: PrivateAttachmentRef }> {
  if (input.snapshot.state !== "FINALIZED" && input.snapshot.state !== "CORRECTED_BY_ADDENDUM") throw named("RESEARCH_NOTE_PDF_REQUIRES_FINALIZED", "Only finalized notes may be rendered.");
  const exact = input.snapshot.finalization;
  if (!exact) throw named("RESEARCH_NOTE_PDF_FINALIZATION_MISSING", "Exact finalization evidence is required.");
  const entry = input.snapshot.entries.find((candidate) => candidate.entryId === exact.entryId);
  if (!entry || entry.entryVersion !== exact.entryVersion || entry.checksum !== exact.entryChecksum || entry.sealedAt !== exact.entrySealedAt) throw named("RESEARCH_NOTE_PDF_EXACT_ENTRY_MISMATCH", "Finalized entry evidence does not match.");
  const entries = Object.freeze(input.snapshot.entries.map((candidate) => Object.freeze({ entryId: candidate.entryId, entryVersion: candidate.entryVersion, entryChecksum: candidate.checksum, entrySealedAt: candidate.sealedAt, kind: candidate.kind })));
  const rendered = await input.renderer.render({ researchNoteId: input.snapshot.researchNoteId, entries });
  if (rendered.output.visibility !== "PRIVATE" || rendered.output.checksum !== rendered.renderedPdfChecksum) throw named("RESEARCH_NOTE_PDF_OUTPUT_INVALID", "Renderer output must be a private exact attachment matching its checksum.");
  const basis: ResearchNotePdfManifestBasis = Object.freeze({ researchNoteId: input.snapshot.researchNoteId, projectId: input.snapshot.projectId, entries, entryId: entry.entryId, entryVersion: entry.entryVersion, entryChecksum: entry.checksum, entrySealedAt: entry.sealedAt, files: Object.freeze(input.snapshot.entries.flatMap((candidate) => candidate.attachments.map(({ attachmentId, rowVersion, checksum }) => Object.freeze({ entryId: candidate.entryId, attachmentId, rowVersion, checksum })))), rendererId: rendered.rendererId, rendererVersion: rendered.rendererVersion, renderedPdfChecksum: rendered.renderedPdfChecksum, generatedAt: input.generatedAt });
  const manifestChecksum = await input.hasher.sha256Canonical(basis);
  return { manifest: Object.freeze({ ...basis, manifestChecksum }), output: rendered.output };
}
function named(code: string, message: string): Error { const error = new Error(message); error.name = code; return error; }
