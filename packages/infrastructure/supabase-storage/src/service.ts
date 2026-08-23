import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_STORAGE_SERVICE_BOUNDARY = Object.freeze({
  privileged: true as const,
  serverOnly: true as const
});

export type PrivateStorageObject = Readonly<{
  bucket: string;
  objectKey: string;
}>;

export type PrivateStorageObjectHead = Readonly<{
  contentType: string;
  sizeBytes: number;
}>;

export type PrivateStorageProbe = Readonly<
  | { ready: true }
  | {
      ready: false;
      reasonCode:
        | "PRIVATE_STORAGE_CONFIG_INVALID"
        | "PRIVATE_STORAGE_PROVIDER_UNAVAILABLE"
        | "PRIVATE_STORAGE_PUBLIC_BUCKET";
    }
>;

export interface PrivateStorageRecoveryPort {
  readonly instanceId: string;
  readonly privateBuckets: readonly string[];
  probe(): Promise<PrivateStorageProbe>;
  listObjects(bucket: string): Promise<readonly PrivateStorageObject[]>;
  headObject(bucket: string, objectKey: string): Promise<PrivateStorageObjectHead>;
  downloadObject(bucket: string, objectKey: string): Promise<Uint8Array>;
  objectExists(bucket: string, objectKey: string): Promise<boolean>;
  uploadObjectWithoutOverwrite(bucket: string, objectKey: string, bytes: Uint8Array): Promise<void>;
}

export type SupabasePrivateStorageRuntimeOptions = Readonly<{
  fetch?: typeof globalThis.fetch;
  privateBuckets: readonly string[];
  production: boolean;
  requestTimeoutMillis?: number;
  serviceRoleKey: string;
  supabaseUrl: string;
}>;

type BucketResult = Awaited<ReturnType<SupabaseClient["storage"]["getBucket"]>>;
type FileApi = ReturnType<SupabaseClient["storage"]["from"]>;

export interface SupabaseStorageSdkBoundary {
  getBucket(bucket: string): Promise<BucketResult>;
  from(bucket: string): Pick<FileApi, "download" | "exists" | "info" | "listV2" | "upload">;
}

export class SupabasePrivateStorageServiceError extends Error {
  public constructor(
    public readonly reasonCode:
      | "PRIVATE_STORAGE_CONFIG_INVALID"
      | "PRIVATE_STORAGE_OBJECT_INVALID"
      | "PRIVATE_STORAGE_PROVIDER_UNAVAILABLE"
      | "PRIVATE_STORAGE_PUBLIC_BUCKET"
      | "PRIVATE_STORAGE_RESTORE_CONFLICT",
    options?: ErrorOptions
  ) {
    super(reasonCode, options);
    this.name = "SupabasePrivateStorageServiceError";
  }
}

export class SupabaseSdkPrivateStorageService implements PrivateStorageRecoveryPort {
  public readonly instanceId: string;
  public readonly privateBuckets: readonly string[];

  public constructor(
    private readonly storage: SupabaseStorageSdkBoundary,
    instanceId: string,
    privateBuckets: readonly string[]
  ) {
    this.instanceId = normalizedInstanceId(instanceId);
    this.privateBuckets = validatedBuckets(privateBuckets);
  }

  public async probe(): Promise<PrivateStorageProbe> {
    try {
      for (const bucket of this.privateBuckets) {
        const result = await this.storage.getBucket(bucket);
        if (result.error !== null || result.data === null) {
          return Object.freeze({ ready: false, reasonCode: "PRIVATE_STORAGE_PROVIDER_UNAVAILABLE" });
        }
        if (result.data.public) {
          return Object.freeze({ ready: false, reasonCode: "PRIVATE_STORAGE_PUBLIC_BUCKET" });
        }
      }
      return Object.freeze({ ready: true });
    } catch {
      return Object.freeze({ ready: false, reasonCode: "PRIVATE_STORAGE_PROVIDER_UNAVAILABLE" });
    }
  }

