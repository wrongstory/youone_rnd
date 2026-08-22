import { describe, expect, it } from "vitest";

import { purchaseQuery } from "../../apps/web/src/app/purchases/query.js";
import { rndQuery } from "../../apps/web/src/app/rnd-programs/query.js";
import { PREVIEW_IDS } from "../../apps/web/src/composition/preview-data.js";
import { FailClosedRndLifecycleCommandPort } from "../../packages/features/rnd/src/public.js";

describe("M11 preview query security", () => {
  it("fails closed when the explicit preview flag is absent", async () => {
    await expect(purchaseQuery(false).listMine()).resolves.toEqual({
      availability: "UNAVAILABLE",
      items: [],
      reason: "QUERY_ADAPTER_NOT_CONFIGURED"
    });
    await expect(rndQuery(false).listInternalSummaries()).resolves.toEqual({
      availability: "UNAVAILABLE",
      items: [],
      reason: "QUERY_ADAPTER_NOT_CONFIGURED"
    });
  });

  it("provides linked purchase and R&D examples only in preview mode", async () => {
    await expect(purchaseQuery(true).getMine(PREVIEW_IDS.purchaseThermalCamera)).resolves.toMatchObject({
      availability: "AVAILABLE",
      detail: { requestNo: "PUR-2026-034", inspectionStatus: "PENDING" }
    });
    await expect(rndQuery(true).getInternalSummary(PREVIEW_IDS.rndCooling)).resolves.toMatchObject({
      availability: "AVAILABLE",
      summary: { programCode: "RND-GOV-2026-02", budget: { executionRate: "38.03" } }
    });
  });

  it("never exposes transfer, accounting, or RCMS capabilities through preview DTOs", async () => {
    const purchases = await purchaseQuery(true).listMine();
    const rnd = await rndQuery(true).listInternalSummaries();
    const serialized = JSON.stringify({ purchases, rnd });

    expect(serialized).not.toMatch(/paymentInstruction|accountingJournal|bankTransfer|rcmsWorkflow/i);
  });

  it("hard-denies vendor R&D queries and undefined lifecycle commands", async () => {
    await expect(rndQuery(true).getVendorSummary(PREVIEW_IDS.rndCooling)).resolves.toEqual({
      availability: "FORBIDDEN",
      summary: null
    });
    await expect(new FailClosedRndLifecycleCommandPort().execute({
      rndProgramId: PREVIEW_IDS.rndCooling,
      requestedCommand: "CLOSE"
    })).resolves.toMatchObject({ availability: "BLOCKED", reason: "OD-030-RND-STATE-MACHINE" });
  });
});
