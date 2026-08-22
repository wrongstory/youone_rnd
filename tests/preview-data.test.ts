import { describe, expect, it } from "vitest";

import { approvalInboxQuery } from "../apps/web/src/app/approvals/query.js";
import { vendorContractQuery } from "../apps/web/src/app/contracts/query.js";
import { documentQuery } from "../apps/web/src/app/documents/query.js";
import { engineeringChangeQuery } from "../apps/web/src/app/engineering-changes/query.js";
import { inspectionQuery } from "../apps/web/src/app/inspections/query.js";
import { ncrCarQuery } from "../apps/web/src/app/non-conformances/query.js";
import { projectQuery } from "../apps/web/src/app/projects/query.js";
import { PREVIEW_IDS } from "../apps/web/src/composition/preview-data.js";

describe("explicit screen-review preview data", () => {
  it("keeps the default adapter fail-closed", async () => {
    expect(await approvalInboxQuery(false).listMine()).toMatchObject({ availability: "UNAVAILABLE", items: [] });
    expect(await documentQuery(false).listMine()).toMatchObject({ availability: "UNAVAILABLE", items: [] });
    expect(await projectQuery(false).listMine()).toMatchObject({ availability: "UNAVAILABLE", items: [] });
    expect(await vendorContractQuery(false).listSafe()).toMatchObject({ availability: "UNAVAILABLE", items: [] });
    expect(await inspectionQuery(false).listMineExternal()).toMatchObject({ availability: "UNAVAILABLE", items: [] });
    expect(await ncrCarQuery(false).listMineExternal()).toMatchObject({ availability: "UNAVAILABLE", items: [] });
    expect(await engineeringChangeQuery(false).listMineExternal()).toMatchObject({ availability: "UNAVAILABLE", items: [] });
  });

  it("provides linked list and detail records only when preview is explicit", async () => {
    const approvals = await approvalInboxQuery(true).listMine();
    const documents = await documentQuery(true).listMine();
    const projects = await projectQuery(true).listMine();
    const contracts = await vendorContractQuery(true).listSafe();
    const inspections = await inspectionQuery(true).listMineExternal();
    const ncrs = await ncrCarQuery(true).listMineExternal();
    const changes = await engineeringChangeQuery(true).listMineExternal();

    expect(approvals.availability === "AVAILABLE" && approvals.items).toHaveLength(2);
    expect(documents.availability === "AVAILABLE" && documents.items).toHaveLength(3);
    expect(projects.availability === "AVAILABLE" && projects.items).toHaveLength(2);
    expect(contracts.availability === "AVAILABLE" && contracts.items).toHaveLength(2);
    expect(inspections.availability === "AVAILABLE" && inspections.items).toHaveLength(2);
    expect(ncrs.availability === "AVAILABLE" && ncrs.items).toHaveLength(2);
    expect(changes.availability === "AVAILABLE" && changes.items).toHaveLength(2);

    expect(await projectQuery(true).getMine(PREVIEW_IDS.projectBattery)).toMatchObject({ availability: "AVAILABLE", detail: { formalResearch: true, wbs: expect.any(Array) } });
    expect(await inspectionQuery(true).getMineExternal(PREVIEW_IDS.inspectionController)).toMatchObject({ availability: "AVAILABLE", detail: { latestExternalDisposition: "CONDITIONAL_ACCEPTANCE" } });
    expect(await ncrCarQuery(true).getMineExternal(PREVIEW_IDS.ncrController)).toMatchObject({ availability: "AVAILABLE", detail: { assignedCars: expect.any(Array) } });
    expect(await engineeringChangeQuery(true).getMineExternal(PREVIEW_IDS.changeController)).toMatchObject({ availability: "AVAILABLE", detail: { ecoState: "IMPLEMENTING", exactTargetDisplayRefs: expect.any(Array) } });
  });

  it("keeps vendor list previews free from finance and internal-review fields", async () => {
    const contracts = await vendorContractQuery(true).listSafe();
    const ncrs = await ncrCarQuery(true).listMineExternal();
    const changes = await engineeringChangeQuery(true).listMineExternal();
    if (contracts.availability !== "AVAILABLE" || ncrs.availability !== "AVAILABLE" || changes.availability !== "AVAILABLE") throw new Error("preview records missing");

    expect(JSON.stringify(contracts.items)).not.toMatch(/amount|payment|internalEvaluation/i);
    expect(JSON.stringify(ncrs.items)).not.toMatch(/responsibilityHistory|approval|payment|amount/i);
    expect(JSON.stringify(changes.items)).not.toMatch(/approvalParticipants|contractAmount|legalNotes|securityFindings|internalNotes/i);
  });

  it("labels L3 preview content with controlled-copy restrictions", async () => {
    const detail = await documentQuery(true).getMine("f0000000-0000-4000-8000-000000000002");
    expect(detail).toMatchObject({
      availability: "AVAILABLE",
      detail: {
        securityLevel: "L3",
        accessNote: expect.stringContaining("워터마크 통제본")
      }
    });
  });
});
