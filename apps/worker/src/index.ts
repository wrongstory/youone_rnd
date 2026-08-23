import { getWorkerState } from "./composition/runtime.js";
import {
  createSupabasePrivateStorageService,
  parsePrivateBucketList,
  type PrivateStorageRecoveryPort
} from "@youone/infra-supabase-storage/service";

export { getWorkerState } from "./composition/runtime.js";
export {
  createRecoveryManifest,
  verifyRestore,
  type RecoveryManifest,
  type RestoreEvidence,
  type StorageBackupObject
} from "./composition/recovery-manifest.js";
export {
  backupPrivateStorage,
  restorePrivateStorage,
  PrivateStorageRecoveryError,
  type PrivateStorageBackupSet,
  type RecoveryArtifactStore
} from "./composition/private-storage-recovery.js";

if (process.env.NODE_ENV !== "test") {
  let privateStorage: PrivateStorageRecoveryPort | undefined;
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_PRIVATE_BUCKETS) {
      privateStorage = createSupabasePrivateStorageService({
        supabaseUrl: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        privateBuckets: parsePrivateBucketList(process.env.SUPABASE_PRIVATE_BUCKETS),
        production: process.env.NODE_ENV === "production"
      });
    }
  } catch {
    privateStorage = undefined;
  }
  process.stdout.write(`${JSON.stringify(await getWorkerState(process.env, { privateStorage }))}\n`);
}
