import { rndQuery } from "../../../rnd-programs/query";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rndProgramId: string }> }
) {
  const { rndProgramId } = await params;
  const result = await rndQuery().getInternalSummary(rndProgramId);
  const status = result.availability === "AVAILABLE"
    ? 200
    : result.availability === "NOT_FOUND"
      ? 404
      : result.availability === "FORBIDDEN"
        ? 403
        : 503;
  return Response.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
}
