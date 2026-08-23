import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("P0 mobile-first application shell", () => {
  it("keeps the approved mobile primary navigation and hierarchical approval routes", () => {
    const navigation = read("apps/web/src/interface/app-navigation.ts");
    expect(navigation).toContain('{ href: "/", label: "대시보드" }');
    expect(navigation).toContain('{ href: "/approvals", label: "결재" }');
    expect(navigation).toContain('{ href: "/projects", label: "프로젝트" }');
    expect(navigation).toContain('{ href: "/documents", label: "문서" }');
    expect(navigation).toContain('/approvals/submitted');
    expect(navigation).toContain('/approvals/completed');
    expect(navigation).toContain('/settings/approval');
  });

  it("uses the same route information architecture for mobile drawer and desktop sidebar", () => {
    const shell = read("apps/web/src/interface/app-shell.tsx");
    expect(shell).toContain("<HierarchicalNavigation pathname={pathname}");
    expect(shell.match(/<HierarchicalNavigation/g)).toHaveLength(2);
    expect(shell).toContain('aria-label="주요 메뉴"');
    expect(shell).toContain('aria-label="전체 업무 메뉴"');
  });

  it("keeps dashboard preview data explicit and live data fail-closed", () => {
    const dashboard = read("apps/web/src/app/page.tsx");
    expect(dashboard).toContain("previewDataEnabled()");
    expect(dashboard).toContain("업무 데이터 연결 대기");
    expect(dashboard).toContain("실제 조회 어댑터가 준비되기 전에는 건수를 추정하지 않습니다.");
  });

  it("does not expose versioned approval policy editing before command authorization exists", () => {
    const settings = read("apps/web/src/app/settings/approval/page.tsx");
    expect(settings).toContain("게시된 결재정책은 덮어쓰지 않습니다.");
    expect(settings).toContain("Command Adapter가 결합된 뒤 열립니다.");
    expect(settings).not.toContain("저장하기");
  });
});
