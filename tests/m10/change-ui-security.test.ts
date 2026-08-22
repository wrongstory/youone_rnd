import { describe, expect, it } from "vitest";

import {
  availableEngineeringChangeList,
  unavailableEngineeringChangeList
} from "../../packages/ui/src/change/public.js";

describe("M10 ECR/ECO UI security boundary", () => {
  it("does not represent a missing query adapter as an empty change list", () => {
    expect(unavailableEngineeringChangeList()).toEqual({
      availability: "UNAVAILABLE",
      items: [],
      message: "ECR/ECO 조회 서비스가 아직 연결되지 않았습니다. 변경 건이 없다는 뜻이 아닙니다."
    });
  });

  it("copies only the display-safe list projection", () => {
    const source = [{
      id: "ecr-1",
      ecrNo: "ECR-2026-004",
      ecoNo: "ECO-2026-002",
      state: "IMPLEMENTING",
      priority: "HIGH",
      title: "제어기 EMI 재검증 절차 변경",
      contractId: "contract-1",
      nextAction: "적용 증빙 제출"
    }] as const;
    const view = availableEngineeringChangeList(source);

    expect(view.availability).toBe("AVAILABLE");
    expect(view.items).not.toBe(source);
    expect(view.items[0]).toEqual(source[0]);
    expect(view.items[0]).not.toHaveProperty("contractAmount");
    expect(view.items[0]).not.toHaveProperty("approvalParticipants");
    expect(view.items[0]).not.toHaveProperty("legalReviewNotes");
    expect(view.items[0]).not.toHaveProperty("securityFindings");
  });
});
