export type WorkerReadinessComponent = Readonly<{
  component: "database" | "private-storage";
  status: "ready" | "not_ready";
  reasonCode?: string;
}>;

export type WorkerState = Readonly<{
  service: "youone-worker";
  status: "ready" | "not_ready";
  components: readonly WorkerReadinessComponent[];
}>;

export interface WorkerCapabilityProbe {
  probe(): Promise<Readonly<{ ready: boolean; reasonCode?: string }>>;
}

export async function getWorkerState(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  probes: Readonly<{ database?: WorkerCapabilityProbe; privateStorage?: WorkerCapabilityProbe }> = {}
): Promise<WorkerState> {
  const timeoutMillis = readinessTimeout(environment.WORKER_READINESS_TIMEOUT_MS);
  if (timeoutMillis === null) {
    return Object.freeze({
      service: "youone-worker",
      status: "not_ready",
      components: Object.freeze([
        Object.freeze({ component: "database", status: "not_ready", reasonCode: "WORKER_READINESS_CONFIG_INVALID" }),
        Object.freeze({ component: "private-storage", status: "not_ready", reasonCode: "WORKER_READINESS_CONFIG_INVALID" })
      ])
    });
  }
  const components = await Promise.all([
    probeComponent("database", environment.WORKER_DATABASE_URL, probes.database, "WORKER_DATABASE_URL_MISSING", "WORKER_DATABASE_ADAPTER_NOT_CONFIGURED", timeoutMillis),
    probeComponent(
      "private-storage",
      environment.SUPABASE_URL && environment.SUPABASE_SERVICE_ROLE_KEY && environment.SUPABASE_PRIVATE_BUCKETS,
      probes.privateStorage,
      "PRIVATE_STORAGE_CONFIG_MISSING",
      "PRIVATE_STORAGE_ADAPTER_NOT_CONFIGURED",
      timeoutMillis
    )
  ]);
  return Object.freeze({
    service: "youone-worker",
    status: components.every((component) => component.status === "ready") ? "ready" : "not_ready",
    components: Object.freeze(components)
  });
}

async function probeComponent(
  component: WorkerReadinessComponent["component"],
  configured: string | undefined,
  probe: WorkerCapabilityProbe | undefined,
  missingReason: string,
  adapterReason: string,
  timeoutMillis: number
): Promise<WorkerReadinessComponent> {
  if (!configured) return Object.freeze({ component, status: "not_ready", reasonCode: missingReason });
  if (!probe) return Object.freeze({ component, status: "not_ready", reasonCode: adapterReason });
  try {
    const result = await withTimeout(probe.probe(), timeoutMillis);
    return result.ready
      ? Object.freeze({ component, status: "ready" })
      : Object.freeze({ component, status: "not_ready", reasonCode: result.reasonCode ?? adapterReason });
  } catch {
    return Object.freeze({ component, status: "not_ready", reasonCode: adapterReason });
  }
}

function readinessTimeout(raw: string | undefined): number | null {
  if (raw === undefined) return 5_000;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 500 && value <= 30_000 ? value : null;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMillis: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("WORKER_READINESS_TIMEOUT")), timeoutMillis);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
