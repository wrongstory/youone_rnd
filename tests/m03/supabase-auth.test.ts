import { describe, expect, it } from "vitest";
import { SupabaseServerSessionVerifier } from "../../packages/infrastructure/supabase-auth/src/request.js";

describe("Supabase request verifier", () => {
  it("uses verified user/claims and exposes no user metadata authority", async () => {
    const verifier = new SupabaseServerSessionVerifier({
      getUser: async () => ({ user: { id: "17000000-0000-4000-8000-000000000001", user_metadata: { role: "ADMIN_SYSTEM" } } as { id: string } }),
      getClaims: async () => ({ claims: { sub: "17000000-0000-4000-8000-000000000001", exp: 2_000_000_000, session_id: "17000000-0000-4000-8000-000000000002", aal: "aal2" } })
    });
    const session = await verifier.verify("token");
    expect(session.authSubject).toBe("17000000-0000-4000-8000-000000000001");
    expect(session.assuranceLevel).toBe("AAL2");
    expect("role" in session).toBe(false);
  });
  it("rejects subject mismatch", async () => {
    const verifier = new SupabaseServerSessionVerifier({ getUser: async () => ({ user: { id: "a" } }), getClaims: async () => ({ claims: { sub: "b", exp: 2_000_000_000 } }) });
    await expect(verifier.verify("token")).rejects.toThrow(/subject differ/);
  });
});
