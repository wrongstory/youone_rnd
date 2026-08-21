import { approvalInboxQuery } from "../../approvals/query";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await approvalInboxQuery().listMine();
  if (result.availability === "UNAVAILABLE") return Response.json({ availability: result.availability, items: result.items, reason: result.reason }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
