import { offlineSyncEndpoint } from "../../../../composition/offline-sync";
import { getRuntimeReadiness } from "../../../../composition/runtime-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const readiness = getRuntimeReadiness(process.env, offlineSyncEndpoint());
  return Response.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" }
  });
}
