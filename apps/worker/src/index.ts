type WorkerState = Readonly<{
  service: "youone-worker";
  status: "ready";
}>;

export function getWorkerState(): WorkerState {
  return { service: "youone-worker", status: "ready" };
}

if (process.env.NODE_ENV !== "test") {
  process.stdout.write(`${JSON.stringify(getWorkerState())}\n`);
}
