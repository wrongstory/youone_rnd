import { offlineSyncEndpoint } from "../../../../../composition/offline-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const endpoint = offlineSyncEndpoint();
  if (endpoint === null) {
    return Response.json(
      { result: "UNAVAILABLE", reason: "SYNC_REQUEST_ADAPTER_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const result = await endpoint.execute(request);
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" }
  });
}
