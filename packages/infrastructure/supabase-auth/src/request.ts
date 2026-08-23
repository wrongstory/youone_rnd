import type { AuthSessionVerifier, VerifiedAuthSession } from "@youone/core-identity/public";
import { IdentityVerificationError } from "@youone/core-identity/public";
import { utcInstant } from "@youone/shared-kernel/public";

export type SupabaseVerifiedUser = Readonly<{ id: string }>;
export type SupabaseVerifiedClaims = Readonly<{ sub: string; exp: number; session_id?: string; aal?: string }>;

export interface SupabaseRequestAuthApi {
  getUser(accessToken: string): Promise<{ user: SupabaseVerifiedUser | null; error?: unknown }>;
  getClaims(accessToken: string): Promise<{ claims: SupabaseVerifiedClaims | null; error?: unknown }>;
}

/** Server-verified user/claims only; user-editable metadata is not part of this contract. */
export class SupabaseServerSessionVerifier implements AuthSessionVerifier {
  constructor(private readonly api: SupabaseRequestAuthApi) {}
  async verify(accessToken: string): Promise<VerifiedAuthSession> {
    if (accessToken.trim().length === 0) throw new IdentityVerificationError("access token is missing");
    let userResult: Awaited<ReturnType<SupabaseRequestAuthApi["getUser"]>>;
    let claimsResult: Awaited<ReturnType<SupabaseRequestAuthApi["getClaims"]>>;
    try {
      [userResult, claimsResult] = await Promise.all([this.api.getUser(accessToken), this.api.getClaims(accessToken)]);
    } catch {
      throw new IdentityVerificationError("Supabase session verification failed");
    }
    if (userResult.error !== undefined || claimsResult.error !== undefined || userResult.user === null || claimsResult.claims === null) {
      throw new IdentityVerificationError("Supabase session verification failed");
    }
    if (userResult.user.id.trim().length === 0 || claimsResult.claims.sub.trim().length === 0) throw new IdentityVerificationError("verified subject is missing");
    if (userResult.user.id !== claimsResult.claims.sub) throw new IdentityVerificationError("verified user and claims subject differ");
    if (claimsResult.claims.session_id?.trim().length === 0 || claimsResult.claims.session_id === undefined) {
      throw new IdentityVerificationError("verified session ID is missing");
    }
    if (!Number.isSafeInteger(claimsResult.claims.exp) || claimsResult.claims.exp <= 0) {
      throw new IdentityVerificationError("verified session expiry is invalid");
    }
    return Object.freeze({
      authSubject: userResult.user.id,
      sessionId: claimsResult.claims.session_id,
      expiresAt: utcInstant(new Date(claimsResult.claims.exp * 1000)),
      assuranceLevel: claimsResult.claims.aal === "aal2" ? "AAL2" : claimsResult.claims.aal === "aal1" ? "AAL1" : "UNKNOWN"
    });
  }
}
