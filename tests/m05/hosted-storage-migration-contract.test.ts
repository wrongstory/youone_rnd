import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../supabase/migrations/20260822000400_m05_document_file.sql"),
  "utf8"
);

describe("M05 hosted Supabase Storage migration contract", () => {
  it("does not mutate provider-owned storage.objects and fails closed on the hosted baseline", () => {
    expect(migration).toContain("PRIVATE_BUSINESS");
    expect(migration).toContain("public=false");
    expect(migration).toContain("c.relrowsecurity");
    expect(migration).toContain("has_table_privilege('youone_request','storage.objects','SELECT')");
    expect(migration).toContain("has_table_privilege('youone_privileged_writer','storage.objects','TRIGGER')");
    expect(migration).toContain("where polrelid='storage.objects'::regclass");
    expect(migration).toContain("clean Storage bootstrap requires provider default-deny policy baseline");
    expect(migration).not.toContain("alter table storage.objects enable row level security");
    expect(migration).not.toContain("revoke all on table storage.objects");
    expect(migration).not.toContain("create policy m05_private_business_");
    expect(migration).not.toContain("set role supabase_storage_admin");
    expect(migration).not.toContain("alter table storage.objects owner");
  });
});
