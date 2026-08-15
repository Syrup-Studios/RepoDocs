import { copyFile, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDocumentation } from "@/lib/docs";
import { parseRepositoryUrl, syncRepository } from "@/lib/repository";
import { loadRepositorySources } from "@/lib/repository-configs";
import type { CachedProject } from "@/lib/types";

const generatedDirectory = path.join(process.cwd(), "generated");
const assetsDirectory = path.join(process.cwd(), "public", "repository-assets");

async function copyDocumentationAssets(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name === ".nav.yml" || entry.name === "repodocs.yml") continue;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDocumentationAssets(sourcePath, destinationPath);
    } else if (entry.isFile() && !entry.name.toLowerCase().endsWith(".md")) {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

async function main(): Promise<void> {
  const sources = await loadRepositorySources();
  await rm(assetsDirectory, { recursive: true, force: true });
  await mkdir(assetsDirectory, { recursive: true });

  const projects: CachedProject[] = [];
  for (const source of sources) {
    process.stdout.write(`Syncing ${source.name}... `);
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
    projects.push(project);
    process.stdout.write(`${Object.keys(project.pages).length} pages\n`);
  }

  const output = { generatedAt: new Date().toISOString(), projects };
  await mkdir(generatedDirectory, { recursive: true });
  const destination = path.join(generatedDirectory, "docs.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(output), "utf8");
  await rename(temporary, destination);
  process.stdout.write(`Generated ${projects.length} static project${projects.length === 1 ? "" : "s"}.\n`);
}

await main();
