export type StorageBackupObject = Readonly<{
  bucket: string;
  objectKey: string;
  sizeBytes: number;
  sha256: string;
}>;

export type RecoveryManifest = Readonly<{
  manifestVersion: 1;
  migrationHead: string;
  database: Readonly<{ sizeBytes: number; sha256: string }>;
  storage: readonly StorageBackupObject[];
  storageObjectCount: number;
  completedAt: string;
}>;

export type RestoreEvidence = Readonly<{
  migrationHead: string;
  databaseSha256: string;
  storage: readonly StorageBackupObject[];
}>;

const sha256Pattern = /^[0-9a-f]{64}$/;
const migrationPattern = /^\d{14}_[a-z0-9_]+\.sql$/;

function validObject(item: StorageBackupObject): StorageBackupObject {
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(item.bucket)) throw new Error("invalid private bucket identifier");
  const segments = item.objectKey.split("/");
  if (
    item.objectKey.length === 0 ||
    item.objectKey.length > 1024 ||
    /^(?:https?:|\/)/i.test(item.objectKey) ||
    item.objectKey.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(item.objectKey) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("storage manifest requires a relative private object key");
  }
  if (!Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 0) throw new Error("invalid storage object size");
  if (!sha256Pattern.test(item.sha256)) throw new Error("invalid storage object digest");
  return Object.freeze({ ...item });
}

export function createRecoveryManifest(input: RecoveryManifest): RecoveryManifest {
  if (input.manifestVersion !== 1) throw new Error("unsupported recovery manifest version");
  if (!migrationPattern.test(input.migrationHead)) throw new Error("invalid migration head");
  if (!Number.isSafeInteger(input.database.sizeBytes) || input.database.sizeBytes <= 0) throw new Error("invalid database dump size");
  if (!sha256Pattern.test(input.database.sha256)) throw new Error("invalid database dump digest");
  if (Number.isNaN(Date.parse(input.completedAt))) throw new Error("invalid backup completion time");
  const storage = input.storage.map(validObject);
  const keys = new Set(storage.map((item) => `${item.bucket}\u0000${item.objectKey}`));
  if (keys.size !== storage.length) throw new Error("duplicate storage object in recovery manifest");
  if (input.storageObjectCount !== storage.length) throw new Error("storage object count does not match the manifest");
  return Object.freeze({
    ...input,
    database: Object.freeze({ ...input.database }),
    storage: Object.freeze(storage)
  });
}

export function verifyRestore(manifest: RecoveryManifest, evidence: RestoreEvidence): void {
  if (evidence.migrationHead !== manifest.migrationHead) throw new Error("restored migration head differs from backup");
  if (evidence.databaseSha256 !== manifest.database.sha256) throw new Error("restored database evidence differs from backup");
  const restored = new Map(evidence.storage.map(validObject).map((item) => [`${item.bucket}\u0000${item.objectKey}`, item]));
  if (restored.size !== manifest.storageObjectCount) throw new Error("restored storage object count differs from backup");
  for (const expected of manifest.storage) {
    const actual = restored.get(`${expected.bucket}\u0000${expected.objectKey}`);
    if (actual === undefined || actual.sha256 !== expected.sha256 || actual.sizeBytes !== expected.sizeBytes) {
      throw new Error("restored storage object evidence differs from backup");
    }
  }
}
