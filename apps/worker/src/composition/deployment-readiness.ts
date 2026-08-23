export const DEPLOYMENT_COMPONENT_IDS = Object.freeze([
  "web.database",
  "web.request-auth",
  "web.offline-sync",
  "worker.database",
  "worker.private-storage"
] as const);

export type DeploymentComponentId = typeof DEPLOYMENT_COMPONENT_IDS[number];
export type DeploymentComponent = Readonly<{
  componentId: DeploymentComponentId;
  reasonCode?: string;
  status: "ready" | "not_ready";
}>;
export type DeploymentReadiness = Readonly<{
  components: readonly DeploymentComponent[];
  status: "ready" | "not_ready";
}>;

const reasonPattern = /^[A-Z][A-Z0-9_]{2,95}$/;
const sourceComponents = Object.freeze({
  "web.database": Object.freeze({ service: "youone-web", component: "database" }),
  "web.request-auth": Object.freeze({ service: "youone-web", component: "request-auth" }),
  "web.offline-sync": Object.freeze({ service: "youone-web", component: "offline-sync" }),
  "worker.database": Object.freeze({ service: "youone-worker", component: "database" }),
  "worker.private-storage": Object.freeze({ service: "youone-worker", component: "private-storage" })
} satisfies Record<DeploymentComponentId, Readonly<{ service: string; component: string }>>);

export function combineDeploymentReadiness(web: unknown, worker: unknown): DeploymentReadiness {
  const inputs = new Map<string, Readonly<{ reasonCode?: string; status: "ready" | "not_ready" }>>();
  const webValid = collectService(web, "youone-web", inputs);
  const workerValid = collectService(worker, "youone-worker", inputs);
  const components = DEPLOYMENT_COMPONENT_IDS.map((componentId): DeploymentComponent => {
    const source = sourceComponents[componentId];
    const value = inputs.get(`${source.service}\0${source.component}`);
    if (!webValid || !workerValid || value === undefined) {
      return Object.freeze({ componentId, status: "not_ready", reasonCode: "DEPLOYMENT_READINESS_PAYLOAD_INVALID" });
    }
    return Object.freeze({ componentId, status: value.status, ...(value.reasonCode ? { reasonCode: value.reasonCode } : {}) });
  });
  return Object.freeze({
    status: components.every((component) => component.status === "ready") ? "ready" : "not_ready",
    components: Object.freeze(components)
  });
}

function collectService(
  input: unknown,
  expectedService: "youone-web" | "youone-worker",
  target: Map<string, Readonly<{ reasonCode?: string; status: "ready" | "not_ready" }>>
): boolean {
  if (!isRecord(input) || input.service !== expectedService || (input.status !== "ready" && input.status !== "not_ready") || !Array.isArray(input.components)) {
    return false;
  }
  const expectedNames = Object.values(sourceComponents)
    .filter((source) => source.service === expectedService)
    .map((source) => source.component);
  const expectedNameSet = new Set<string>(expectedNames);
  if (input.components.length !== expectedNames.length) return false;
  let valid = true;
  for (const item of input.components) {
    if (!isRecord(item) || typeof item.component !== "string" || !expectedNameSet.has(item.component) || (item.status !== "ready" && item.status !== "not_ready")) {
      valid = false;
      continue;
    }
    const key = `${expectedService}\0${item.component}`;
    if (target.has(key)) {
      valid = false;
      continue;
    }
    if (item.status === "ready" && item.reasonCode !== undefined) valid = false;
    if (item.status === "not_ready" && (typeof item.reasonCode !== "string" || !reasonPattern.test(item.reasonCode))) valid = false;
    target.set(key, Object.freeze({
      status: item.status,
      ...(typeof item.reasonCode === "string" && reasonPattern.test(item.reasonCode) ? { reasonCode: item.reasonCode } : {})
    }));
  }
  const componentStatuses = expectedNames.map((name) => target.get(`${expectedService}\0${name}`)?.status);
  const derivedStatus = componentStatuses.every((status) => status === "ready") ? "ready" : "not_ready";
  return valid && input.status === derivedStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
