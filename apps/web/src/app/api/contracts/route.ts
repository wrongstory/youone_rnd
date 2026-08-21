import { vendorContractQuery } from "../../contracts/query";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await vendorContractQuery().listSafe();
  return Response.json(result, {
    status: result.availability === "AVAILABLE" ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" }
  });
}
