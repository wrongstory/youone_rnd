import { purchaseQuery } from "../../../purchases/query";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ purchaseRequestId: string }> }
) {
  const { purchaseRequestId } = await params;
  const result = await purchaseQuery().getMine(purchaseRequestId);
  const status = result.availability === "AVAILABLE"
    ? 200
    : result.availability === "NOT_FOUND"
      ? 404
      : result.availability === "FORBIDDEN"
        ? 403
        : 503;
  return Response.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
}
