import { createHash } from "node:crypto";

import type { PrivateStorageRecoveryPort } from "@youone/infra-supabase-storage/service";

import {
  createRecoveryManifest,
  verifyRestore,
  type RecoveryManifest,
  type RestoreEvidence,
  type StorageBackupObject
} from "./recovery-manifest.js";

export interface RecoveryArtifactStore {
  writeObject(object: StorageBackupObject, bytes: Uint8Array): Promise<void>;
  readObject(object: StorageBackupObject): Promise<Uint8Array>;
}

export type PrivateStorageBackupSet = Readonly<{
  manifest: RecoveryManifest;
  sourceStorageInstanceId: string;
}>;

export class PrivateStorageRecoveryError extends Error {
  public constructor(
    public readonly reasonCode:
      | "BACKUP_ARTIFACT_INVALID"
      | "BACKUP_STORAGE_UNAVAILABLE"
      | "RESTORE_SOURCE_EQUALS_TARGET"
      | "RESTORE_TARGET_NOT_EMPTY"
      | "RESTORE_STORAGE_UNAVAILABLE",
    options?: ErrorOptions
  ) {
    super(reasonCode, options);
    this.name = "PrivateStorageRecoveryError";
  }
}

export async function backupPrivateStorage(input: Readonly<{
  artifacts: RecoveryArtifactStore;
  completedAt: string;
  database: Readonly<{ sizeBytes: number; sha256: string }>;
  migrationHead: string;
  storage: PrivateStorageRecoveryPort;
}>): Promise<PrivateStorageBackupSet> {
  const probe = await input.storage.probe();
  if (!probe.ready) throw new PrivateStorageRecoveryError("BACKUP_STORAGE_UNAVAILABLE");

  const evidence: StorageBackupObject[] = [];
  try {
    for (const bucket of input.storage.privateBuckets) {
      const objects = await input.storage.listObjects(bucket);
      for (const object of objects) {
        const head = await input.storage.headObject(object.bucket, object.objectKey);
        const bytes = await input.storage.downloadObject(object.bucket, object.objectKey);
        if (head.sizeBytes !== bytes.byteLength) {
          throw new PrivateStorageRecoveryError("BACKUP_STORAGE_UNAVAILABLE");
        }
        const item = Object.freeze({
          bucket: object.bucket,
          objectKey: object.objectKey,
          sizeBytes: bytes.byteLength,
          sha256: sha256(bytes)
        });
        await input.artifacts.writeObject(item, bytes);
        evidence.push(item);
      }
    }
  } catch (error) {
    throw new PrivateStorageRecoveryError("BACKUP_STORAGE_UNAVAILABLE", { cause: error });
  }

  const manifest = createRecoveryManifest({
    manifestVersion: 1,
    migrationHead: input.migrationHead,
    database: input.database,
    storage: evidence,
    storageObjectCount: evidence.length,
    completedAt: input.completedAt
  });
  return Object.freeze({ manifest, sourceStorageInstanceId: input.storage.instanceId });
}

export async function restorePrivateStorage(input: Readonly<{
  artifacts: RecoveryArtifactStore;
  backup: PrivateStorageBackupSet;
  databaseSha256: string;
  migrationHead: string;
  target: PrivateStorageRecoveryPort;
}>): Promise<RestoreEvidence> {
  if (input.backup.sourceStorageInstanceId === input.target.instanceId) {
    throw new PrivateStorageRecoveryError("RESTORE_SOURCE_EQUALS_TARGET");
  }
  const probe = await input.target.probe();
  if (!probe.ready) throw new PrivateStorageRecoveryError("RESTORE_STORAGE_UNAVAILABLE");

  const configured = new Set(input.target.privateBuckets);
  if (input.backup.manifest.storage.some((item) => !configured.has(item.bucket))) {
    throw new PrivateStorageRecoveryError("RESTORE_STORAGE_UNAVAILABLE");
  }

  try {
    for (const bucket of input.target.privateBuckets) {
      if ((await input.target.listObjects(bucket)).length !== 0) {
        throw new PrivateStorageRecoveryError("RESTORE_TARGET_NOT_EMPTY");
      }
    }
  } catch (error) {
    if (error instanceof PrivateStorageRecoveryError) throw error;
    throw new PrivateStorageRecoveryError("RESTORE_STORAGE_UNAVAILABLE", { cause: error });
  }

  // Validate the complete artifact set before the first target write. This prevents
  // a known-corrupt backup from producing a partial restore.
  try {
    for (const object of input.backup.manifest.storage) {
      const bytes = await input.artifacts.readObject(object);
      if (bytes.byteLength !== object.sizeBytes || sha256(bytes) !== object.sha256) {
        throw new PrivateStorageRecoveryError("BACKUP_ARTIFACT_INVALID");
      }
    }
  } catch (error) {
    if (error instanceof PrivateStorageRecoveryError) throw error;
    throw new PrivateStorageRecoveryError("BACKUP_ARTIFACT_INVALID", { cause: error });
  }

  try {
    for (const object of input.backup.manifest.storage) {
      const bytes = await input.artifacts.readObject(object);
      if (bytes.byteLength !== object.sizeBytes || sha256(bytes) !== object.sha256) {
        throw new PrivateStorageRecoveryError("BACKUP_ARTIFACT_INVALID");
      }
      await input.target.uploadObjectWithoutOverwrite(object.bucket, object.objectKey, bytes);
    }
  } catch (error) {
    // The target is isolated and must be discarded after a partial provider failure.
    // Automatic deletion is intentionally forbidden because it could erase evidence.
    if (error instanceof PrivateStorageRecoveryError) throw error;
    throw new PrivateStorageRecoveryError("RESTORE_STORAGE_UNAVAILABLE", { cause: error });
  }

  const restored: StorageBackupObject[] = [];
  try {
    for (const bucket of input.target.privateBuckets) {
      for (const object of await input.target.listObjects(bucket)) {
        const bytes = await input.target.downloadObject(object.bucket, object.objectKey);
        restored.push(Object.freeze({
          bucket: object.bucket,
          objectKey: object.objectKey,
          sizeBytes: bytes.byteLength,
          sha256: sha256(bytes)
        }));
      }
    }
  } catch (error) {
    throw new PrivateStorageRecoveryError("RESTORE_STORAGE_UNAVAILABLE", { cause: error });
  }

  const evidence = Object.freeze({
    migrationHead: input.migrationHead,
    databaseSha256: input.databaseSha256,
    storage: Object.freeze(restored)
  });
  try {
    verifyRestore(input.backup.manifest, evidence);
  } catch (error) {
    throw new PrivateStorageRecoveryError("RESTORE_STORAGE_UNAVAILABLE", { cause: error });
  }
  return evidence;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
