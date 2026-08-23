import { getWorkerState } from "./composition/runtime.js";

export { getWorkerState } from "./composition/runtime.js";
export {
  createRecoveryManifest,
  verifyRestore,
  type RecoveryManifest,
  type RestoreEvidence,
  type StorageBackupObject
} from "./composition/recovery-manifest.js";

if (process.env.NODE_ENV !== "test") {
  process.stdout.write(`${JSON.stringify(getWorkerState())}\n`);
}