  public async listObjects(bucket: string): Promise<readonly PrivateStorageObject[]> {
    await this.assertPrivateBucket(bucket);
    const objects: PrivateStorageObject[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pageCount = 0;

    do {
      if (++pageCount > 10_000) throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE");
      let result: Awaited<ReturnType<FileApi["listV2"]>>;
      try {
        result = await this.storage.from(bucket).listV2({
          ...(cursor === undefined ? {} : { cursor }),
          limit: 1_000,
          prefix: "",
          sortBy: { column: "name", order: "asc" },
          with_delimiter: false
        });
      } catch (error) {
        throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE", { cause: error });
      }
      if (result.error !== null || result.data === null) {
        throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE");
      }
      for (const item of result.data.objects) {
        const objectKey = item.key ?? item.name;
        assertObjectKey(objectKey);
        if (seen.has(objectKey)) throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_OBJECT_INVALID");
        seen.add(objectKey);
        objects.push(Object.freeze({ bucket, objectKey }));
      }
      const nextCursor = result.data.nextCursor;
      if (result.data.hasNext && (nextCursor === undefined || nextCursor === cursor)) {
        throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE");
      }
      cursor = result.data.hasNext ? nextCursor : undefined;
    } while (cursor !== undefined);

    return Object.freeze(objects);
  }

  public async downloadObject(bucket: string, objectKey: string): Promise<Uint8Array> {
    await this.assertPrivateBucket(bucket);
    assertObjectKey(objectKey);
    try {
      const result = await this.storage.from(bucket).download(objectKey);
      if (result.error !== null || result.data === null) {
        throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE");
      }
      return new Uint8Array(await result.data.arrayBuffer());
    } catch (error) {
      if (error instanceof SupabasePrivateStorageServiceError) throw error;
      throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE", { cause: error });
    }
  }

  public async headObject(bucket: string, objectKey: string): Promise<PrivateStorageObjectHead> {
    await this.assertPrivateBucket(bucket);
    assertObjectKey(objectKey);
    try {
      const result = await this.storage.from(bucket).info(objectKey);
      if (result.error !== null || result.data === null || !Number.isSafeInteger(result.data.size) || (result.data.size ?? -1) < 0) {
        throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE");
      }
      return Object.freeze({
        contentType: result.data.contentType?.trim() || "application/octet-stream",
        sizeBytes: result.data.size ?? 0
      });
    } catch (error) {
      if (error instanceof SupabasePrivateStorageServiceError) throw error;
      throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE", { cause: error });
    }
  }

  public async objectExists(bucket: string, objectKey: string): Promise<boolean> {
    await this.assertPrivateBucket(bucket);
    assertObjectKey(objectKey);
    try {
      const result = await this.storage.from(bucket).exists(objectKey);
      if (result.error !== null) throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE");
      return result.data;
    } catch (error) {
      if (error instanceof SupabasePrivateStorageServiceError) throw error;
      throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE", { cause: error });
    }
  }

  public async uploadObjectWithoutOverwrite(bucket: string, objectKey: string, bytes: Uint8Array): Promise<void> {
    await this.assertPrivateBucket(bucket);
    assertObjectKey(objectKey);
    if (await this.objectExists(bucket, objectKey)) {
      throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_RESTORE_CONFLICT");
    }
    try {
      const result = await this.storage.from(bucket).upload(objectKey, bytes, {
        cacheControl: "0",
        contentType: "application/octet-stream",
        upsert: false
      });
      if (result.error !== null || result.data === null) {
        throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_RESTORE_CONFLICT");
      }
    } catch (error) {
      if (error instanceof SupabasePrivateStorageServiceError) throw error;
      throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE", { cause: error });
    }
  }

  private async assertPrivateBucket(bucket: string): Promise<void> {
    assertBucket(bucket);
    if (!this.privateBuckets.includes(bucket)) {
      throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_CONFIG_INVALID");
    }
    try {
      const result = await this.storage.getBucket(bucket);
      if (result.error !== null || result.data === null) {
        throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE");
      }
      if (result.data.public) throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PUBLIC_BUCKET");
    } catch (error) {
      if (error instanceof SupabasePrivateStorageServiceError) throw error;
      throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_PROVIDER_UNAVAILABLE", { cause: error });
    }
  }
}

export function createSupabasePrivateStorageService(
  options: SupabasePrivateStorageRuntimeOptions
): SupabaseSdkPrivateStorageService {
  const baseUrl = validatedSupabaseUrl(options.supabaseUrl, options.production);
  assertServiceRoleKey(options.serviceRoleKey);
  const buckets = validatedBuckets(options.privateBuckets);
  const timeoutMillis = boundedTimeout(options.requestTimeoutMillis ?? 10_000);
  const client = createClient(baseUrl.toString(), options.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: boundedFetch(options.fetch ?? globalThis.fetch, timeoutMillis) }
  });
  return new SupabaseSdkPrivateStorageService(client.storage, baseUrl.origin, buckets);
}

export function parsePrivateBucketList(value: string): readonly string[] {
  return validatedBuckets(value.split(",").map((item) => item.trim()).filter(Boolean));
}

function validatedSupabaseUrl(value: string, production: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_CONFIG_INVALID", { cause: error });
  }
  const protocolAllowed = production ? url.protocol === "https:" : url.protocol === "https:" || url.protocol === "http:";
  if (!protocolAllowed || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || (url.pathname !== "" && url.pathname !== "/")) {
    throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_CONFIG_INVALID");
  }
  url.pathname = "/";
  return url;
}

function normalizedInstanceId(value: string): string {
  const url = validatedSupabaseUrl(value, false);
  return url.origin;
}

function validatedBuckets(values: readonly string[]): readonly string[] {
  if (values.length === 0) throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_CONFIG_INVALID");
  const unique = new Set(values);
  if (unique.size !== values.length) throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_CONFIG_INVALID");
  for (const bucket of values) assertBucket(bucket);
  return Object.freeze([...values]);
}

function assertBucket(value: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(value)) {
    throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_CONFIG_INVALID");
  }
}

function assertObjectKey(value: string): void {
  const segments = value.split("/");
  if (
    value.length === 0 ||
    value.length > 1_024 ||
    /^(?:https?:|\/)/i.test(value) ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_OBJECT_INVALID");
  }
}

function assertServiceRoleKey(value: string): void {
  const key = value.trim();
  if (key.length < 16 || /\s/.test(key)) throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_CONFIG_INVALID");
  if (key.startsWith("sb_secret_")) return;
  if (legacyJwtRole(key) !== "service_role") throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_CONFIG_INVALID");
}

function legacyJwtRole(value: string): string | undefined {
  const payload = value.split(".")[1];
  if (!payload) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown };
    return typeof decoded.role === "string" ? decoded.role : undefined;
  } catch {
    return undefined;
  }
}

function boundedTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 500 || value > 60_000) {
    throw new SupabasePrivateStorageServiceError("PRIVATE_STORAGE_CONFIG_INVALID");
  }
  return value;
}

function boundedFetch(delegate: typeof globalThis.fetch, timeoutMillis: number): typeof globalThis.fetch {
  return async (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMillis);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return delegate(input, { ...init, signal });
  };
}
