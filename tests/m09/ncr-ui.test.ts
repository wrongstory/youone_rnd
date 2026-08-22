import { describe, expect, it } from "vitest";

import { ncrCarQuery } from "../../apps/web/src/app/non-conformances/query.js";
import {
  availableNonConformanceList,
  unavailableNonConformanceList
} from "../../packages/ui/src/nonconformance/public.js";

describe("M09 NCR/CAR UI security boundary", () => {
  it("does not represent a missing query adapter as an empty NCR list", async () => {
    await expect(ncrCarQuery().listMineExternal()).resolves.toEqual({
      availability: "UNAVAILABLE",
      items: [],
      reason: "QUERY_ADAPTER_NOT_CONFIGURED"
    });
    expect(unavailableNonConformanceList()).toEqual({
      availability: "UNAVAILABLE",
      items: [],
      message: "NCR/CAR 조회 서비스가 아직 연결되지 않았습니다. 부적합 건이 없다는 뜻이 아닙니다."
    });
  });

  it("copies only the Vendor-safe list projection", () => {
    const source = [{
      id: "ncr-1",
      ncrNo: "NCR-001",
      severity: "MAJOR",
      state: "ACTION_PLAN_REVIEW",
      contractId: "contract-1",
      deliverableVersionId: "deliverable-version-1",
      dueAt: "2026-08-31T00:00:00Z"
    }] as const;
    const view = availableNonConformanceList(source);

    expect(view.availability).toBe("AVAILABLE");
    expect(view.items).not.toBe(source);
    expect(view.items[0]).toEqual(source[0]);
    expect(view.items[0]).not.toHaveProperty("responsibilityHistory");
    expect(view.items[0]).not.toHaveProperty("contractAmount");
    expect(view.items[0]).not.toHaveProperty("paymentRate");
    expect(view.items[0]).not.toHaveProperty("approvalInstanceId");
    expect(view.items[0]).not.toHaveProperty("internalNotes");
  });

  it("keeps internal detail behind a distinct unavailable query method", async () => {
    await expect(ncrCarQuery().getInternalDetail("ncr-1")).resolves.toEqual({
      availability: "UNAVAILABLE",
      detail: null,
      reason: "QUERY_ADAPTER_NOT_CONFIGURED"
    });
  });
});
