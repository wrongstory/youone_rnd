export type WorkerState = Readonly<{
  service: "youone-worker";
  status: "ready";
}>;

export function getWorkerState(): WorkerState {
  return { service: "youone-worker", status: "ready" };
}
