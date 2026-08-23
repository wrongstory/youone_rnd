import { offlineSyncEndpoint } from "../../../../composition/offline-sync";
import { probeRequestDatabase } from "../../../../composition/request-database";
import { getRuntimeReadiness } from "../../../../composition/runtime-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const requestDatabase = await probeRequestDatabase();
  const readiness = getRuntimeReadiness(process.env, offlineSyncEndpoint(), {
    requestAuth: false,
    requestDatabase: requestDatabase.ready,
    ...(requestDatabase.ready ? {} : { requestDatabaseReasonCode: requestDatabase.reasonCode })
  });
  return Response.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" }
  });
}
