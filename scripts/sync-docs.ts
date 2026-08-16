import { copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDocumentation, MissingDocumentationError } from "@/lib/docs";
import { renderMarkdown } from "@/lib/markdown";
import { parseRepositoryUrl, readRepositoryDefaultAuthor, readRepositoryFileHistory, readRepositoryRevision, syncRepository } from "@/lib/repository";
import { loadRepositorySources } from "@/lib/repository-configs";
import type { CachedProject } from "@/lib/types";

const siteDocumentationPath = path.join("docs", "index.md");

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

async function copyRootReadmeAssets(
  repositoryDirectory: string,
  destination: string,
  project: CachedProject,
): Promise<void> {
  const landingPage = project.pages[project.defaultPage];
  if (landingPage?.sourcePath !== "README.md") return;

  const publicPrefix = `/repository-assets/${project.slug}/_root/`;
  const imageSources = [...landingPage.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)]
    .map((match) => match[1])
    .filter((source) => source.startsWith(publicPrefix));
  const repositoryRoot = await realpath(repositoryDirectory);
  await Promise.all([...new Set(imageSources)].map(async (source) => {
    const relativePath = decodeURIComponent(new URL(source, "https://repodocs.invalid").pathname.slice(publicPrefix.length));
    const sourceFile = await realpath(path.resolve(repositoryDirectory, relativePath));
    if (sourceFile !== repositoryRoot && !sourceFile.startsWith(`${repositoryRoot}${path.sep}`)) {
      throw new Error(`Root README asset points outside the repository: ${relativePath}`);
    }
    const sourceStats = await stat(sourceFile);
    if (!sourceStats.isFile()) throw new Error(`Root README asset is not a regular file: ${relativePath}`);
    const destinationFile = path.join(destination, "_root", relativePath);
    await mkdir(path.dirname(destinationFile), { recursive: true });
    await copyFile(sourceFile, destinationFile);
  }));
}

async function syncSource(
  source: Awaited<ReturnType<typeof loadRepositorySources>>[number],
): Promise<CachedProject | null> {
  process.stdout.write(`Syncing ${source.name}...\n`);
  const parsed = parseRepositoryUrl(source.repository);
  const repository = { ...parsed, slug: source.slug };
  const synced = await syncRepository(repository);
  let project: CachedProject;
  try {
    project = await buildDocumentation(
      repository,
      synced.directory,
      synced.revision,
      source.name,
      {
        documentationType: source.documentationType,
        category: source.category,
        useReadmeFrontPage: source.useReadmeFrontPage,
      },
    );
  } catch (error) {
    if (error instanceof MissingDocumentationError) {
      process.stderr.write(`Skipped ${source.name}: ${error.message}\n`);
      return null;
    }
    throw error;
  }
  const projectAssetsDirectory = path.join(assetsDirectory, source.slug);
  await copyDocumentationAssets(path.join(synced.directory, "docs"), projectAssetsDirectory);
  await copyRootReadmeAssets(synced.directory, projectAssetsDirectory, project);
  process.stdout.write(`Synced ${source.name}: ${Object.keys(project.pages).length} pages.\n`);
  return project;
}

async function main(): Promise<void> {
  const sources = await loadRepositorySources();
  await rm(assetsDirectory, { recursive: true, force: true });
  await mkdir(assetsDirectory, { recursive: true });

  const concurrency = syncConcurrency(sources.length);
  const synchronizedProjects = new Array<CachedProject | null>(sources.length);
  let nextSource = 0;

  process.stdout.write(`Syncing ${sources.length} repositories with ${concurrency} worker${concurrency === 1 ? "" : "s"}.\n`);
  async function worker(): Promise<void> {
    while (nextSource < sources.length) {
      const index = nextSource;
      nextSource += 1;
      synchronizedProjects[index] = await syncSource(sources[index]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const projects = synchronizedProjects.filter((project): project is CachedProject => project !== null);

  const siteDocumentationFile = path.join(process.cwd(), siteDocumentationPath);
  let siteDocumentationHistory;
  try {
    siteDocumentationHistory = await readRepositoryFileHistory(process.cwd(), siteDocumentationPath);
  } catch {
    const fileStats = await stat(siteDocumentationFile);
    siteDocumentationHistory = {
      createdAt: (fileStats.birthtimeMs > 0 ? fileStats.birthtime : fileStats.mtime).toISOString(),
      updatedAt: fileStats.mtime.toISOString(),
      authors: [await readRepositoryDefaultAuthor(process.cwd())],
    };
  }
  const siteDocumentation = {
    ...renderMarkdown(await readFile(siteDocumentationFile, "utf8")),
    history: siteDocumentationHistory,
    sourceRevision: await readRepositoryRevision(process.cwd()),
  };
  const output = { generatedAt: new Date().toISOString(), siteDocumentation, projects };
  await mkdir(generatedDirectory, { recursive: true });
  const destination = path.join(generatedDirectory, "docs.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(output), "utf8");
  await rename(temporary, destination);
  process.stdout.write(
    `Generated ${projects.length} static project${projects.length === 1 ? "" : "s"}; skipped ${sources.length - projects.length}.\n`,
  );
}

await main();
