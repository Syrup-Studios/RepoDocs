import { copyFile, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDocumentation } from "@/lib/docs";
import { parseRepositoryUrl, syncRepository } from "@/lib/repository";
import { loadRepositorySources } from "@/lib/repository-configs";
import type { CachedProject } from "@/lib/types";

const generatedDirectory = path.join(process.cwd(), "generated");
const assetsDirectory = path.join(process.cwd(), "public", "repository-assets");
const defaultSyncConcurrency = 4;
const maximumSyncConcurrency = 16;

function syncConcurrency(repositoryCount: number): number {
  const value = process.env.REPODOCS_SYNC_CONCURRENCY;
  if (value === undefined) return Math.min(defaultSyncConcurrency, repositoryCount);
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("REPODOCS_SYNC_CONCURRENCY must be a positive integer.");
  }
  const configured = Number(value);
  if (configured > maximumSyncConcurrency) {
    throw new Error(`REPODOCS_SYNC_CONCURRENCY must not be greater than ${maximumSyncConcurrency}.`);
  }
  return Math.min(configured, repositoryCount);
}

async function copyDocumentationAssets(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (entry.isSymbolicLink() || entry.name === ".nav.yml" || entry.name === "repodocs.yml") return;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDocumentationAssets(sourcePath, destinationPath);
    } else if (entry.isFile() && !entry.name.toLowerCase().endsWith(".md")) {
      await copyFile(sourcePath, destinationPath);
    }
  }));
}

async function syncSource(source: Awaited<ReturnType<typeof loadRepositorySources>>[number]): Promise<CachedProject> {
  process.stdout.write(`Syncing ${source.name}...\n`);
  const parsed = parseRepositoryUrl(source.repository);
  const repository = { ...parsed, slug: source.slug };
  const synced = await syncRepository(repository);
  const project = await buildDocumentation(
    repository,
    synced.directory,
    synced.revision,
    source.name,
  );
  await copyDocumentationAssets(
    path.join(synced.directory, "docs"),
    path.join(assetsDirectory, source.slug),
  );
  process.stdout.write(`Synced ${source.name}: ${Object.keys(project.pages).length} pages.\n`);
  return project;
}

async function main(): Promise<void> {
  const sources = await loadRepositorySources();
  await rm(assetsDirectory, { recursive: true, force: true });
  await mkdir(assetsDirectory, { recursive: true });

  const concurrency = syncConcurrency(sources.length);
  const projects = new Array<CachedProject>(sources.length);
  let nextSource = 0;

  process.stdout.write(`Syncing ${sources.length} repositories with ${concurrency} worker${concurrency === 1 ? "" : "s"}.\n`);
  async function worker(): Promise<void> {
    while (nextSource < sources.length) {
      const index = nextSource;
      nextSource += 1;
      projects[index] = await syncSource(sources[index]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const output = { generatedAt: new Date().toISOString(), projects };
  await mkdir(generatedDirectory, { recursive: true });
  const destination = path.join(generatedDirectory, "docs.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(output), "utf8");
  await rename(temporary, destination);
  process.stdout.write(`Generated ${projects.length} static project${projects.length === 1 ? "" : "s"}.\n`);
}

await main();
