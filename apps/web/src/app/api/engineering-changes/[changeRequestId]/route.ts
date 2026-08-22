import { engineeringChangeQuery } from "../../../engineering-changes/query";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ changeRequestId: string }> }
) {
  const { changeRequestId } = await params;
  const result = await engineeringChangeQuery().getMineExternal(changeRequestId);
  const status = result.availability === "AVAILABLE"
    ? 200
    : result.availability === "NOT_FOUND"
      ? 404
      : result.availability === "FORBIDDEN"
        ? 403
        : 503;
  return Response.json(result, {
    status,
    headers: { "Cache-Control": "private, no-store" }
  });
}
