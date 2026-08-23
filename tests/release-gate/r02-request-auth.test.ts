import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { probeRequestAuth } from "../../apps/web/src/composition/request-auth.js";
import {
  SupabaseRequestAuthBoundaryError,
  SupabaseSdkRequestAuthApi,
  SupabaseServerSessionVerifier,
  createSupabaseRequestAuthApi
} from "../../packages/infrastructure/supabase-auth/src/request.js";

describe("R02 concrete Supabase request Auth", () => {
  it("makes the active-session resolver the only identity bootstrap entry", () => {
    const migration = readFileSync(resolve(
      import.meta.dirname,
      "../../supabase/migrations/20260823001600_r02_active_auth_session.sql"
    ), "utf8");
    expect(migration).toContain("from auth.sessions");
    expect(migration).toContain("revoke execute on function app_private.resolve_actor_context_snapshot(text, timestamptz)");
    expect(migration).toContain("revoke execute on function app_private.resolve_user_account(text, timestamptz)");
    expect(migration).toContain("grant execute on function app_private.resolve_active_actor_context_snapshot(text, text, timestamptz)");
    expect(migration).not.toContain("grant execute on function app_private.resolve_active_actor_context_snapshot(text, text, timestamptz)\n  to youone_request");
    const composition = readFileSync(resolve(
      import.meta.dirname,
      "../../apps/web/src/composition/request-auth.ts"
    ), "utf8");
    expect(composition).not.toContain("export function requestSessionVerifier");
    expect(composition).toContain("export function requestActorContextFactory");
  });

  it("verifies the exact caller token through getUser and getClaims without session persistence", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "17000000-0000-4000-8000-000000000001" } },
      error: null
    }));
    const getClaims = vi.fn(async () => ({
      data: {
        claims: {
          aal: "aal2",
          exp: 2_000_000_000,
          session_id: "17000000-0000-4000-8000-000000000002",
          sub: "17000000-0000-4000-8000-000000000001"
        }
      },
      error: null
    }));
    const api = new SupabaseSdkRequestAuthApi(
      { auth: { getClaims, getUser } } as never,
      new URL("https://tenant.example/auth/v1/health"),
      "sb_publishable_test_key",
      vi.fn()
    );

    const session = await new SupabaseServerSessionVerifier(api, () => Date.parse("2026-08-23T00:00:00Z"))
      .verify("caller-access-token");

    expect(getUser).toHaveBeenCalledWith("caller-access-token");
    expect(getClaims).toHaveBeenCalledWith("caller-access-token");
    expect(session).toMatchObject({
      assuranceLevel: "AAL2",
      authSubject: "17000000-0000-4000-8000-000000000001",
      sessionId: "17000000-0000-4000-8000-000000000002"
    });
  });

  it("fails closed for expired sessions even if a provider double returns data", async () => {
    const verifier = new SupabaseServerSessionVerifier({
      getUser: async () => ({ user: { id: "subject" } }),
      getClaims: async () => ({
        claims: { exp: 1_700_000_000, session_id: "session", sub: "subject" }
      })
    }, () => 1_800_000_000_000);

    await expect(verifier.verify("token")).rejects.toThrow("verified session is expired");
  });

  it("rejects plaintext production URLs and any service-role credential", () => {
    expect(() => createSupabaseRequestAuthApi({
      production: true,
      publishableKey: "sb_publishable_test_key",
      supabaseUrl: "http://tenant.example"
    })).toThrow(SupabaseRequestAuthBoundaryError);
    expect(() => createSupabaseRequestAuthApi({
      production: true,
      publishableKey: "sb_secret_forbidden_key",
      supabaseUrl: "https://tenant.example"
    })).toThrow(SupabaseRequestAuthBoundaryError);
  });

  it("uses a bounded provider health probe for readiness", async () => {
    const fetchImplementation = vi.fn(async () => Response.json({ name: "GoTrue", version: "test" }));
    const result = await probeRequestAuth({
      NODE_ENV: "production",
      IDENTITY_RESOLVER_DATABASE_URL: "postgresql://resolver:test@database.example/app",
      REQUEST_AUTH_TIMEOUT_MS: "2000",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_URL: "https://tenant.example"
    }, (options) => new SupabaseSdkRequestAuthApi(
      { auth: {} } as never,
      new URL("https://tenant.example/auth/v1/health"),
      options.publishableKey,
      fetchImplementation
    ), () => ({
      connect: vi.fn(),
      probe: vi.fn(async () => ({ ready: true }))
    }) as never);

    expect(result).toEqual({ ready: true });
    expect(fetchImplementation).toHaveBeenCalledWith(
      new URL("https://tenant.example/auth/v1/health"),
      expect.objectContaining({ method: "GET", cache: "no-store", redirect: "error" })
    );
  });

  it("fails readiness for an unrelated 200 response", async () => {
    const api = new SupabaseSdkRequestAuthApi(
      { auth: {} } as never,
      new URL("https://tenant.example/auth/v1/health"),
      "sb_publishable_test_key",
      vi.fn(async () => new Response("<html>proxy</html>", {
        headers: { "content-type": "text/html" },
        status: 200
      }))
    );

    await expect(api.probe()).resolves.toEqual({
      ready: false,
      reasonCode: "REQUEST_AUTH_PROVIDER_UNAVAILABLE"
    });
  });
});
