import { offlineSyncEndpoint, probeOfflineSync } from "../../../../composition/offline-sync";
import { probeRequestAuth } from "../../../../composition/request-auth";
import { probeRequestDatabase } from "../../../../composition/request-database";
import { getRuntimeReadiness } from "../../../../composition/runtime-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [requestAuth, requestDatabase, offlineSync] = await Promise.all([
    probeRequestAuth(),
    probeRequestDatabase(),
    probeOfflineSync()
  ]);
  const readiness = getRuntimeReadiness(process.env, offlineSyncEndpoint(), {
    requestAuth: requestAuth.ready,
    ...(requestAuth.ready ? {} : { requestAuthReasonCode: requestAuth.reasonCode }),
    requestDatabase: requestDatabase.ready,
    ...(requestDatabase.ready ? {} : { requestDatabaseReasonCode: requestDatabase.reasonCode }),
    offlineSync: offlineSync.ready,
    ...(offlineSync.ready ? {} : { offlineSyncReasonCode: offlineSync.reasonCode })
  });
  return Response.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" }
  });
}
