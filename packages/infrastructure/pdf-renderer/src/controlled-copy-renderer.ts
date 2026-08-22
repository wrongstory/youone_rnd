import type { ControlledCopyRendererPort, CompletedControlledCopyApproval, ControlledCopyRequestSnapshot, PerPageWatermark, RenderedCopyEvidence } from "@youone/feature-tech-copy/public";
import type { Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";

export interface ExactApprovedPdfSourcePort { readExactPrivate(input: { readonly attachmentId: Uuid; readonly rowVersion: Version; readonly expectedHash: Sha256; readonly documentVersionId: Uuid }): Promise<Uint8Array> }
export interface PdfHashPort { sha256Bytes(bytes: Uint8Array): Promise<Sha256>; sha256Canonical(value: Readonly<Record<string, unknown>>): Promise<Sha256> }
export interface PdfCompositionEnginePort {
  renderEveryPage(input: { readonly sourcePdf: Uint8Array; readonly watermark: PerPageWatermark; readonly watermarkChecksum: Sha256 }): Promise<{ readonly outputPdf: Uint8Array; readonly pageCount: number; readonly pageProofs: readonly { readonly pageNo: number; readonly watermarkChecksum: Sha256 }[] }>;
}
export interface PrivatePdfOutputPort { storePrivate(input: { readonly bytes: Uint8Array; readonly outputHash: Sha256; readonly copyNo: string }): Promise<{ readonly attachmentId: Uuid; readonly rowVersion: Version; readonly visibility: "PRIVATE" }> }
export interface RendererClockPort { now(): UtcInstant }

export class GenericControlledCopyPdfRenderer implements ControlledCopyRendererPort {
  public constructor(private readonly dependencies: { readonly source: ExactApprovedPdfSourcePort; readonly hash: PdfHashPort; readonly engine: PdfCompositionEnginePort; readonly output: PrivatePdfOutputPort; readonly clock: RendererClockPort; readonly rendererId: StableCode; readonly rendererVersion: StableCode }) {}

  public async render(input: { readonly request: ControlledCopyRequestSnapshot; readonly watermark: PerPageWatermark; readonly approval: CompletedControlledCopyApproval }): Promise<RenderedCopyEvidence> {
    const { request, watermark, approval } = input;
    if (approval.state !== "COMPLETED" || approval.technicalDocumentCopyId !== request.technicalDocumentCopyId || approval.requestChecksum !== request.requestChecksum || approval.documentVersionId !== request.document.documentVersionId || approval.documentChecksum !== request.document.sealedSnapshotChecksum || approval.recipientUserId !== request.recipient.recipientUserId || approval.vendorId !== request.recipient.vendorId || approval.purposeHash !== request.purposeHash) throw named("PDF_CONTROLLED_COPY_APPROVAL_MISMATCH", "Completed approval must bind the exact request before source bytes are read.");
    const sourcePdf = await this.dependencies.source.readExactPrivate({ attachmentId: request.document.sourceAttachmentId, rowVersion: request.document.sourceAttachmentRowVersion, expectedHash: request.document.sourceHash, documentVersionId: request.document.documentVersionId });
    const actualSourceHash = await this.dependencies.hash.sha256Bytes(sourcePdf);
    if (actualSourceHash !== request.document.sourceHash) throw named("PDF_CONTROLLED_COPY_SOURCE_HASH_MISMATCH", "Source bytes do not match the exact approved version.");
    const watermarkChecksum = await this.dependencies.hash.sha256Canonical({ ...watermark });
    const rendered = await this.dependencies.engine.renderEveryPage({ sourcePdf, watermark, watermarkChecksum });
    if (rendered.pageCount < 1 || rendered.pageProofs.length !== rendered.pageCount || rendered.pageProofs.some((proof, index) => proof.pageNo !== index + 1 || proof.watermarkChecksum !== watermarkChecksum)) throw named("PDF_CONTROLLED_COPY_WATERMARK_INCOMPLETE", "The exact watermark must be proven on every sequential page.");
    const outputHash = await this.dependencies.hash.sha256Bytes(rendered.outputPdf);
    const stored = await this.dependencies.output.storePrivate({ bytes: rendered.outputPdf, outputHash, copyNo: request.copyNo });
    if (stored.visibility !== "PRIVATE") throw named("PDF_CONTROLLED_COPY_PUBLIC_OUTPUT_DENIED", "Controlled-copy output must remain private.");
    const renderedAt = this.dependencies.clock.now();
    const manifestChecksum = await this.dependencies.hash.sha256Canonical({ schema: "CONTROLLED_COPY_PDF_MANIFEST_V1", rendererId: this.dependencies.rendererId, rendererVersion: this.dependencies.rendererVersion, technicalDocumentCopyId: request.technicalDocumentCopyId, copyNo: request.copyNo, sourceHash: actualSourceHash, outputHash, pageCount: rendered.pageCount, watermarkChecksum, outputAttachmentId: stored.attachmentId, outputAttachmentRowVersion: stored.rowVersion, renderedAt });
    return Object.freeze({ rendererId: this.dependencies.rendererId, rendererVersion: this.dependencies.rendererVersion, sourceHash: actualSourceHash, outputHash, outputAttachmentId: stored.attachmentId, outputAttachmentRowVersion: stored.rowVersion, outputVisibility: "PRIVATE", pageCount: rendered.pageCount, watermarkedPageCount: rendered.pageProofs.length, watermark: Object.freeze(structuredClone(watermark)), watermarkChecksum, manifestChecksum, renderedAt });
  }
}

function named(code: string, message: string): Error { const error = new Error(message); error.name = code; return error; }
