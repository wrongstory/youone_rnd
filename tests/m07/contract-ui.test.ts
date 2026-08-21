import { describe, expect, it } from "vitest";

import { vendorContractQuery } from "../../apps/web/src/app/contracts/query.js";
import { availableContractList, unavailableContractList } from "../../packages/ui/src/contract/public.js";

describe("M07 contract UI security boundary", () => {
  it("does not represent a missing query adapter as an empty contract list", async () => {
    await expect(vendorContractQuery().listSafe()).resolves.toEqual({
      availability: "UNAVAILABLE",
      items: [],
      reason: "QUERY_ADAPTER_NOT_CONFIGURED"
    });
    expect(unavailableContractList()).toEqual({
      availability: "UNAVAILABLE",
      items: [],
      message: "계약 조회 서비스가 아직 연결되지 않았습니다. 계약이 없다는 뜻이 아닙니다."
    });
  });

  it("copies only the list-safe contract projection", () => {
    const source = [{
      id: "contract-1",
      contractNo: "C-001",
      vendorName: "외주업체",
      state: "ACTIVE",
      projectCount: 1,
      currentVersionNo: 2
    }] as const;
    const view = availableContractList(source);

    expect(view.availability).toBe("AVAILABLE");
    expect(view.items).not.toBe(source);
    expect(view.items[0]).toEqual(source[0]);
    expect(view.items[0]).not.toHaveProperty("contractAmount");
    expect(view.items[0]).not.toHaveProperty("paymentTerms");
    expect(view.items[0]).not.toHaveProperty("internalEvaluation");
  });

  it("keeps finance detail behind a distinct unavailable query method", async () => {
    await expect(vendorContractQuery().getFinanceDetail("contract-1")).resolves.toEqual({
      availability: "UNAVAILABLE",
      detail: null,
      reason: "QUERY_ADAPTER_NOT_CONFIGURED"
    });
  });
});
