import { getWorkerState } from "./composition/runtime.js";

export { getWorkerState } from "./composition/runtime.js";

if (process.env.NODE_ENV !== "test") {
  process.stdout.write(`${JSON.stringify(getWorkerState())}\n`);
}
