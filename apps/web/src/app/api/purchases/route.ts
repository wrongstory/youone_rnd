import { purchaseQuery } from "../../purchases/query";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await purchaseQuery().listMine();
  const status = result.availability === "AVAILABLE" ? 200 : result.availability === "FORBIDDEN" ? 403 : 503;
  return Response.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
}
