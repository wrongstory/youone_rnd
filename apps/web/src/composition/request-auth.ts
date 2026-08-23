import { TrustedActorContextFactory } from "@youone/core-authorization/public";
import {
  IdentityResolverDatabaseBoundaryError,
  PostgresActorContextSource,
  createNodePostgresIdentityResolverPool,
  type NodePostgresIdentityResolverPoolOptions,
  type SqlPool
} from "@youone/infra-postgres/identity-resolver";
import {
  SupabaseRequestAuthBoundaryError,
  SupabaseServerSessionVerifier,
  createSupabaseRequestAuthApi,
  type SupabaseRequestAuthRuntimeOptions,
  type SupabaseSdkRequestAuthApi
} from "@youone/infra-supabase-auth/request";
import { utcInstant } from "@youone/shared-kernel/public";
import { createHash } from "node:crypto";

import { writeSecurityLog } from "./security-log";

export type RequestAuthReadiness = Readonly<
  | { ready: true }
  | {
      ready: false;
      reasonCode:
        | "REQUEST_AUTH_CONFIG_INVALID"
        | "REQUEST_AUTH_CONFIG_MISSING"
        | "REQUEST_AUTH_PROVIDER_UNAVAILABLE"
        | "IDENTITY_RESOLVER_CONFIG_MISSING"
        | "IDENTITY_RESOLVER_CAPABILITY_UNAVAILABLE"
        | "IDENTITY_RESOLVER_CONNECTION_FAILED"
        | "IDENTITY_RESOLVER_PRINCIPAL_INVALID";
    }
>;

type RequestAuthFactory = (
  options: SupabaseRequestAuthRuntimeOptions
) => SupabaseSdkRequestAuthApi;

type IdentityResolverPool = SqlPool & Readonly<{
  probe(): Promise<Readonly<{ ready: true }>>;
}>;

type IdentityResolverPoolFactory = (
  options: NodePostgresIdentityResolverPoolOptions
) => IdentityResolverPool;

let cachedRuntime: Readonly<{ configurationKey: string; value: SupabaseSdkRequestAuthApi }> | undefined;
let cachedIdentityPool: Readonly<{ configurationKey: string; value: IdentityResolverPool }> | undefined;

export function requestActorContextFactory(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  authFactory: RequestAuthFactory = createSupabaseRequestAuthApi,
  identityPoolFactory: IdentityResolverPoolFactory = createNodePostgresIdentityResolverPool
): TrustedActorContextFactory | null {
  const runtime = requestAuthRuntime(environment, authFactory);
  const identityPool = identityResolverPool(environment, identityPoolFactory);
  if (runtime === null || identityPool === null) return null;
  return new TrustedActorContextFactory(
    new SupabaseServerSessionVerifier(runtime),
    new PostgresActorContextSource(identityPool),
    { now: () => utcInstant(new Date()) }
  );
}

export async function probeRequestAuth(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  factory: RequestAuthFactory = createSupabaseRequestAuthApi,
  identityPoolFactory: IdentityResolverPoolFactory = createNodePostgresIdentityResolverPool
): Promise<RequestAuthReadiness> {
  try {
    const runtime = requestAuthRuntime(environment, factory);
    if (runtime === null) {
      return Object.freeze({ ready: false, reasonCode: "REQUEST_AUTH_CONFIG_MISSING" });
    }
    const identityPool = identityResolverPool(environment, identityPoolFactory);
    if (identityPool === null) {
      return Object.freeze({ ready: false, reasonCode: "IDENTITY_RESOLVER_CONFIG_MISSING" });
    }
    const [provider] = await Promise.all([runtime.probe(), identityPool.probe()]);
    return provider;
  } catch (error) {
    return Object.freeze({
      ready: false,
      reasonCode: error instanceof SupabaseRequestAuthBoundaryError
        ? error.reasonCode
        : error instanceof IdentityResolverDatabaseBoundaryError
          ? error.reasonCode
          : "REQUEST_AUTH_PROVIDER_UNAVAILABLE"
    });
  }
}

function identityResolverPool(
  environment: Readonly<Record<string, string | undefined>>,
  factory: IdentityResolverPoolFactory
): IdentityResolverPool | null {
  const connectionString = environment.IDENTITY_RESOLVER_DATABASE_URL;
  if (!connectionString) return null;
  const tls = environment.IDENTITY_RESOLVER_DATABASE_TLS_MODE ?? "verify-full";
  if (tls !== "disable" && tls !== "verify-full") {
    throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_CONNECTION_FAILED");
  }
  if (environment.NODE_ENV === "production" && tls !== "verify-full") {
    throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_CONNECTION_FAILED");
  }
  const configurationKey = fingerprint({ connectionString, tls });
  if (factory === createNodePostgresIdentityResolverPool && cachedIdentityPool) {
    if (cachedIdentityPool.configurationKey !== configurationKey) {
      throw new IdentityResolverDatabaseBoundaryError("IDENTITY_RESOLVER_CONNECTION_FAILED");
    }
    return cachedIdentityPool.value;
  }
  const pool = factory({
    connectionString,
    tls,
    onIdleClientError: () => writeSecurityLog({
      event: "IDENTITY_RESOLVER_IDLE_CLIENT_ERROR",
      correlationId: "system:identity-resolver-pool",
      route: "runtime:identity-resolver",
      outcome: "IDENTITY_RESOLVER_CONNECTION_FAILED",
      status: 503
    })
  });
  if (factory === createNodePostgresIdentityResolverPool) {
    cachedIdentityPool = Object.freeze({ configurationKey, value: pool });
  }
  return pool;
}

function requestAuthRuntime(
  environment: Readonly<Record<string, string | undefined>>,
  factory: RequestAuthFactory
): SupabaseSdkRequestAuthApi | null {
  const supabaseUrl = environment.SUPABASE_URL;
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return null;
  const requestTimeoutMillis = positiveInteger(environment.REQUEST_AUTH_TIMEOUT_MS, 5_000);
  const configurationKey = fingerprint({
    production: environment.NODE_ENV === "production",
    publishableKey,
    requestTimeoutMillis,
    supabaseUrl
  });
  if (factory === createSupabaseRequestAuthApi && cachedRuntime) {
    if (cachedRuntime.configurationKey !== configurationKey) {
      throw new SupabaseRequestAuthBoundaryError("REQUEST_AUTH_CONFIG_INVALID");
    }
    return cachedRuntime.value;
  }
  const runtime = factory({
    production: environment.NODE_ENV === "production",
    publishableKey,
    requestTimeoutMillis,
    supabaseUrl
  });
  if (factory === createSupabaseRequestAuthApi) {
    cachedRuntime = Object.freeze({ configurationKey, value: runtime });
  }
  return runtime;
}

function fingerprint(configuration: object): string {
  return createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 500 || parsed > 30_000) {
    throw new SupabaseRequestAuthBoundaryError("REQUEST_AUTH_CONFIG_INVALID");
  }
  return parsed;
}
