import { authUnavailableResponse, operationalAuthHttp } from "../../../../../composition/operational-auth";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> | Response {
  return operationalAuthHttp()?.verify(request) ?? authUnavailableResponse();
}
