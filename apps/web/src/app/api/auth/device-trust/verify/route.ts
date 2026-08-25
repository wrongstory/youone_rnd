import {
  deviceTrustHttp,
  deviceTrustUnavailableResponse
} from "../../../../../composition/device-trust";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> | Response {
  return deviceTrustHttp()?.verify(request) ?? deviceTrustUnavailableResponse();
}
