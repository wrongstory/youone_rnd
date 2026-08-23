import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

type Layer =
  | "shared"
  | "application"
  | "core"
  | "feature"
  | "process"
  | "infrastructure"
  | "ui"
  | "test-support";

type Boundary = Readonly<{
  delivery: string;
  layer: Layer;
  name: string;
  owner: string;
  path: string;
}>;

type BoundaryManifest = Readonly<{
  packages: Boundary[];
  schemaVersion: number;
}>;

const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "config/package-boundaries.json"), "utf8")
) as BoundaryManifest;
const boundaryByName = new Map(manifest.packages.map((boundary) => [boundary.name, boundary]));

const allowedTargetLayers: Record<Layer, readonly Layer[]> = {
  shared: [],
  application: ["shared"],
  core: ["shared", "application", "core"],
  feature: ["shared", "application", "core"],
  process: ["shared", "application", "core", "feature"],
  infrastructure: ["shared", "application", "core", "feature"],
  ui: [],
  "test-support": [
    "shared",
    "application",
    "core",
    "feature",
    "process",
    "infrastructure",
    "ui",
    "test-support"
  ]
};

const providerAllowlist = new Map<string, readonly string[]>([
  ["next", []],
  ["react", ["@youone/ui"]],
  ["@supabase/", ["@youone/infra-supabase-auth", "@youone/infra-supabase-storage"]],
  ["dexie", ["@youone/infra-offline-dexie"]],
  ["pdf-lib", ["@youone/infra-pdf-renderer"]],
  ["@tiptap/", ["@youone/ui"]]
]);

function normalized(path: string): string {
  return path.replaceAll("\\", "/");
}

function walk(directory: string, predicate: (name: string) => boolean): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".next", ".turbo"].includes(entry.name)) {
      continue;
    }

    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(absolute, predicate));
    } else if (predicate(entry.name)) {
      files.push(absolute);
    }
  }

  return files;
}

function sourceFiles(directory: string): string[] {
  return walk(directory, (name) => /\.[cm]?[jt]sx?$/.test(name));
}

function importSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const staticPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicPattern = /(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        specifiers.add(match[1]);
      }
    }
  }

  return [...specifiers];
}

function workspaceDependencyName(specifier: string): string | undefined {
  if (!specifier.startsWith("@youone/")) {
    return undefined;
  }

  const [scope, packageName] = specifier.split("/");
  return packageName ? `${scope}/${packageName}` : undefined;
}

function validatePackageImport(source: Boundary, specifier: string): string | undefined {
  for (const [provider, allowedPackages] of providerAllowlist) {
    const matches =
      specifier === provider ||
      specifier.startsWith(`${provider}/`) ||
      (provider.endsWith("/") && specifier.startsWith(provider));
    if (matches && !allowedPackages.includes(source.name)) {
      return `${source.name} cannot import provider ${specifier}`;
    }
  }

  const dependencyName = workspaceDependencyName(specifier);
  if (!dependencyName) {
    return undefined;
  }

  const target = boundaryByName.get(dependencyName);
  if (!target) {
    return `${source.name} imports unregistered workspace package ${dependencyName}`;
  }

  const suffix = specifier.slice(dependencyName.length);
  if (
    suffix &&
    suffix !== "/public" &&
    !(dependencyName === "@youone/infra-postgres" && ["/identity-resolver", "/request", "/worker"].includes(suffix)) &&
    !(dependencyName === "@youone/infra-supabase-auth" && ["/request", "/service"].includes(suffix))
  ) {
    return `${source.name} deep-imports ${specifier}`;
  }

  if (!allowedTargetLayers[source.layer].includes(target.layer)) {
    return `${source.name} (${source.layer}) cannot depend on ${target.name} (${target.layer})`;
  }

  return undefined;
}

