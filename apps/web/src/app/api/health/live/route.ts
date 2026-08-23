export function GET() {
  return Response.json(
    { service: "youone-web", status: "ok" },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
