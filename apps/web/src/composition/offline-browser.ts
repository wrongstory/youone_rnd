import { browserOfflineStore, type OfflineQueueCounts } from "@youone/infra-offline-dexie/public";

/** Browser adapter access remains in the composition root, never in route or feature UI code. */
export async function readOfflineQueueCounts(): Promise<OfflineQueueCounts> {
  return browserOfflineStore().counts();
}
