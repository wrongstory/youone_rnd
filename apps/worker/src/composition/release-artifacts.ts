import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ReleaseArtifactReader, ReleaseEvidenceId } from "./release-evidence.js";

/** Artifact filenames are derived only from the closed evidence ID set, never from release input. */
export function filesystemReleaseArtifactReader(rootPath: string): ReleaseArtifactReader {
  if (rootPath.trim().length === 0) throw new Error("R06_ARTIFACT_ROOT_INVALID");
  const root = resolve(rootPath);
  return Object.freeze({
    read: async (evidenceId: ReleaseEvidenceId) => readFile(resolve(root, `${evidenceId}.artifact`))
  });
}
