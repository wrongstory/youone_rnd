import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("P0 operational frontend issue 59", () => {
  it("provides standalone login, TOTP, recovery and expired-session routes", () => {
    const shell = read("apps/web/src/interface/app-shell.tsx");
    const login = read("apps/web/src/app/login/page.tsx");
    const forms = read("apps/web/src/interface/operational-forms.tsx");

    expect(shell).toContain("isPublicEntryPath(pathname)");
    expect(shell).toContain('pathname.startsWith("/auth/")');
    expect(login).toContain("LoginPreviewForm");
    expect(forms).toContain('autoComplete="username"');
    expect(forms).toContain('autoComplete="one-time-code"');
    expect(forms).toContain("실제 factor 검증은 수행하지 않았습니다.");
    expect(forms).toContain("Backend #58 연결 후 로그인");
    expect(forms).not.toContain("@supabase/");
    expect(forms).not.toContain("fetch(");
  });

  it("adds the approved system-management information architecture without a generic role editor", () => {
    const navigation = read("apps/web/src/interface/app-navigation.ts");
    const access = read("apps/web/src/app/settings/access/page.tsx");

    for (const route of ["/settings/users", "/settings/vendors", "/settings/organization", "/settings/access", "/settings/security", "/settings/audit"]) {
      expect(navigation).toContain(route);
    }
    expect(access).toContain("범용 역할 편집기는 제공하지 않습니다.");
    expect(access).toContain("Admin-System은 L3/L4 원문 자동 열람권을 얻지 않으며");
  });

  it("provides project creation and a full workspace while keeping formal designation separate", () => {
    const projectForm = read("apps/web/src/interface/operational-forms.tsx");
    const navigation = read("apps/web/src/interface/operational-ui.tsx");
    const detail = read("apps/web/src/app/projects/[projectId]/page.tsx");
    const formalApplication = read("apps/web/src/app/projects/[projectId]/formal-research-applications/new/page.tsx");

    expect(projectForm).toContain("정식 연구과제 여부는 여기에서 선택하지 않습니다.");
    expect(projectForm).toContain("현재 로그인 사용자 · 서버 확정");
    expect(navigation).toContain('segment: "/wbs"');
    expect(navigation).toContain('segment: "/members"');
    expect(navigation).toContain('segment: "/links"');
    expect(navigation).toContain('segment: "/history"');
    expect(detail).toContain("정식 연구과제 신청");
    expect(formalApplication).toContain("일반 프로젝트와 분리된 신청 버전");
    expect(projectForm).toContain("별도 불변 신청본");
    expect(projectForm).toContain("연구소장 검토·동의 완료 후에만");
    expect(projectForm).not.toContain("대표 결재");
    expect(projectForm).not.toContain("선임 결재");
  });

  it("keeps backend-dependent mutations visibly fail-closed", () => {
    const forms = read("apps/web/src/interface/operational-forms.tsx");
    const overlays = read("apps/web/src/interface/app-overlays.tsx");
    const styles = read("apps/web/src/app/styles.css");

    expect(forms.match(/pendingFormButton/g)?.length).toBeGreaterThanOrEqual(5);
    expect(forms).toContain("실제 Project는 생성하지 않았습니다.");
    expect(forms).toContain("봉인·상신 또는 지정 기록은 생성하지 않았습니다.");
    expect(overlays).toContain("운영 인증 후 실행");
    expect(styles).toContain("P0 operational frontend");
  });

  it("does not introduce P1-only navigation", () => {
    const navigation = read("apps/web/src/interface/app-navigation.ts");
    expect(navigation).not.toContain("/bom");
    expect(navigation).not.toContain("/equipment");
    expect(navigation).not.toContain("/allowances");
    expect(navigation).not.toContain("/search");
  });
});
