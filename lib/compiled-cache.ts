import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CachedProject } from "@/lib/types";

export const compiledCacheVersion = 1;

export type CompiledCacheManifest = {
  version: number;
  compilerFingerprint: string;
  projects: Record<string, string>;
};

export type CompiledProjectEntry = {
  key: string;
  projectHash: string;
  project: CachedProject;
  assets: Record<string, string>;
};

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, sortedValue(item)]));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortedValue(value));
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function isCompatibleCacheManifest(value: unknown, compilerFingerprint: string): value is CompiledCacheManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Partial<CompiledCacheManifest>;
  return manifest.version === compiledCacheVersion
    && manifest.compilerFingerprint === compilerFingerprint
    && Boolean(manifest.projects)
    && typeof manifest.projects === "object"
    && !Array.isArray(manifest.projects)
    && Object.values(manifest.projects).every((key) => typeof key === "string" && /^[a-f0-9]{64}$/.test(key));
}

export function isValidProjectEntry(value: unknown, slug: string, key: string): value is CompiledProjectEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<CompiledProjectEntry>;
  if (entry.key !== key || !entry.project || entry.project.slug !== slug) return false;
  if (!entry.project.versions?.latest?.sourceRevision) return false;
  if (typeof entry.projectHash !== "string" || entry.projectHash !== hashValue(entry.project)) return false;
  return Boolean(entry.assets)
    && typeof entry.assets === "object"
    && !Array.isArray(entry.assets)
    && Object.values(entry.assets).every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash));
}

async function assetHashes(directory: string, prefix = ""): Promise<Record<string, string>> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const hashes: Record<string, string> = {};
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const filePath = path.join(directory, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Cached asset is a symbolic link: ${relativePath}`);
    if (entry.isDirectory()) Object.assign(hashes, await assetHashes(filePath, relativePath));
    else if (entry.isFile()) hashes[relativePath] = createHash("sha256").update(await readFile(filePath)).digest("hex");
    else throw new Error(`Cached asset is not a regular file: ${relativePath}`);
  }
  return hashes;
}

function validSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug);
}

export async function readProjectCacheEntry(
  cacheDirectory: string,
  slug: string,
  key: string,
): Promise<CompiledProjectEntry | null> {
  if (!validSlug(slug)) return null;
  try {
    const entryFile = path.join(cacheDirectory, "projects", `${slug}.json`);
    const entryStats = await lstat(entryFile);
    if (!entryStats.isFile() || entryStats.isSymbolicLink()) return null;
    const assetsRoot = path.join(cacheDirectory, "assets", slug);
    const assetStats = await lstat(assetsRoot);
    if (!assetStats.isDirectory() || assetStats.isSymbolicLink()) return null;
    const entry = JSON.parse(await readFile(entryFile, "utf8")) as unknown;
    if (!isValidProjectEntry(entry, slug, key)) return null;
    const actualAssets = await assetHashes(assetsRoot);
    return stableStringify(actualAssets) === stableStringify(entry.assets) ? entry : null;
  } catch {
    return null;
  }
}

export async function writeProjectCacheEntry(
  cacheDirectory: string,
  project: CachedProject,
  key: string,
  repositoryAssetsDirectory: string,
  faviconFile: string,
): Promise<void> {
  if (!validSlug(project.slug)) throw new Error(`Invalid project cache slug: ${project.slug}`);
  const assetsDirectory = path.join(cacheDirectory, "assets", project.slug);
  await rm(assetsDirectory, { recursive: true, force: true });
  await mkdir(path.join(assetsDirectory, "repository-assets"), { recursive: true });
  await mkdir(path.join(assetsDirectory, "repository-favicons"), { recursive: true });
  try {
    const stats = await lstat(repositoryAssetsDirectory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Invalid repository assets directory: ${repositoryAssetsDirectory}`);
    await cp(repositoryAssetsDirectory, path.join(assetsDirectory, "repository-assets"), { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    const stats = await lstat(faviconFile);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Invalid repository favicon: ${faviconFile}`);
    await cp(faviconFile, path.join(assetsDirectory, "repository-favicons", `${project.slug}.png`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const entry: CompiledProjectEntry = {
    key,
    projectHash: hashValue(project),
    project,
    assets: await assetHashes(assetsDirectory),
  };
  const projectsDirectory = path.join(cacheDirectory, "projects");
  await mkdir(projectsDirectory, { recursive: true });
  const destination = path.join(projectsDirectory, `${project.slug}.json`);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(entry), "utf8");
  await rename(temporary, destination);
}

export async function restoreProjectCacheAssets(
  cacheDirectory: string,
  slug: string,
  repositoryAssetsDirectory: string,
  faviconDirectory: string,
): Promise<void> {
  if (!validSlug(slug)) throw new Error(`Invalid project cache slug: ${slug}`);
  const assetsDirectory = path.join(cacheDirectory, "assets", slug);
  const repositoryAssets = path.join(assetsDirectory, "repository-assets");
  try {
    const stats = await lstat(repositoryAssets);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Invalid cached assets directory: ${repositoryAssets}`);
    await cp(repositoryAssets, repositoryAssetsDirectory, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const favicon = path.join(assetsDirectory, "repository-favicons", `${slug}.png`);
  try {
    const stats = await lstat(favicon);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Invalid cached favicon: ${favicon}`);
    await mkdir(faviconDirectory, { recursive: true });
    await cp(favicon, path.join(faviconDirectory, `${slug}.png`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
