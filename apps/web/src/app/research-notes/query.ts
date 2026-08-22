import type { ResearchNoteState } from "@youone/feature-research-note/public";

import { previewResearchNotes } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

/** Serializable UI-only display projection layered over the canonical feature contracts. */
export interface ResearchNoteProjectLinkView { readonly projectId: string; readonly projectCode: string; readonly projectName: string }
export interface ResearchNoteRndLinkView { readonly rndProgramId: string; readonly programCode: string; readonly title: string }
export interface ResearchNoteEntryView { readonly entryId: string; readonly sequenceNo: number; readonly entryType: "ORIGINAL" | "CORRECTION" | "ADDENDUM"; readonly correctsEntryId?: string; readonly heading: string; readonly summary: string; readonly contentChecksum: string; readonly recordedAt: string; readonly finalized: boolean }
export interface ResearchNoteSeniorReviewView { readonly outcome: "COMMENTED" | "RECOMMEND_FINALIZATION" | "RETURN_FOR_CORRECTION"; readonly reviewerDisplayName: string; readonly comment: string; readonly reviewedAt: string; readonly officialApproval: false }
export interface ResearchNoteDirectorFinalizationView { readonly finalizedByDisplayName: string; readonly finalizedAt: string; readonly finalizedVersion: number; readonly finalizedSnapshotChecksum: string; readonly representativeApprovalIncluded: false }
export interface ResearchNotePdfEvidenceView { readonly documentVersionId: string; readonly manifestSchemaId: string; readonly manifestSchemaVersion: number; readonly manifestChecksum: string; readonly pdfContentHash: string; readonly pageCount: number; readonly rendererId: string; readonly rendererVersion: string; readonly generatedAt: string; readonly delivery: "AUTHORIZED_PRIVATE_DELIVERY"; readonly deliveryRestriction: "ORIGINAL_DENIED" }
export interface ResearchNoteListItemView { readonly researchNoteId: string; readonly noteNo: string; readonly title: string; readonly state: ResearchNoteState; readonly authorDisplayName: string; readonly researchDate: string; readonly projectLinks: readonly ResearchNoteProjectLinkView[]; readonly rndProgramLinks: readonly ResearchNoteRndLinkView[]; readonly entryCount: number; readonly seniorReviewPath: "PENDING" | "COMPLETED" | "SKIPPED_BY_POLICY"; readonly nextAction: string | null }
export interface ResearchNoteDetailView extends ResearchNoteListItemView { readonly entries: readonly ResearchNoteEntryView[]; readonly seniorReview?: ResearchNoteSeniorReviewView; readonly directorFinalization?: ResearchNoteDirectorFinalizationView; readonly correctionChain: readonly { readonly entryId: string; readonly correctsEntryId: string; readonly kind: "CORRECTION" | "ADDENDUM" }[]; readonly pdfEvidence: ResearchNotePdfEvidenceView | null }
export interface ResearchNoteProjectionSource extends Omit<ResearchNoteDetailView, "entryCount" | "pdfEvidence"> { readonly entryCount?: number; readonly pdfEvidence: Omit<ResearchNotePdfEvidenceView, "deliveryRestriction"> | null; readonly [key: string]: unknown }

const freezeArray = <T>(values: readonly T[]): readonly T[] => Object.freeze(values.map((value) => Object.freeze(structuredClone(value))));

