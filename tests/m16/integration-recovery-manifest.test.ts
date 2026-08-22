import { describe, expect, it } from "vitest";

import { createRecoveryManifest, verifyRestore } from "../../apps/worker/src/composition/recovery-manifest.js";

const digest = "a".repeat(64);
const storageDigest = "b".repeat(64);

describe("M16 recovery manifest", () => {
  it("binds the database dump and every private storage object to exact evidence", () => {
    const manifest = createRecoveryManifest({
      manifestVersion: 1,
      migrationHead: "20260823001500_m16_force_registry_rls.sql",
      database: { sizeBytes: 2048, sha256: digest },
      storage: [{ bucket: "private-business", objectKey: "org/document/version.pdf", sizeBytes: 512, sha256: storageDigest }],
      storageObjectCount: 1,
      completedAt: "2026-08-23T10:00:00Z"
    });

    expect(() => verifyRestore(manifest, {
      migrationHead: manifest.migrationHead,
      databaseSha256: digest,
      storage: manifest.storage
    })).not.toThrow();
    expect(Object.isFrozen(manifest.storage)).toBe(true);
    expect(Object.isFrozen(manifest.storage[0])).toBe(true);
  });

  it("rejects public URLs, traversal, duplicates, count drift and hash drift", () => {
    const base = {
      manifestVersion: 1 as const,
      migrationHead: "20260823001500_m16_force_registry_rls.sql",
      database: { sizeBytes: 2048, sha256: digest },
      storageObjectCount: 1,
      completedAt: "2026-08-23T10:00:00Z"
    };
    expect(() => createRecoveryManifest({ ...base, storage: [{ bucket: "private-business", objectKey: "https://public.example/file", sizeBytes: 1, sha256: storageDigest }] })).toThrow(/private object key/);
    expect(() => createRecoveryManifest({ ...base, storage: [{ bucket: "private-business", objectKey: "../escape", sizeBytes: 1, sha256: storageDigest }] })).toThrow(/private object key/);
    expect(() => createRecoveryManifest({ ...base, storageObjectCount: 2, storage: [{ bucket: "private-business", objectKey: "safe/file", sizeBytes: 1, sha256: storageDigest }] })).toThrow(/count/);

    const object = { bucket: "private-business", objectKey: "safe/file", sizeBytes: 1, sha256: storageDigest };
    expect(() => createRecoveryManifest({ ...base, storageObjectCount: 2, storage: [object, object] })).toThrow(/duplicate/);
    const manifest = createRecoveryManifest({ ...base, storage: [object] });
    expect(() => verifyRestore(manifest, { migrationHead: manifest.migrationHead, databaseSha256: "c".repeat(64), storage: manifest.storage })).toThrow(/database/);
  });
});
