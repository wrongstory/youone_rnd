import { engineeringChangeQuery } from "../../engineering-changes/query";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await engineeringChangeQuery().listMineExternal();
  return Response.json(result, {
    status: result.availability === "AVAILABLE" ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" }
  });
}
