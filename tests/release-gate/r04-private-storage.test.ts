import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  backupPrivateStorage,
  PrivateStorageRecoveryError,
  restorePrivateStorage,
  type RecoveryArtifactStore
} from "../../apps/worker/src/composition/private-storage-recovery.js";
import { getWorkerState } from "../../apps/worker/src/composition/runtime.js";
import type { StorageBackupObject } from "../../apps/worker/src/composition/recovery-manifest.js";
import {
  createSupabasePrivateStorageService,
  SupabasePrivateStorageServiceError,
  SupabaseSdkPrivateStorageService,
  type PrivateStorageRecoveryPort,
  type SupabaseStorageSdkBoundary
} from "../../packages/infrastructure/supabase-storage/src/service.js";

const databaseDigest = "d".repeat(64);
const migrationHead = "20260823001500_m16_force_registry_rls.sql";

class MemoryArtifacts implements RecoveryArtifactStore {
  public readonly objects = new Map<string, Uint8Array>();

  public async writeObject(object: StorageBackupObject, bytes: Uint8Array): Promise<void> {
    const key = artifactKey(object);
    if (this.objects.has(key)) throw new Error("artifact overwrite denied");
    this.objects.set(key, bytes.slice());
  }

  public async readObject(object: StorageBackupObject): Promise<Uint8Array> {
    const value = this.objects.get(artifactKey(object));
    if (!value) throw new Error("artifact missing");
    return value.slice();
  }
}

class MemoryStorage implements PrivateStorageRecoveryPort {
  public readonly uploads: string[] = [];

  public constructor(
    public readonly instanceId: string,
    public readonly privateBuckets: readonly string[],
    public readonly objects: Map<string, Uint8Array>,
    private readonly ready = true
  ) {}

  public async probe() {
    return this.ready
      ? ({ ready: true } as const)
      : ({ ready: false, reasonCode: "PRIVATE_STORAGE_PROVIDER_UNAVAILABLE" } as const);
  }

  public async listObjects(bucket: string) {
    return [...this.objects.keys()]
      .filter((key) => key.startsWith(`${bucket}\0`))
      .map((key) => Object.freeze({ bucket, objectKey: key.slice(bucket.length + 1) }));
  }

  public async downloadObject(bucket: string, objectKey: string) {
    const bytes = this.objects.get(`${bucket}\0${objectKey}`);
    if (!bytes) throw new Error("object missing");
    return bytes.slice();
  }

  public async headObject(bucket: string, objectKey: string) {
    const bytes = this.objects.get(`${bucket}\0${objectKey}`);
    if (!bytes) throw new Error("object missing");
    return Object.freeze({ contentType: "application/octet-stream", sizeBytes: bytes.byteLength });
  }

  public async objectExists(bucket: string, objectKey: string) {
    return this.objects.has(`${bucket}\0${objectKey}`);
  }

  public async uploadObjectWithoutOverwrite(bucket: string, objectKey: string, bytes: Uint8Array) {
    const key = `${bucket}\0${objectKey}`;
    if (this.objects.has(key)) throw new Error("object overwrite denied");
    this.objects.set(key, bytes.slice());
    this.uploads.push(key);
  }
}

function artifactKey(object: Pick<StorageBackupObject, "bucket" | "objectKey">): string {
  return `${object.bucket}\0${object.objectKey}`;
}

