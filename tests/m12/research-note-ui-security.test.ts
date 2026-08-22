import { describe, expect, it } from "vitest";

import { GET as getResearchNote } from "../../apps/web/src/app/api/research-notes/[researchNoteId]/route.js";
import { GET as listResearchNotes } from "../../apps/web/src/app/api/research-notes/route.js";
import { projectResearchNoteDetail, researchNoteQuery, type ResearchNoteProjectionSource } from "../../apps/web/src/app/research-notes/query.js";
import { PREVIEW_IDS, previewResearchNotes } from "../../apps/web/src/composition/preview-data.js";

describe("M12 ResearchNote UI/API security", () => {
  it("fails closed when the explicit preview flag is absent", async () => {
    await expect(researchNoteQuery(false).listInternal()).resolves.toEqual({ availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" });
    await expect(researchNoteQuery(false).getInternal(PREVIEW_IDS.researchNoteSeniorReview)).resolves.toEqual({ availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" });
  });

  it("shows one optional Senior-review path and one finalized skip/correction chain", async () => {
    await expect(researchNoteQuery(true).getInternal(PREVIEW_IDS.researchNoteSeniorReview)).resolves.toMatchObject({ availability: "AVAILABLE", detail: { state: "DIRECTOR_FINALIZATION_PENDING", seniorReviewPath: "COMPLETED", seniorReview: { officialApproval: false }, pdfEvidence: null } });
    await expect(researchNoteQuery(true).getInternal(PREVIEW_IDS.researchNoteFinalized)).resolves.toMatchObject({ availability: "AVAILABLE", detail: { state: "CORRECTED_BY_ADDENDUM", seniorReviewPath: "SKIPPED_BY_POLICY", directorFinalization: { finalizedVersion: 1, representativeApprovalIncluded: false }, correctionChain: [{ kind: "CORRECTION", correctsEntryId: "rn-38-entry-1" }], pdfEvidence: { deliveryRestriction: "ORIGINAL_DENIED" } } });
  });

  it("hard-denies Vendor and gives Admin-System no original-content capability", async () => {
    const query = researchNoteQuery(true);
    await expect(query.listVendor()).resolves.toEqual({ availability: "FORBIDDEN", items: [] });
    await expect(query.getVendor(PREVIEW_IDS.researchNoteFinalized)).resolves.toEqual({ availability: "FORBIDDEN", detail: null });
    await expect(query.getAdminSystemOriginalContent(PREVIEW_IDS.researchNoteFinalized)).resolves.toEqual({ availability: "FORBIDDEN", content: null, capability: "NONE" });
  });

  it("uses an explicit allowlist projector that removes source, storage and delivery secrets", () => {
    const source = previewResearchNotes[1] as ResearchNoteProjectionSource;
    const malicious = { ...source, sourceContent: "연구 원문", editorContent: { blocks: ["secret"] }, privateStoragePath: "private/research-note.pdf", storageToken: "secret-token", publicUrl: "https://public.invalid/file", signedUrl: "https://signed.invalid/file", adminSystemContentCapability: "READ_ALL" };
    const projected = projectResearchNoteDetail(malicious);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toMatch(/sourceContent|editorContent|privateStoragePath|storageToken|publicUrl|signedUrl|adminSystemContentCapability/);
    expect(projected.pdfEvidence).toMatchObject({ delivery: "AUTHORIZED_PRIVATE_DELIVERY", deliveryRestriction: "ORIGINAL_DENIED" });
  });

  it("returns no-store API projections and awaits Promise params", async () => {
    const previous = process.env.YOUONE_PREVIEW_DATA;
    process.env.YOUONE_PREVIEW_DATA = "1";
    try {
      const listResponse = await listResearchNotes();
      const detailResponse = await getResearchNote(new Request(`http://localhost/api/research-notes/${PREVIEW_IDS.researchNoteFinalized}`), { params: Promise.resolve({ researchNoteId: PREVIEW_IDS.researchNoteFinalized }) });
      expect(listResponse.status).toBe(200); expect(detailResponse.status).toBe(200);
      expect(listResponse.headers.get("Cache-Control")).toBe("private, no-store"); expect(detailResponse.headers.get("Cache-Control")).toBe("private, no-store");
      const payload = JSON.stringify(await detailResponse.json());
      expect(payload).not.toMatch(/privateStoragePath|storageToken|publicUrl|signedUrl|sourceContent|editorContent/);
    } finally {
      if (previous === undefined) delete process.env.YOUONE_PREVIEW_DATA; else process.env.YOUONE_PREVIEW_DATA = previous;
    }
  });
});
