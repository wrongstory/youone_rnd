export const IDENTITY_RESOLVER_DATABASE_BOUNDARY = Object.freeze({
  principal: "youone_identity_resolver" as const,
  bypassRls: false as const,
  serverOnly: true as const,
  acceptsVerifiedSubjectOnly: true as const
});

export { PostgresActorContextSource } from "./identity";
export { PostgresAuthSessionPresenceSource } from "./auth-session";
export {
  IdentityResolverDatabaseBoundaryError,
  NodePostgresIdentityResolverPool,
  createNodePostgresIdentityResolverPool,
  type IdentityResolverDatabaseOperationalEvent,
  type NodePostgresIdentityResolverPoolOptions
} from "./node-identity-resolver-pool";
export type { SqlConnection, SqlPool, SqlQueryResult } from "./driver";