function packageForFile(file: string): Boundary | undefined {
  const path = normalized(relative(root, file));
  return manifest.packages
    .filter((boundary) => path === boundary.path || path.startsWith(`${boundary.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

describe("workspace package inventory", () => {
  it("matches the approved P0 boundary manifest", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(new Set(manifest.packages.map(({ name }) => name)).size).toBe(
      manifest.packages.length
    );
    expect(new Set(manifest.packages.map(({ path }) => path)).size).toBe(
      manifest.packages.length
    );

    const actualPackagePaths = walk(
      resolve(root, "packages"),
      (name) => name === "package.json"
    )
      .map((file) => normalized(relative(root, dirname(file))))
      .sort();
    const expectedPackagePaths = manifest.packages.map(({ path }) => path).sort();
    expect(actualPackagePaths).toEqual(expectedPackagePaths);

    for (const boundary of manifest.packages) {
      const packageDirectory = resolve(root, boundary.path);
      const packageJson = JSON.parse(
        readFileSync(resolve(packageDirectory, "package.json"), "utf8")
      ) as { name?: string; exports?: Record<string, string> };

      expect(packageJson.name, boundary.path).toBe(boundary.name);

      if (boundary.name === "@youone/infra-postgres") {
        expect(packageJson.exports).toEqual({
          "./identity-resolver": "./src/identity-resolver.ts",
          "./request": "./src/request.ts",
          "./worker": "./src/worker.ts"
        });
      } else if (boundary.name === "@youone/infra-supabase-auth") {
        expect(packageJson.exports).toEqual({
          ".": "./src/index.ts",
          "./public": "./src/public.ts",
          "./request": "./src/request.ts",
          "./service": "./src/service.ts"
        });
      } else {
        expect(packageJson.exports).toEqual({
          ".": "./src/index.ts",
          "./public": "./src/public.ts"
        });
        expect(existsSync(resolve(packageDirectory, "src/index.ts"))).toBe(true);
        expect(existsSync(resolve(packageDirectory, "src/public.ts"))).toBe(true);
      }
    }
  });

  it("does not scaffold P1 or P2 packages", () => {
    const forbiddenPaths = [
      "packages/features/allowance",
      "packages/features/equipment",
      "packages/features/ip",
      "packages/features/search",
      "packages/infrastructure/hiworks"
    ];

    expect(forbiddenPaths.filter((path) => existsSync(resolve(root, path)))).toEqual([]);
  });
});

describe("architecture dependency rules", () => {
  it("keeps package imports inside reviewed layer and public-entry rules", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(resolve(root, "packages"))) {
      const boundary = packageForFile(file);
      if (!boundary) {
        violations.push(
          `${normalized(relative(root, file))} has no registered package boundary`
        );
        continue;
      }

      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (specifier.startsWith(".")) {
          const target = resolve(dirname(file), specifier);
          const packageRoot = resolve(root, boundary.path);
          const escaped = normalized(relative(packageRoot, target)).startsWith("../");
          if (escaped) {
            violations.push(
              `${normalized(relative(root, file))} escapes its package with ${specifier}`
            );
          }
          continue;
        }

        const violation = validatePackageImport(boundary, specifier);
        if (violation) {
          violations.push(`${normalized(relative(root, file))}: ${violation}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps declared workspace dependencies inside the same layer rules", () => {
    const violations: string[] = [];

    for (const boundary of manifest.packages) {
      const packageJson = JSON.parse(
        readFileSync(resolve(root, boundary.path, "package.json"), "utf8")
      ) as Record<string, Record<string, string> | string | boolean>;
      const dependencies = {
        ...(typeof packageJson.dependencies === "object" ? packageJson.dependencies : {}),
        ...(typeof packageJson.peerDependencies === "object"
          ? packageJson.peerDependencies
          : {})
      };

      for (const dependency of Object.keys(dependencies)) {
        const violation = validatePackageImport(boundary, dependency);
        if (violation) {
          violations.push(`${boundary.path}/package.json: ${violation}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("proves representative forbidden imports are rejected", () => {
    const feature = boundaryByName.get("@youone/feature-project");
    const core = boundaryByName.get("@youone/core-approval");
    const process = boundaryByName.get("@youone/process-formal-research-designation");
    const shared = boundaryByName.get("@youone/shared-kernel");

    expect(
      feature && validatePackageImport(feature, "@youone/feature-contract/public")
    ).toContain("cannot depend");
    expect(core && validatePackageImport(core, "@supabase/supabase-js")).toContain(
      "cannot import provider"
    );
    expect(
      process &&
        validatePackageImport(process, "@youone/feature-project/src/domain/project")
    ).toContain("deep-imports");
    expect(
      shared && validatePackageImport(shared, "@youone/application-kernel/public")
    ).toContain("cannot depend");
  });
});

describe("web and worker composition isolation", () => {
  it("keeps worker credentials and worker-only adapters out of web source", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(resolve(root, "apps/web/src"))) {
      const path = normalized(relative(root, file));
      const source = readFileSync(file, "utf8");
      if (
        source.includes("SUPABASE_SERVICE_ROLE_KEY") ||
        source.includes("SUPABASE_SECRET_KEY") ||
        source.includes("WORKER_DATABASE_URL")
      ) {
        violations.push(`${path} references a worker-only credential`);
      }

      for (const specifier of importSpecifiers(source)) {
        if (
          specifier === "@youone/infra-postgres/worker" ||
          specifier.startsWith("@youone/worker")
        ) {
          violations.push(`${path} imports ${specifier}`);
        }
        const isRequestInterface =
          path.startsWith("apps/web/src/interface/") || path.startsWith("apps/web/src/app/");
        if (
          isRequestInterface &&
          (specifier.startsWith("@youone/infra-") ||
            specifier.startsWith("@supabase/") ||
            specifier === "dexie")
        ) {
          violations.push(`${path} bypasses Application through ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps web/UI and request-only adapters out of worker source", () => {
    const violations = sourceFiles(resolve(root, "apps/worker/src")).flatMap((file) =>
      importSpecifiers(readFileSync(file, "utf8"))
        .filter(
          (specifier) =>
            specifier.startsWith("@youone/web") ||
            specifier.startsWith("@youone/ui") ||
            specifier === "@youone/infra-postgres/identity-resolver" ||
            specifier === "@youone/infra-postgres/request" ||
            specifier === "@youone/infra-supabase-auth/request"
        )
        .map((specifier) => `${normalized(relative(root, file))} imports ${specifier}`)
    );

    expect(violations).toEqual([]);
  });

  it("keeps privileged Supabase Auth service adapters out of the Web runtime", () => {
    const violations = sourceFiles(resolve(root, "apps/web/src")).flatMap((file) => {
      const path = normalized(relative(root, file));
      return importSpecifiers(readFileSync(file, "utf8"))
        .filter((specifier) => specifier === "@youone/infra-supabase-auth/service")
        .map((specifier) => `${path} imports ${specifier}`);
    });

    expect(violations).toEqual([]);
  });
});