describe("R04 concrete Supabase private Storage boundary", () => {
  it("paginates a private bucket and rejects public buckets and unsafe provider keys", async () => {
    const listV2 = vi.fn()
      .mockResolvedValueOnce({
        data: {
          hasNext: true,
          nextCursor: "page-2",
          folders: [],
          objects: [{ id: "1", name: "a.pdf", key: "private/a.pdf", metadata: null, created_at: "", updated_at: "", last_accessed_at: "" }]
        },
        error: null
      })
      .mockResolvedValueOnce({
        data: {
          hasNext: false,
          folders: [],
          objects: [{ id: "2", name: "b.pdf", key: "private/b.pdf", metadata: null, created_at: "", updated_at: "", last_accessed_at: "" }]
        },
        error: null
      });
    const upload = vi.fn(async () => ({ data: { path: "private/new.pdf" }, error: null }));
    const fileApi = {
      download: vi.fn(async () => ({ data: new Blob(["alpha"]), error: null })),
      exists: vi.fn(async () => ({ data: false, error: null })),
      info: vi.fn(async () => ({ data: { contentType: "application/pdf", size: 5 }, error: null })),
      listV2,
      upload
    };
    const sdk = {
      getBucket: vi.fn(async () => ({ data: { public: false }, error: null })),
      from: vi.fn(() => fileApi)
    } as unknown as SupabaseStorageSdkBoundary;
    const service = new SupabaseSdkPrivateStorageService(sdk, "https://source.supabase.co", ["documents-private"]);

    await expect(service.listObjects("documents-private")).resolves.toEqual([
      { bucket: "documents-private", objectKey: "private/a.pdf" },
      { bucket: "documents-private", objectKey: "private/b.pdf" }
    ]);
    expect(listV2.mock.calls[1]?.[0]).toMatchObject({ cursor: "page-2", with_delimiter: false });
    await expect(service.headObject("documents-private", "private/a.pdf"))
      .resolves.toEqual({ contentType: "application/pdf", sizeBytes: 5 });
    await expect(service.downloadObject("documents-private", "private/a.pdf"))
      .resolves.toEqual(new TextEncoder().encode("alpha"));
    await service.uploadObjectWithoutOverwrite("documents-private", "private/new.pdf", new TextEncoder().encode("new"));
    expect(upload).toHaveBeenCalledWith("private/new.pdf", expect.any(Uint8Array), expect.objectContaining({ upsert: false }));

    const publicSdk = {
      getBucket: async () => ({ data: { public: true }, error: null }),
      from: () => ({})
    } as unknown as SupabaseStorageSdkBoundary;
    await expect(new SupabaseSdkPrivateStorageService(publicSdk, "https://public.supabase.co", ["documents-private"]).probe())
      .resolves.toEqual({ ready: false, reasonCode: "PRIVATE_STORAGE_PUBLIC_BUCKET" });

    const unsafeList = {
      getBucket: async () => ({ data: { public: false }, error: null }),
      from: () => ({
        listV2: async () => ({
          data: { hasNext: false, folders: [], objects: [{ key: "../escape", name: "escape" }] },
          error: null
        })
      })
    } as unknown as SupabaseStorageSdkBoundary;
    await expect(new SupabaseSdkPrivateStorageService(unsafeList, "https://safe.supabase.co", ["documents-private"]).listObjects("documents-private"))
      .rejects.toBeInstanceOf(SupabasePrivateStorageServiceError);
  });

  it("requires a server secret and configuration-bound private bucket list", () => {
    expect(() => createSupabasePrivateStorageService({
      supabaseUrl: "https://tenant.supabase.co",
      serviceRoleKey: "publishable-key-is-not-a-secret",
      privateBuckets: ["documents-private"],
      production: true
    })).toThrowError(SupabasePrivateStorageServiceError);
    expect(() => createSupabasePrivateStorageService({
      supabaseUrl: "http://tenant.supabase.co",
      serviceRoleKey: `sb_secret_${"x".repeat(32)}`,
      privateBuckets: ["documents-private"],
      production: true
    })).toThrowError(SupabasePrivateStorageServiceError);
    expect(() => createSupabasePrivateStorageService({
      supabaseUrl: "https://tenant.supabase.co",
      serviceRoleKey: `sb_secret_${"x".repeat(32)}`,
      privateBuckets: ["documents-private", "documents-private"],
      production: true
    })).toThrowError(SupabasePrivateStorageServiceError);
  });
});

