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
  const components = await Promise.all([
    probeComponent("database", environment.WORKER_DATABASE_URL, probes.database, "WORKER_DATABASE_URL_MISSING", "WORKER_DATABASE_ADAPTER_NOT_CONFIGURED"),
    probeComponent(
      "private-storage",
      environment.SUPABASE_URL && environment.SUPABASE_SERVICE_ROLE_KEY && environment.SUPABASE_PRIVATE_BUCKETS,
      probes.privateStorage,
      "PRIVATE_STORAGE_CONFIG_MISSING",
      "PRIVATE_STORAGE_ADAPTER_NOT_CONFIGURED"
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
  adapterReason: string
): Promise<WorkerReadinessComponent> {
  if (!configured) return Object.freeze({ component, status: "not_ready", reasonCode: missingReason });
  if (!probe) return Object.freeze({ component, status: "not_ready", reasonCode: adapterReason });
  try {
    const result = await probe.probe();
    return result.ready
      ? Object.freeze({ component, status: "ready" })
      : Object.freeze({ component, status: "not_ready", reasonCode: result.reasonCode ?? adapterReason });
  } catch {
    return Object.freeze({ component, status: "not_ready", reasonCode: adapterReason });
  }
}
