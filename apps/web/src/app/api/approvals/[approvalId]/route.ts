import { uuid } from "@youone/shared-kernel/public";
import { approvalInboxQuery } from "../../../approvals/query";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  let id; try { id = uuid((await params).approvalId); } catch { return Response.json({ error: "INVALID_APPROVAL_ID" }, { status: 400 }); }
  const result = await approvalInboxQuery().getMine(id);
  return Response.json(result, { status: result.availability === "UNAVAILABLE" ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
