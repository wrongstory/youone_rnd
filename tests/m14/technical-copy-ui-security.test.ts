import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET as getTechnicalCopy } from "../../apps/web/src/app/api/technical-copies/[technicalCopyId]/route.js";
import { GET as listTechnicalCopies } from "../../apps/web/src/app/api/technical-copies/route.js";
import { projectTechnicalCopyDetail, technicalCopyQuery, type TechnicalCopyProjectionSource } from "../../apps/web/src/app/technical-copies/query.js";
import { PREVIEW_IDS, previewTechnicalCopies } from "../../apps/web/src/composition/preview-data.js";

const originalPreview = process.env.YOUONE_PREVIEW_DATA;
afterEach(() => { if (originalPreview === undefined) delete process.env.YOUONE_PREVIEW_DATA; else process.env.YOUONE_PREVIEW_DATA = originalPreview; });

describe("M14 technical-copy UI/API security", () => {
  it("fails closed without the explicit preview flag", async () => {
    delete process.env.YOUONE_PREVIEW_DATA;
    await expect(technicalCopyQuery(false).listInternal()).resolves.toEqual({ availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" });
    const response = await listTechnicalCopies();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("shows L4 approval lock, L3 handover, and overdue reprint examples", async () => {
    await expect(technicalCopyQuery(true).getInternal(PREVIEW_IDS.technicalCopyL4Pending)).resolves.toMatchObject({ availability: "AVAILABLE", detail: { state: "APPROVAL_PENDING", securityLevel: "L4", copyNo: null, watermark: null, approvalSteps: [{ role: "LAB_DIRECTOR", outcome: "APPROVED" }, { role: "REPRESENTATIVE", outcome: "PENDING" }] } });
    await expect(technicalCopyQuery(true).getInternal(PREVIEW_IDS.technicalCopyL3HandedOver)).resolves.toMatchObject({ availability: "AVAILABLE", detail: { state: "HANDED_OVER", copyNo: "TC-2026-014", pageCount: 12, watermark: { copyNo: "TC-2026-014" } } });
    await expect(technicalCopyQuery(true).getInternal(PREVIEW_IDS.technicalCopyL3Overdue)).resolves.toMatchObject({ availability: "AVAILABLE", detail: { state: "OVERDUE", copyNo: "TC-2026-011", reprintOfCopyId: expect.any(String), reprintReason: expect.any(String) } });
  });

  it("uses explicit projections that remove source, storage, credential, URL, and PDF bytes", () => {
    const source = previewTechnicalCopies[1] as TechnicalCopyProjectionSource;
    const projected = projectTechnicalCopyDetail(source);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toMatch(/sourceObjectKey|renderedObjectKey|sourceContent|rendererCredential|publicUrl|signedUrl|renderedPdfBytes|private\//);
    expect(projected).toMatchObject({ documentVersionId: "document-cooling-process-v5", approvalInstanceId: "approval-tech-copy-l3-14" });
  });

  it("hard-denies Vendor and Admin-System source access", async () => {
    const query = technicalCopyQuery(true);
    await expect(query.listVendor()).resolves.toEqual({ availability: "FORBIDDEN", items: [] });
    await expect(query.getVendor(PREVIEW_IDS.technicalCopyL3HandedOver)).resolves.toEqual({ availability: "FORBIDDEN", detail: null });
    await expect(query.getAdminSystemSource(PREVIEW_IDS.technicalCopyL3HandedOver)).resolves.toEqual({ availability: "FORBIDDEN", source: null, capability: "NONE" });
  });

  it("exposes only internal read APIs and no render, download, or self-print route", () => {
    const apiRoot = join(process.cwd(), "apps/web/src/app/api/technical-copies");
    for (const forbidden of ["render", "download", "self-print", "source"]) {
      expect(existsSync(join(apiRoot, forbidden, "route.ts"))).toBe(false);
    }
  });

  it("returns private no-store projections and awaits Promise params", async () => {
    process.env.YOUONE_PREVIEW_DATA = "enabled";
    const listResponse = await listTechnicalCopies();
    const detailResponse = await getTechnicalCopy(new Request(`http://localhost/api/technical-copies/${PREVIEW_IDS.technicalCopyL3HandedOver}`), { params: Promise.resolve({ technicalCopyId: PREVIEW_IDS.technicalCopyL3HandedOver }) });
    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.stringify(await detailResponse.json())).not.toMatch(/sourceObjectKey|renderedObjectKey|publicUrl|signedUrl|renderedPdfBytes/);
  });
});
