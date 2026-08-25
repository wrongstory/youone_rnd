import {
  deviceTrustHttp,
  deviceTrustUnavailableResponse
} from "../../../../composition/device-trust";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> | Response {
  return deviceTrustHttp()?.readiness(request) ?? deviceTrustUnavailableResponse();
}
