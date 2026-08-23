import {
  createSupabasePrivateStorageService,
  parsePrivateBucketList,
  type PrivateStorageRecoveryPort
} from "@youone/infra-supabase-storage/service";

export function getWorkerPrivateStorage(
  environment: Readonly<Record<string, string | undefined>> = process.env
): PrivateStorageRecoveryPort | null {
  if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY || !environment.SUPABASE_PRIVATE_BUCKETS) {
    return null;
  }
  return createSupabasePrivateStorageService({
    supabaseUrl: environment.SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    privateBuckets: parsePrivateBucketList(environment.SUPABASE_PRIVATE_BUCKETS),
    production: environment.NODE_ENV === "production"
  });
}
