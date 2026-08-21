import { describe, expect, it } from "vitest";
import { SupabaseServerSessionVerifier } from "../../packages/infrastructure/supabase-auth/src/request.js";

describe("Supabase request verifier", () => {
  it("uses verified user/claims and exposes no user metadata authority", async () => {
    const verifier = new SupabaseServerSessionVerifier({
      getUser: async () => ({ user: { id: "verified-subject", user_metadata: { role: "ADMIN_SYSTEM" } } as { id: string } }),
      getClaims: async () => ({ claims: { sub: "verified-subject", exp: 2_000_000_000, session_id: "s1", aal: "aal2" } })
    });
    const session = await verifier.verify("token");
    expect(session.authSubject).toBe("verified-subject");
    expect(session.assuranceLevel).toBe("AAL2");
    expect("role" in session).toBe(false);
  });
  it("rejects subject mismatch", async () => {
    const verifier = new SupabaseServerSessionVerifier({ getUser: async () => ({ user: { id: "a" } }), getClaims: async () => ({ claims: { sub: "b", exp: 2_000_000_000 } }) });
    await expect(verifier.verify("token")).rejects.toThrow(/subject differ/);
  });
});
