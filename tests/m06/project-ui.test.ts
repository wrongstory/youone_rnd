import { describe, expect, it } from "vitest";

import { projectQuery } from "../../apps/web/src/app/projects/query.js";
import { availableProjectList, unavailableProjectList } from "../../packages/ui/src/project/public.js";

describe("M06 project UI boundary", () => {
  it("does not represent a missing query adapter as an empty project list", async () => {
    await expect(projectQuery().listMine()).resolves.toEqual({
      availability: "UNAVAILABLE",
      items: [],
      reason: "QUERY_ADAPTER_NOT_CONFIGURED"
    });
    expect(unavailableProjectList()).toEqual({
      availability: "UNAVAILABLE",
      items: [],
      message: "프로젝트 조회 서비스가 아직 연결되지 않았습니다. 프로젝트가 없다는 뜻이 아닙니다."
    });
  });

  it("copies available list projections before exposing them to the interface", () => {
    const source = [{ id: "project-1", projectCode: "P-001", title: "시험 프로젝트", state: "DRAFT", formalResearch: false }] as const;
    const view = availableProjectList(source);
    expect(view.availability).toBe("AVAILABLE");
    expect(view.items).not.toBe(source);
  });
});
