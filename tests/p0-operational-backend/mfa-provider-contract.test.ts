import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "../../packages/infrastructure/supabase-auth/src/operational.ts"),
  "utf8"
);

describe("B01 Supabase MFA provider contract", () => {
  it("uses only verified TOTP factors as login challenge candidates", () => {
    expect(source).toContain('factor.status === "verified"');
    expect(source).toMatch(/data\.totp[\s\S]*\.filter\(\(factor\) => factor\.status === "verified"\)[\s\S]*\.map\(\(factor\) => Object\.freeze\(\{ id: factor\.id \}\)\)/);
  });
});
