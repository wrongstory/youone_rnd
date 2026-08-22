import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { previewSafetyIncidents, previewSafetyInspections } from "../../apps/web/src/composition/preview-data.js";
import { GET as getSafetyDashboard } from "../../apps/web/src/app/api/safety/route.js";
import { projectSafetyIncidentInternal, projectSafetyIncidentVendor, projectSafetyInspectionInternal, projectSafetyInspectionVendor, safetyQuery, type SafetyIncidentProjectionSource, type SafetyInspectionProjectionSource, type SafetyVendorContext } from "../../apps/web/src/app/safety/query.js";

const originalPreview = process.env.YOUONE_PREVIEW_DATA;
afterEach(() => { if (originalPreview === undefined) delete process.env.YOUONE_PREVIEW_DATA; else process.env.YOUONE_PREVIEW_DATA = originalPreview; });

const exactVendor: SafetyVendorContext = { vendorId: "vendor-hanseong", activeMembership: true, exactProjectScope: true, exactContractScope: true, assignedTaskIds: ["safety-task-vendor-cable", "safety-task-vendor-torque"] };

describe("M13 safety UI/API security projection", () => {
  it("fails closed with UNAVAILABLE and private no-store when the query adapter is not configured", async () => {
    delete process.env.YOUONE_PREVIEW_DATA;
    await expect(safetyQuery(false).getInternalDashboard()).resolves.toEqual({ availability: "UNAVAILABLE", dashboard: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" });
    const response = await getSafetyDashboard();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ availability: "UNAVAILABLE", dashboard: null });
  });

  it("uses explicit internal allowlists and never projects security original references", () => {
    const inspection = projectSafetyInspectionInternal(previewSafetyInspections[0] as SafetyInspectionProjectionSource);
    const incident = projectSafetyIncidentInternal(previewSafetyIncidents[0] as SafetyIncidentProjectionSource);
    expect(Object.keys(inspection)).not.toContain("securityOriginalReference");
    expect(Object.keys(incident)).not.toContain("securityOriginalReference");
    expect(Object.keys(incident)).not.toContain("personalTrainingDetails");
    expect(JSON.stringify(inspection)).not.toContain("private://");
    expect(JSON.stringify(incident)).not.toContain("private://");
  });

  it("denies Vendor without active exact project scope and requires exact Contract scope when a Contract is present", () => {
    const inspection = previewSafetyInspections[0] as SafetyInspectionProjectionSource;
    expect(projectSafetyInspectionVendor(inspection, { ...exactVendor, activeMembership: false })).toBeNull();
    expect(projectSafetyInspectionVendor(inspection, { ...exactVendor, exactProjectScope: false })).toBeNull();
    expect(projectSafetyInspectionVendor(inspection, { ...exactVendor, exactContractScope: false })).toBeNull();
    expect(projectSafetyInspectionVendor(inspection, { ...exactVendor, vendorId: "vendor-cross" })).toBeNull();
    expect(projectSafetyInspectionVendor({ ...inspection, contractId: undefined }, { ...exactVendor, exactContractScope: false })).not.toBeNull();
  });

  it("projects only applicable instructions and the Vendor's assigned task", () => {
    const inspection = projectSafetyInspectionVendor(previewSafetyInspections[0] as SafetyInspectionProjectionSource, exactVendor);
    const incident = projectSafetyIncidentVendor(previewSafetyIncidents[0] as SafetyIncidentProjectionSource, exactVendor);
    expect(inspection?.assignedTasks.map((task) => task.taskId)).toEqual(["safety-task-vendor-cable"]);
    expect(incident?.assignedTasks.map((task) => task.taskId)).toEqual(["safety-task-vendor-torque"]);
    for (const projection of [inspection, incident]) {
      expect(Object.keys(projection ?? {}).sort()).toEqual(["areaLabel", "assignedTasks", "instruction", "recordId", "recordKind", "recordNo", "state"].sort());
      const serialized = JSON.stringify(projection);
      expect(serialized).not.toContain("internalCauseAnalysis");
      expect(serialized).not.toContain("reporterDisplayName");
      expect(serialized).not.toContain("personalTrainingDetails");
      expect(serialized).not.toContain("private://");
    }
  });

  it("denies Admin-System automatic original access", async () => {
    await expect(safetyQuery(true).getAdminSystemOriginal(previewSafetyIncidents[0]!.incidentId)).resolves.toEqual({ availability: "FORBIDDEN", original: null, capability: "NONE" });
  });

  it("keeps P1 MSDS, waste and emergency-drill UI outside the Safety Light routes", () => {
    const root = process.cwd();
    const files = ["apps/web/src/app/safety/page.tsx", "apps/web/src/app/safety/inspections/[inspectionId]/page.tsx", "apps/web/src/app/safety/incidents/[incidentId]/page.tsx"];
    const source = files.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
    expect(source).not.toMatch(/MSDS|폐기물|emergency.?drill|비상훈련/i);
    expect(source).toContain("48시간");
  });
});