describe("R04 manifest-backed private Storage recovery", () => {
  it("backs up, restores only to another empty instance and verifies every byte", async () => {
    const original = new Map<string, Uint8Array>([
      ["documents-private\0private/alpha.pdf", new TextEncoder().encode("alpha")],
      ["technical-private\0controlled/copy.pdf", new TextEncoder().encode("copy")]
    ]);
    const source = new MemoryStorage("https://source.supabase.co", ["documents-private", "technical-private"], original);
    const artifacts = new MemoryArtifacts();
    const backup = await backupPrivateStorage({
      artifacts,
      completedAt: "2026-08-23T12:00:00Z",
      database: { sizeBytes: 2_048, sha256: databaseDigest },
      migrationHead,
      storage: source
    });
    expect(backup.manifest.storageObjectCount).toBe(2);
    expect(backup.manifest.storage.map((object) => object.sha256)).toEqual([
      createHash("sha256").update("alpha").digest("hex"),
      createHash("sha256").update("copy").digest("hex")
    ]);

    const partialTarget = new MemoryStorage("https://partial.supabase.co", ["documents-private", "technical-private"], new Map());
    const upload = vi.spyOn(partialTarget, "uploadObjectWithoutOverwrite");
    upload.mockImplementationOnce(async (bucket, objectKey, bytes) => {
      partialTarget.objects.set(`${bucket}\0${objectKey}`, bytes.slice());
      partialTarget.uploads.push(`${bucket}\0${objectKey}`);
    }).mockRejectedValueOnce(new Error("provider write failed"));
    await expect(restorePrivateStorage({ artifacts, backup, databaseSha256: databaseDigest, migrationHead, target: partialTarget }))
      .rejects.toMatchObject({ reasonCode: "RESTORE_STORAGE_UNAVAILABLE" });
    expect(partialTarget.uploads).toHaveLength(1);

    const target = new MemoryStorage("https://restore.supabase.co", ["documents-private", "technical-private"], new Map());
    await expect(restorePrivateStorage({ artifacts, backup, databaseSha256: databaseDigest, migrationHead, target }))
      .resolves.toMatchObject({ databaseSha256: databaseDigest, migrationHead });
    expect(target.uploads).toHaveLength(2);

    await expect(restorePrivateStorage({ artifacts, backup, databaseSha256: databaseDigest, migrationHead, target: source }))
      .rejects.toMatchObject({ reasonCode: "RESTORE_SOURCE_EQUALS_TARGET" });
  });

  it("validates all artifacts before writing and never overwrites a non-empty target", async () => {
    const source = new MemoryStorage(
      "https://source.supabase.co",
      ["documents-private"],
      new Map([["documents-private\0private/a.pdf", new TextEncoder().encode("expected")]])
    );
    const artifacts = new MemoryArtifacts();
    const backup = await backupPrivateStorage({
      artifacts,
      completedAt: "2026-08-23T12:00:00Z",
      database: { sizeBytes: 2_048, sha256: databaseDigest },
      migrationHead,
      storage: source
    });
    artifacts.objects.set("documents-private\0private/a.pdf", new TextEncoder().encode("corrupt"));
    const emptyTarget = new MemoryStorage("https://restore.supabase.co", ["documents-private"], new Map());
    await expect(restorePrivateStorage({ artifacts, backup, databaseSha256: databaseDigest, migrationHead, target: emptyTarget }))
      .rejects.toBeInstanceOf(PrivateStorageRecoveryError);
    expect(emptyTarget.uploads).toEqual([]);

    const occupiedTarget = new MemoryStorage(
      "https://occupied.supabase.co",
      ["documents-private"],
      new Map([["documents-private\0existing.txt", new TextEncoder().encode("keep")]])
    );
    await expect(restorePrivateStorage({ artifacts, backup, databaseSha256: databaseDigest, migrationHead, target: occupiedTarget }))
      .rejects.toMatchObject({ reasonCode: "RESTORE_TARGET_NOT_EMPTY" });
    expect(occupiedTarget.uploads).toEqual([]);
  });
});

describe("R04 Worker readiness", () => {
  it("fails closed without concrete DB and Storage capability and never reports secrets", async () => {
    const environment = {
      WORKER_DATABASE_URL: "postgresql://worker:secret@db.internal/app",
      SUPABASE_URL: "https://tenant.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"x".repeat(32)}`,
      SUPABASE_PRIVATE_BUCKETS: "documents-private"
    };
    const notReady = await getWorkerState(environment);
    expect(notReady.status).toBe("not_ready");
    expect(JSON.stringify(notReady)).not.toContain("secret");

    const readyProbe = { probe: async () => ({ ready: true as const }) };
    await expect(getWorkerState(environment, { database: readyProbe, privateStorage: readyProbe }))
      .resolves.toMatchObject({ status: "ready" });
    const unavailable = { probe: async () => ({ ready: false as const, reasonCode: "PRIVATE_STORAGE_PUBLIC_BUCKET" }) };
    await expect(getWorkerState(environment, { database: readyProbe, privateStorage: unavailable }))
      .resolves.toMatchObject({ status: "not_ready" });
  });
});
