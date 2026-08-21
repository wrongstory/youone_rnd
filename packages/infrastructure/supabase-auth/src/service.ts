export const SUPABASE_SERVICE_BOUNDARY = Object.freeze({ privileged: true as const, serverOnly: true as const });
export interface SupabaseServiceAuthApi { disableUser(authSubject: string): Promise<void>; }
export class SupabaseServiceAuthAdapter {
  constructor(private readonly api: SupabaseServiceAuthApi) {}
  disableUser(authSubject: string): Promise<void> { return this.api.disableUser(authSubject); }
}
