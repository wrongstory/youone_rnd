import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const bannedProviderImports = ["next", "react", "@supabase/", "dexie"];

function sourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(absolute));
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(absolute);
    }
  }

  return files;
}

describe("architecture boundaries", () => {
  it("keeps provider SDKs out of kernel sources", () => {
    const files = sourceFiles(resolve(root, "packages")).filter((file) => {
      const path = relative(root, file).replaceAll("\\", "/");
      return !path.startsWith("packages/infrastructure/") && !path.startsWith("packages/ui/");
    });

    const violations = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return bannedProviderImports
        .filter((dependency) => source.includes(`from \"${dependency}`) || source.includes(`from '${dependency}`))
        .map((dependency) => `${relative(root, file)} imports ${dependency}`);
    });

    expect(violations).toEqual([]);
  });
});
