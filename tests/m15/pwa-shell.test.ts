import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../../apps/web/src/app/manifest.js";
import { POST as syncCommands } from "../../apps/web/src/app/api/v1/sync/commands/route.js";

const root = resolve(import.meta.dirname, "../..");

describe("M15 installable PWA shell", () => {
  it("publishes a standalone Korean manifest with regular and maskable icons", () => {
    const value = manifest();
    expect(value).toMatchObject({ start_url: "/", display: "standalone", lang: "ko", theme_color: "#0f4c5c" });
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ purpose: "any" }),
      expect.objectContaining({ purpose: "maskable" })
    ]));
  });

  it("never caches API responses and falls back only to the public offline shell", () => {
    const serviceWorker = readFileSync(resolve(root, "apps/web/public/sw.js"), "utf8");
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain('caches.match("/offline.html")');
    expect(serviceWorker).not.toMatch(/cache\.put\([^\n]*(?:api|technical-copies|documents|approvals)/i);
  });

  it("explains the allowlist, online-only boundary, and no-auto-overwrite policy", () => {
    const page = readFileSync(resolve(root, "apps/web/src/app/offline-sync/page.tsx"), "utf8");
    expect(page).toContain("체크리스트·검수 초안");
    expect(page).toContain("결재 및 권한·Scope 변경");
    expect(page).toContain("자동 병합 없음");
    expect(page).toContain("서버본 유지·로컬 폐기");
    expect(page).toContain("서버 v4 기준 새 변경 작성");
    expect(page).not.toContain("자동 병합 실행");
  });

  it("keeps the trusted sync route fail-closed until live request adapters are composed", async () => {
    const response = await syncCommands(new Request("http://localhost/api/v1/sync/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorUserId: "caller-controlled" })
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ result: "UNAVAILABLE", reason: "SYNC_REQUEST_ADAPTER_NOT_CONFIGURED" });
  });
});
