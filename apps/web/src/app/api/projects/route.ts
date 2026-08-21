import { projectQuery } from "../../projects/query";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await projectQuery().listMine();
  return Response.json(result, {
    status: result.availability === "AVAILABLE" ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" }
  });
}
