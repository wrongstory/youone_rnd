import { rndQuery } from "../../rnd-programs/query";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await rndQuery().listInternalSummaries();
  const status = result.availability === "AVAILABLE" ? 200 : result.availability === "FORBIDDEN" ? 403 : 503;
  return Response.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
}
