import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = process.cwd();
const itemName = process.argv[2];
const registryUrl = process.env.APP_KIT_REGISTRY_URL ?? "http://127.0.0.1:3000/r/{name}.json";

if (!itemName) {
  throw new Error("Usage: bun run registry:verify -- <registry-item-name>");
}

type RegistryItem = {
  dependencies?: string[];
  registryDependencies?: string[];
  files?: { path: string }[];
};

async function run(args: string[], cwd = repoRoot) {
  await execFile(process.execPath, args, { cwd, windowsHide: true });
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const candidate = join(directory, entry.name);
      if (entry.isDirectory()) return filesBelow(candidate);
      return [candidate];
    })
  );
  return nested.flat();
}

async function verifyFixture(fixtureName: string, item: RegistryItem) {
  const source = join(repoRoot, "fixtures", fixtureName);
  const target = await mkdtemp(
    join(repoRoot, ".scratch", `registry-install-${fixtureName}-`)
  );

  try {
    await cp(source, target, { recursive: true });
    const fixtureConfigPath = join(target, "components.json");
    const fixtureConfig = await readFile(fixtureConfigPath, "utf8");
    await writeFile(
      fixtureConfigPath,
      fixtureConfig.replace("http://127.0.0.1:3000/r/{name}.json", registryUrl)
    );

    const addArgs = ["x", "--bun", "shadcn@latest", "add", `@app-kit/${itemName}`];
    await run([...addArgs, "--dry-run"], target);
    await run(addArgs, target);
    await run(["x", "tsc", "--noEmit"], target);

    const installedFiles = await filesBelow(target);
    for (const file of item.files ?? []) {
      const expectedName = basename(file.path);
      if (!installedFiles.some((installed) => basename(installed) === expectedName)) {
        throw new Error(`${fixtureName} did not receive ${expectedName}`);
      }
    }

    const packageJson = JSON.parse(await readFile(join(target, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const dependency of item.dependencies ?? []) {
      if (!declared[dependency]) {
        throw new Error(`${fixtureName} package.json is missing ${dependency}`);
      }
    }

    const sourceFiles = installedFiles.filter((file) => /\.(?:ts|tsx)$/.test(file));
    for (const sourceFile of sourceFiles) {
      const sourceText = await readFile(sourceFile, "utf8");
      if (/from\s+["']@\/registry(?:["']|\/)/.test(sourceText)) {
        throw new Error(`${fixtureName} retained an @/registry import in ${relative(target, sourceFile)}`);
      }
      const isClientEntry = fixtureName === "spa-vite" || /\.client\.[jt]sx?$/.test(sourceFile);
      if (isClientEntry && /from\s+["'][^"']+\.server(?:["']|\.)/.test(sourceText)) {
        throw new Error(`${fixtureName} client graph imports a server entry in ${relative(target, sourceFile)}`);
      }
    }
  } finally {
    await rm(target, { recursive: true, force: true });
  }
}

await run(["run", "registry:build"]);
const item = JSON.parse(
  await readFile(join(repoRoot, "public", "r", `${itemName}.json`), "utf8")
) as RegistryItem;

await verifyFixture("next-app-router", item);
await verifyFixture("spa-vite", item);

console.log(`Registry install matrix passed for ${itemName}.`);
