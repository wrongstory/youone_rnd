import { describe, expect, it } from "vitest";
import { sha256, stableCode, utcInstant, uuid, version, type Sha256 } from "../../packages/shared-kernel/src/public.js";
import type { CompletedControlledCopyApproval, ControlledCopyRequestSnapshot, PerPageWatermark } from "../../packages/features/tech-copy/src/public.js";
import { GenericControlledCopyPdfRenderer, type PdfCompositionEnginePort } from "../../packages/infrastructure/pdf-renderer/src/public.js";

const u = (n: number) => uuid(`14200000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const d = (n: number): Sha256 => sha256((n % 16).toString(16).repeat(64));
const at = utcInstant("2026-08-22T10:00:00Z");
const request: ControlledCopyRequestSnapshot = { technicalDocumentCopyId: u(1), copyNo: "TC-2026-000100", document: { documentId: u(2), documentVersionId: u(3), versionNo: 2, state: "APPROVED", securityLevel: "L4", projectId: u(4), contractId: u(5), sealedSnapshotChecksum: d(1), sealedAt: utcInstant("2026-08-22T01:00:00Z"), approvedAt: utcInstant("2026-08-22T02:00:00Z"), sourceAttachmentId: u(6), sourceAttachmentRowVersion: version(2), sourceHash: d(2) }, recipient: { recipientUserId: u(7), recipientDisplayName: "홍길동", vendorId: u(8), vendorDisplayName: "한성정밀" }, initialScope: { action: "REQUEST", recipientUserId: u(7), vendorId: u(8), projectId: u(4), contractId: u(5), vendorMembershipId: u(9), vendorMembershipVersion: version(1), projectGrantId: u(10), projectGrantVersion: version(1), contractGrantId: u(11), contractGrantVersion: version(1), evaluatedAt: utcInstant("2026-08-22T03:00:00Z"), validUntil: utcInstant("2026-08-22T23:00:00Z"), evidenceIds: [u(9), u(10), u(11)], snapshotChecksum: d(3) }, purpose: "핵심 설계 검토", purposeCode: stableCode("PURPOSE_CORE_DESIGN_REVIEW"), purposeHash: d(4), returnOrDestructionDueAt: utcInstant("2026-08-22T20:00:00Z"), requestedByUserId: u(12), requestedAt: utcInstant("2026-08-22T03:00:00Z"), requestVersion: version(1), requestChecksum: d(5), requestSealedAt: utcInstant("2026-08-22T03:00:00Z") };
const approval: CompletedControlledCopyApproval = { approvalInstanceId: u(13), approvalInstanceVersion: version(6), state: "COMPLETED", subjectKind: "TECHNICAL_DOCUMENT_COPY_REQUEST", technicalDocumentCopyId: request.technicalDocumentCopyId, requestVersion: request.requestVersion, requestChecksum: request.requestChecksum, requestSealedAt: request.requestSealedAt, documentVersionId: request.document.documentVersionId, documentVersionNo: request.document.versionNo, documentChecksum: request.document.sealedSnapshotChecksum, documentSealedAt: request.document.sealedAt, recipientUserId: request.recipient.recipientUserId, vendorId: request.recipient.vendorId, purposeHash: request.purposeHash, completedAt: utcInstant("2026-08-22T06:00:00Z"), terminalActionId: u(14), steps: [] };
const watermark: PerPageWatermark = { recipientDisplayName: "홍길동", vendorDisplayName: "한성정밀", projectId: request.document.projectId, copyNo: request.copyNo, securityLevel: "L4", issuerUserId: u(12), issuerDisplayName: "김도윤", printedAt: utcInstant("2026-08-22T11:00:00Z"), purpose: request.purpose, redistributionProhibition: "무단복제·재배포 금지" };
const sourceBytes = new Uint8Array([1, 2, 3]), outputBytes = new Uint8Array([4, 5, 6]);

function renderer(overrides: { sourceHash?: Sha256; engine?: PdfCompositionEnginePort; visibility?: "PRIVATE" | "PUBLIC" } = {}) {
  let canonicalCalls = 0;
  const engine: PdfCompositionEnginePort = overrides.engine ?? { renderEveryPage: async ({ watermarkChecksum }) => ({ outputPdf: outputBytes, pageCount: 3, pageProofs: [1, 2, 3].map((pageNo) => ({ pageNo, watermarkChecksum })) }) };
  return new GenericControlledCopyPdfRenderer({ source: { readExactPrivate: async () => sourceBytes }, hash: { sha256Bytes: async (bytes) => bytes === sourceBytes ? overrides.sourceHash ?? request.document.sourceHash : d(6), sha256Canonical: async () => { canonicalCalls += 1; return canonicalCalls === 1 ? d(7) : d(8); } }, engine, output: { storePrivate: async () => ({ attachmentId: u(20), rowVersion: version(1), visibility: (overrides.visibility ?? "PRIVATE") as "PRIVATE" }) }, clock: { now: () => at }, rendererId: stableCode("GENERIC_CONTROLLED_COPY_PDF"), rendererVersion: stableCode("V1.0.0") });
}

describe("M14 generic controlled-copy PDF renderer", () => {
  it("verifies the exact source and proves the same watermark on every page before private storage", async () => {
    const result = await renderer().render({ request, watermark, approval });
    expect(result).toMatchObject({ sourceHash: request.document.sourceHash, outputHash: d(6), pageCount: 3, watermarkedPageCount: 3, outputVisibility: "PRIVATE", watermarkChecksum: d(7), manifestChecksum: d(8), rendererId: "GENERIC_CONTROLLED_COPY_PDF", rendererVersion: "V1.0.0" });
    expect(result.watermark).toMatchObject({ recipientDisplayName: "홍길동", vendorDisplayName: "한성정밀", copyNo: request.copyNo, securityLevel: "L4", redistributionProhibition: "무단복제·재배포 금지" });
  });
  it("rejects changed source bytes before rendering", async () => { await expect(renderer({ sourceHash: d(9) }).render({ request, watermark, approval })).rejects.toThrow(/Source bytes/); });
  it("rejects a missing or differently-watermarked page", async () => {
    const engine: PdfCompositionEnginePort = { renderEveryPage: async ({ watermarkChecksum }) => ({ outputPdf: outputBytes, pageCount: 3, pageProofs: [{ pageNo: 1, watermarkChecksum }, { pageNo: 3, watermarkChecksum }] }) };
    await expect(renderer({ engine }).render({ request, watermark, approval })).rejects.toThrow(/every sequential page/);
  });
  it("rejects public output and an unrelated completed approval", async () => {
    await expect(renderer({ visibility: "PUBLIC" }).render({ request, watermark, approval })).rejects.toThrow(/remain private/);
    await expect(renderer().render({ request, watermark, approval: { ...approval, requestChecksum: d(10) } })).rejects.toThrow(/exact request/);
  });
});
