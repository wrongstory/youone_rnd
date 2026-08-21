import { describe, expect, it } from "vitest";

import { inspectionQuery } from "../../apps/web/src/app/inspections/query.js";
import { availableInspectionList, unavailableInspectionList } from "../../packages/ui/src/inspection/public.js";

describe("M08 inspection UI security boundary", () => {
  it("does not represent a missing query adapter as an empty inspection list", async () => {
    await expect(inspectionQuery().listMineExternal()).resolves.toEqual({
      availability: "UNAVAILABLE",
      items: [],
      reason: "QUERY_ADAPTER_NOT_CONFIGURED"
    });
    expect(unavailableInspectionList()).toEqual({
      availability: "UNAVAILABLE",
      items: [],
      message: "검수 조회 서비스가 아직 연결되지 않았습니다. 검수 건이 없다는 뜻이 아닙니다."
    });
  });

  it("copies only the external inspection projection", () => {
    const source = [{
      id: "inspection-1",
      inspectionNo: "I-001",
      inspectionTypeCode: "DELIVERABLE",
      state: "DECISION_PENDING",
      contractId: "contract-1",
      deliverableVersionId: "deliverable-version-1",
      latestExternalDisposition: "CONDITIONAL_ACCEPTANCE"
    }] as const;
    const view = availableInspectionList(source);

    expect(view.availability).toBe("AVAILABLE");
    expect(view.items).not.toBe(source);
    expect(view.items[0]).toEqual(source[0]);
    expect(view.items[0]).not.toHaveProperty("internalOpinion");
    expect(view.items[0]).not.toHaveProperty("contractAmount");
    expect(view.items[0]).not.toHaveProperty("paymentRate");
    expect(view.items[0]).not.toHaveProperty("approvalInstanceId");
  });

  it("keeps internal detail behind a distinct unavailable query method", async () => {
    await expect(inspectionQuery().getInternalDetail("inspection-1")).resolves.toEqual({
      availability: "UNAVAILABLE",
      detail: null,
      reason: "QUERY_ADAPTER_NOT_CONFIGURED"
    });
  });
});