export function projectResearchNoteDetail(source: ResearchNoteProjectionSource): ResearchNoteDetailView {
  return Object.freeze({
    researchNoteId: source.researchNoteId, noteNo: source.noteNo, title: source.title, state: source.state,
    authorDisplayName: source.authorDisplayName, researchDate: source.researchDate,
    projectLinks: freezeArray(source.projectLinks), rndProgramLinks: freezeArray(source.rndProgramLinks), entryCount: source.entries.length,
    seniorReviewPath: source.seniorReviewPath, nextAction: source.nextAction, entries: freezeArray(source.entries),
    ...(source.seniorReview === undefined ? {} : { seniorReview: Object.freeze(structuredClone(source.seniorReview)) }),
    ...(source.directorFinalization === undefined ? {} : { directorFinalization: Object.freeze(structuredClone(source.directorFinalization)) }),
    correctionChain: freezeArray(source.correctionChain),
    pdfEvidence: source.pdfEvidence === null ? null : Object.freeze({
      documentVersionId: source.pdfEvidence.documentVersionId, manifestSchemaId: source.pdfEvidence.manifestSchemaId,
      manifestSchemaVersion: source.pdfEvidence.manifestSchemaVersion, manifestChecksum: source.pdfEvidence.manifestChecksum,
      pdfContentHash: source.pdfEvidence.pdfContentHash, pageCount: source.pdfEvidence.pageCount,
      rendererId: source.pdfEvidence.rendererId, rendererVersion: source.pdfEvidence.rendererVersion,
      generatedAt: source.pdfEvidence.generatedAt, delivery: "AUTHORIZED_PRIVATE_DELIVERY", deliveryRestriction: "ORIGINAL_DENIED"
    })
  });
}

export function projectResearchNoteListItem(source: ResearchNoteProjectionSource): ResearchNoteListItemView {
  const detail = projectResearchNoteDetail(source);
  return Object.freeze({ researchNoteId: detail.researchNoteId, noteNo: detail.noteNo, title: detail.title, state: detail.state,
    authorDisplayName: detail.authorDisplayName, researchDate: detail.researchDate, projectLinks: detail.projectLinks,
    rndProgramLinks: detail.rndProgramLinks, entryCount: detail.entryCount, seniorReviewPath: detail.seniorReviewPath, nextAction: detail.nextAction });
}

export type ResearchNoteListResult = { readonly availability: "AVAILABLE"; readonly items: readonly ResearchNoteListItemView[] } | { readonly availability: "FORBIDDEN"; readonly items: readonly [] } | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type ResearchNoteDetailResult = { readonly availability: "AVAILABLE"; readonly detail: ResearchNoteDetailView } | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null } | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface ResearchNoteQueryPort { listInternal(): Promise<ResearchNoteListResult>; getInternal(researchNoteId: string): Promise<ResearchNoteDetailResult>; listVendor(): Promise<{ readonly availability: "FORBIDDEN"; readonly items: readonly [] }>; getVendor(researchNoteId: string): Promise<{ readonly availability: "FORBIDDEN"; readonly detail: null }>; getAdminSystemOriginalContent(researchNoteId: string): Promise<{ readonly availability: "FORBIDDEN"; readonly content: null; readonly capability: "NONE" }> }

class UnavailableResearchNoteQuery implements ResearchNoteQueryPort {
  async listInternal(): Promise<ResearchNoteListResult> { return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
  async getInternal(researchNoteId: string): Promise<ResearchNoteDetailResult> { void researchNoteId; return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
  async listVendor() { return { availability: "FORBIDDEN" as const, items: [] as const }; }
  async getVendor(researchNoteId: string) { void researchNoteId; return { availability: "FORBIDDEN" as const, detail: null }; }
  async getAdminSystemOriginalContent(researchNoteId: string) { void researchNoteId; return { availability: "FORBIDDEN" as const, content: null, capability: "NONE" as const }; }
}

class PreviewResearchNoteQuery extends UnavailableResearchNoteQuery {
  override async listInternal(): Promise<ResearchNoteListResult> { return { availability: "AVAILABLE", items: previewResearchNotes.map((note) => projectResearchNoteListItem(note)) }; }
  override async getInternal(researchNoteId: string): Promise<ResearchNoteDetailResult> { const note = previewResearchNotes.find((item) => item.researchNoteId === researchNoteId); return note ? { availability: "AVAILABLE", detail: projectResearchNoteDetail(note) } : { availability: "NOT_FOUND", detail: null }; }
}

export function researchNoteQuery(usePreviewData = previewDataEnabled()): ResearchNoteQueryPort {
  return usePreviewData ? new PreviewResearchNoteQuery() : new UnavailableResearchNoteQuery();
}
