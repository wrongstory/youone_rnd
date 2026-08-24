import { authUnavailableResponse, operationalAuthHttp } from "../../../../composition/operational-auth";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> | Response {
  return operationalAuthHttp()?.csrf(request) ?? authUnavailableResponse();
}
