import type { TechCopySecurityLevel, TechCopyState } from "@youone/feature-tech-copy/public";

import { previewTechnicalCopies } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

export type TechnicalCopyState = TechCopyState;
export type TechnicalCopySecurityLevel = TechCopySecurityLevel;

export interface TechnicalCopyApprovalStepView {
  readonly role: "LAB_DIRECTOR" | "REPRESENTATIVE";
  readonly label: string;
  readonly outcome: "APPROVED" | "PENDING";
  readonly actorDisplayName?: string;
  readonly actedAt?: string;
}

export interface TechnicalCopyWatermarkView {
  readonly recipientVendor: string;
  readonly project: string;
  readonly copyNo: string;
  readonly securityLevel: TechnicalCopySecurityLevel;
  readonly issuer: string;
  readonly printedAt: string;
  readonly prohibition: string;
}

export interface TechnicalCopyCustodyEventView {
  readonly eventId: string;
  readonly kind: "REQUEST" | "SUBMIT" | "APPROVE" | "RENDER" | "PRINT" | "HANDOVER" | "RETURN_DUE" | "RETURN" | "DESTROY" | "OVERDUE";
  readonly label: string;
  readonly actorDisplayName: string;
  readonly occurredAt: string;
  readonly evidenceCount?: number;
}

export interface TechnicalCopyListItemView {
  readonly technicalCopyId: string;
  readonly requestNo: string;
  readonly copyNo: string | null;
  readonly state: TechnicalCopyState;
  readonly securityLevel: TechnicalCopySecurityLevel;
  readonly documentNo: string;
  readonly documentTitle: string;
  readonly versionNo: number;
  readonly projectLabel: string;
  readonly recipientDisplayName: string;
  readonly purpose: string;
  readonly returnDueAt: string;
}

export interface TechnicalCopyDetailView extends TechnicalCopyListItemView {
  readonly documentVersionId: string;
  readonly versionChecksum: string;
  readonly requestedByDisplayName: string;
  readonly requestedAt: string;
  readonly approvalInstanceId: string;
  readonly approvalSteps: readonly TechnicalCopyApprovalStepView[];
  readonly pageCount: number | null;
  readonly sourceHash: string | null;
  readonly outputHash: string | null;
  readonly watermark: TechnicalCopyWatermarkView | null;
  readonly custodyEvents: readonly TechnicalCopyCustodyEventView[];
  readonly reprintOfCopyId: string | null;
  readonly reprintReason: string | null;
}

export interface TechnicalCopyProjectionSource extends TechnicalCopyDetailView {
  readonly projectId: string;
  readonly vendorId: string;
  readonly [key: string]: unknown;
}

const freezeList = <T>(items: readonly T[]): readonly T[] => Object.freeze(items.map((item) => Object.freeze(structuredClone(item))));

export function projectTechnicalCopyListItem(source: TechnicalCopyProjectionSource): TechnicalCopyListItemView {
  return Object.freeze({
    technicalCopyId: source.technicalCopyId,
    requestNo: source.requestNo,
    copyNo: source.copyNo,
    state: source.state,
    securityLevel: source.securityLevel,
    documentNo: source.documentNo,
    documentTitle: source.documentTitle,
    versionNo: source.versionNo,
    projectLabel: source.projectLabel,
    recipientDisplayName: source.recipientDisplayName,
    purpose: source.purpose,
    returnDueAt: source.returnDueAt
  });
}

export function projectTechnicalCopyDetail(source: TechnicalCopyProjectionSource): TechnicalCopyDetailView {
  return Object.freeze({
    ...projectTechnicalCopyListItem(source),
    documentVersionId: source.documentVersionId,
    versionChecksum: source.versionChecksum,
    requestedByDisplayName: source.requestedByDisplayName,
    requestedAt: source.requestedAt,
    approvalInstanceId: source.approvalInstanceId,
    approvalSteps: freezeList(source.approvalSteps),
    pageCount: source.pageCount,
    sourceHash: source.sourceHash,
    outputHash: source.outputHash,
    watermark: source.watermark === null ? null : Object.freeze(structuredClone(source.watermark)),
    custodyEvents: freezeList(source.custodyEvents),
    reprintOfCopyId: source.reprintOfCopyId,
    reprintReason: source.reprintReason
  });
}

export type TechnicalCopyListResult =
  | { readonly availability: "AVAILABLE"; readonly items: readonly TechnicalCopyListItemView[] }
  | { readonly availability: "FORBIDDEN"; readonly items: readonly [] }
  | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type TechnicalCopyDetailResult =
  | { readonly availability: "AVAILABLE"; readonly detail: TechnicalCopyDetailView }
  | { readonly availability: "FORBIDDEN" | "NOT_FOUND"; readonly detail: null }
  | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };

export interface TechnicalCopyQueryPort {
  listInternal(): Promise<TechnicalCopyListResult>;
  getInternal(technicalCopyId: string): Promise<TechnicalCopyDetailResult>;
  listVendor(): Promise<{ readonly availability: "FORBIDDEN"; readonly items: readonly [] }>;
  getVendor(technicalCopyId: string): Promise<{ readonly availability: "FORBIDDEN"; readonly detail: null }>;
  getAdminSystemSource(technicalCopyId: string): Promise<{ readonly availability: "FORBIDDEN"; readonly source: null; readonly capability: "NONE" }>;
}

class UnavailableTechnicalCopyQuery implements TechnicalCopyQueryPort {
  async listInternal(): Promise<TechnicalCopyListResult> { return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
  async getInternal(technicalCopyId: string): Promise<TechnicalCopyDetailResult> { void technicalCopyId; return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
  async listVendor() { return { availability: "FORBIDDEN" as const, items: [] as const }; }
  async getVendor(technicalCopyId: string) { void technicalCopyId; return { availability: "FORBIDDEN" as const, detail: null }; }
  async getAdminSystemSource(technicalCopyId: string) { void technicalCopyId; return { availability: "FORBIDDEN" as const, source: null, capability: "NONE" as const }; }
}

class PreviewTechnicalCopyQuery extends UnavailableTechnicalCopyQuery {
  override async listInternal(): Promise<TechnicalCopyListResult> {
    return { availability: "AVAILABLE", items: Object.freeze(previewTechnicalCopies.map((item) => projectTechnicalCopyListItem(item as TechnicalCopyProjectionSource))) };
  }

  override async getInternal(technicalCopyId: string): Promise<TechnicalCopyDetailResult> {
    const detail = previewTechnicalCopies.find((item) => item.technicalCopyId === technicalCopyId);
    return detail ? { availability: "AVAILABLE", detail: projectTechnicalCopyDetail(detail as TechnicalCopyProjectionSource) } : { availability: "NOT_FOUND", detail: null };
  }
}

export function technicalCopyQuery(usePreviewData = previewDataEnabled()): TechnicalCopyQueryPort {
  return usePreviewData ? new PreviewTechnicalCopyQuery() : new UnavailableTechnicalCopyQuery();
}
