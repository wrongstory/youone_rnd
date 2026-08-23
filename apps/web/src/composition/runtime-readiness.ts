import type { OfflineSyncEndpoint } from "./offline-sync";

export type ReadinessComponent = Readonly<{
  component: "database" | "request-auth" | "offline-sync";
  status: "ready" | "not_ready";
  reasonCode?: string;
}>;

export type RuntimeReadiness = Readonly<{
  service: "youone-web";
  status: "ready" | "not_ready";
  components: readonly ReadinessComponent[];
}>;

export type RuntimeCapabilities = Readonly<{
  requestDatabase: boolean;
  requestDatabaseReasonCode?: string;
  requestAuth: boolean;
  requestAuthReasonCode?: string;
}>;

export function getRuntimeReadiness(
  environment: Readonly<Record<string, string | undefined>>,
  syncEndpoint: OfflineSyncEndpoint | null,
  capabilities: RuntimeCapabilities = { requestDatabase: false, requestAuth: false }
): RuntimeReadiness {
  const components: ReadinessComponent[] = [
    environment.REQUEST_DATABASE_URL && capabilities.requestDatabase
      ? { component: "database", status: "ready" }
      : {
          component: "database",
          status: "not_ready",
          reasonCode: environment.REQUEST_DATABASE_URL
            ? capabilities.requestDatabaseReasonCode ?? "REQUEST_DATABASE_ADAPTER_NOT_CONFIGURED"
            : "REQUEST_DATABASE_URL_MISSING"
        },
    environment.SUPABASE_URL && environment.SUPABASE_PUBLISHABLE_KEY && capabilities.requestAuth
      ? { component: "request-auth", status: "ready" }
      : {
          component: "request-auth",
          status: "not_ready",
          reasonCode: environment.SUPABASE_URL && environment.SUPABASE_PUBLISHABLE_KEY
            ? capabilities.requestAuthReasonCode ?? "REQUEST_AUTH_ADAPTER_NOT_CONFIGURED"
            : "REQUEST_AUTH_CONFIG_MISSING"
        },
    syncEndpoint
      ? { component: "offline-sync", status: "ready" }
      : { component: "offline-sync", status: "not_ready", reasonCode: "SYNC_REQUEST_ADAPTER_NOT_CONFIGURED" }
  ];

  return Object.freeze({
    service: "youone-web",
    status: components.every((item) => item.status === "ready") ? "ready" : "not_ready",
    components: Object.freeze(components.map((item) => Object.freeze(item)))
  });
}
