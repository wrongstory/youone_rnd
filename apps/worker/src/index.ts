import { getWorkerState } from "./composition/runtime.js";
import {
  type PrivateStorageRecoveryPort
} from "@youone/infra-supabase-storage/service";
import { probeWorkerDatabase } from "./composition/worker-database.js";
import { getWorkerPrivateStorage } from "./composition/private-storage.js";

export { getWorkerState } from "./composition/runtime.js";
export { getWorkerDatabasePool, probeWorkerDatabase } from "./composition/worker-database.js";
export { combineDeploymentReadiness, DEPLOYMENT_COMPONENT_IDS } from "./composition/deployment-readiness.js";
export { createStagingEvidence, REQUIRED_STAGING_CHECK_IDS } from "./composition/staging-evidence.js";
export { runStagingE2E } from "./composition/staging-e2e.js";
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
    privateStorage = getWorkerPrivateStorage() ?? undefined;
  } catch {
    privateStorage = undefined;
  }
  const database = { probe: () => probeWorkerDatabase() };
  process.stdout.write(`${JSON.stringify(await getWorkerState(process.env, { database, privateStorage }))}\n`);
}
