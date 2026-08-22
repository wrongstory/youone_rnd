import { technicalCopyQuery } from "../../../technical-copies/query";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly technicalCopyId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { technicalCopyId } = await params;
  const result = await technicalCopyQuery().getInternal(technicalCopyId);
  const status = result.availability === "AVAILABLE" ? 200 : result.availability === "FORBIDDEN" ? 403 : result.availability === "NOT_FOUND" ? 404 : 503;
  return Response.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
}
