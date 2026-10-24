import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import {
  buildDocumentation,
  localeLabel,
  MissingDocumentationError,
  readProjectConfiguration,
  versionLabel,
  type ProjectConfiguration,
} from "@/lib/docs";
import {
  checkoutRepositoryBranch,
  parseRepositoryUrl,
  readRepositoryDefaultAuthor,
  readRepositoryRevision,
  syncRepository,
} from "@/lib/repository";
import { cacheDirectory } from "@/lib/paths";
import {
  compiledCacheVersion,
  hashValue,
  isCompatibleCacheManifest,
  readProjectCacheEntry,
  restoreProjectCacheAssets,
  writeProjectCacheEntry,
  type CompiledCacheManifest,
} from "@/lib/compiled-cache";
import { loadRepositorySources } from "@/lib/repository-configs";
import { detectRepositoryLicenses } from "@/lib/license-detection";
import { projectDocumentationBasePath } from "@/lib/routes";
import type {
  CachedDocumentationLocale,
  CachedDocumentationVersion,
  CachedPage,
  CachedProject,
  NavItem,
} from "@/lib/types";
import config from "@/repodocs.config";

const generatedDirectory = path.join(process.cwd(), "generated");
const assetsDirectory = path.join(process.cwd(), "public", "repository-assets");
const faviconsDirectory = path.join(process.cwd(), "public", "repository-favicons");
const compiledCacheDirectory = path.join(cacheDirectory(), "compiled");
const defaultSyncConcurrency = 4;
const maximumSyncConcurrency = 16;
const compilerInputFiles = [
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "repodocs.config.ts",
  "scripts/sync-docs.ts",
];

type SyncMode = "full" | "incremental" | "clean";
type SyncResult = { project: CachedProject; cacheKey: string; reused: boolean };

function syncMode(): SyncMode {
  const mode = process.argv[2];
  if (mode === undefined) return "full";
  if (mode === "--incremental") return "incremental";
  if (mode === "--clean") return "clean";
  throw new Error(`Unknown sync option: ${mode}`);
}

async function compilerFingerprint(): Promise<string> {
  const libraryFiles: string[] = [];
  async function collectLibraryFiles(directory: string): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collectLibraryFiles(file);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) libraryFiles.push(file);
    }
  }
  await collectLibraryFiles(path.join(process.cwd(), "lib"));
  const files = [...compilerInputFiles.map((file) => path.join(process.cwd(), file)), ...libraryFiles];
  const inputs = await Promise.all(files.map(async (file) => [path.relative(process.cwd(), file), await readFile(file, "utf8")]));
  return hashValue({ version: compiledCacheVersion, inputs });
}

async function readCacheManifest(fingerprint: string): Promise<CompiledCacheManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(path.join(compiledCacheDirectory, "manifest.json"), "utf8")) as unknown;
    return isCompatibleCacheManifest(parsed, fingerprint) ? parsed : null;
  } catch {
    return null;
  }
}

async function persistProjectCache(project: CachedProject, key: string): Promise<void> {
  await writeProjectCacheEntry(
    compiledCacheDirectory,
    project,
    key,
    path.join(assetsDirectory, project.slug),
    path.join(faviconsDirectory, `${project.slug}.png`),
  );
}

async function writeCacheManifest(fingerprint: string, projects: Record<string, string>): Promise<void> {
  const directory = compiledCacheDirectory;
  await mkdir(path.join(directory, "projects"), { recursive: true });
  await mkdir(path.join(directory, "assets"), { recursive: true });
  const destination = path.join(directory, "manifest.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: compiledCacheVersion, compilerFingerprint: fingerprint, projects }), "utf8");
  await rename(temporary, destination);
}

async function cleanStaleCacheEntries(projects: CachedProject[]): Promise<void> {
  const active = new Set(projects.map((project) => project.slug));
  for (const directory of [path.join(compiledCacheDirectory, "projects"), path.join(compiledCacheDirectory, "assets")]) {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    await Promise.all(entries.map((entry) => {
      const slug = directory.endsWith("projects") ? entry.name.replace(/\.json$/, "") : entry.name;
      if (!entry.isDirectory() && !entry.isFile() || !active.has(slug)) {
        return rm(path.join(directory, entry.name), { recursive: true, force: true });
      }
      return Promise.resolve();
    }));
  }
}

async function readPreviousOutput(): Promise<{ value: Record<string, unknown>; generatedAt: string } | null> {
  try {
    const value = JSON.parse(await readFile(path.join(generatedDirectory, "docs.json"), "utf8")) as Record<string, unknown>;
    return typeof value.generatedAt === "string" ? { value, generatedAt: value.generatedAt } : null;
  } catch {
    return null;
  }
}

function meaningfulOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(meaningfulOutput);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "generatedAt" && key !== "builtAt")
    .map(([key, item]) => [key, meaningfulOutput(item)]));
}

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
    } else if (entry.isFile() && !/\.mdx?$/i.test(entry.name)) {
      await copyFile(sourcePath, destinationPath);
    }
  }));
}

async function copyRootReadmeAssets(
  repositoryDirectory: string,
  destination: string,
  documentation: CachedDocumentationLocale,
  publicPrefix: string,
): Promise<void> {
  const landingPage = documentation.pages[documentation.defaultPage];
  if (landingPage?.sourcePath !== "README.md") return;

  const rootAssetsPrefix = `${publicPrefix}/_root/`;
  const imageSources = [...landingPage.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)]
    .map((match) => match[1])
    .filter((source) => source.startsWith(rootAssetsPrefix));
  const repositoryRoot = await realpath(repositoryDirectory);
  await Promise.all([...new Set(imageSources)].map(async (source) => {
    const relativePath = decodeURIComponent(new URL(source, "https://repodocs.invalid").pathname.slice(rootAssetsPrefix.length));
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

function localizedNavigation(items: NavItem[], pages: Record<string, CachedPage>): NavItem[] {
  return items.map((item) => item.type === "page"
    ? { ...item, title: pages[item.path]?.title ?? item.title }
    : { ...item, children: localizedNavigation(item.children, pages) });
}

function localizedFallbackPages(
  pages: Record<string, CachedPage>,
  sourceRoute: string,
  destinationRoute: string,
): Record<string, CachedPage> {
  return Object.fromEntries(Object.entries(pages).map(([pagePath, page]) => [
    pagePath,
    { ...page, html: page.html.replaceAll(`${sourceRoute}/`, `${destinationRoute}/`) },
  ]));
}

async function translationDirectories(
  repositoryDirectory: string,
  format: ProjectConfiguration["documentationFormat"],
): Promise<Array<{ code: string; relativePath: string }>> {
  const directoryName = format === "moddedmc-v1"
    ? "translated"
    : format === "moddedmc-legacy"
      ? ".translated"
      : "translations";
  const root = path.join(repositoryDirectory, "docs", directoryName);
  let entries: Dirent<string>[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const locales = new Set<string>();
  return entries.flatMap((entry) => {
    if (!entry.isDirectory() || entry.isSymbolicLink()) return [];
    const code = entry.name.toLowerCase().replaceAll("_", "-");
    if (!/^[a-z]{2}(?:-[a-z0-9]{2,8})?$/.test(code)) {
      throw new Error(`Invalid documentation locale directory: docs/${directoryName}/${entry.name}`);
    }
    if (locales.has(code)) throw new Error(`Duplicate documentation locale: ${code}`);
    locales.add(code);
    return [{
      code,
      relativePath: path.posix.join(
        "docs",
        directoryName,
        entry.name,
        ...(format === "moddedmc-v1" ? ["docs"] : []),
      ),
    }];
  });
}

function projectDefaults(
  source: Awaited<ReturnType<typeof loadRepositorySources>>[number],
): ProjectConfiguration {
  return {
    documentationFormat: "repodocs",
    id: source.slug,
    name: source.name,
    summary: source.summary,
    documentationType: source.documentationType,
    category: source.category,
    modId: source.modId,
    owners: source.owners,
    gameVersions: source.gameVersions,
    loaders: source.loaders,
    tags: source.tags,
    licenses: source.licenses,
    platforms: source.platforms,
    useReadmeFrontPage: source.useReadmeFrontPage,
    footerLinks: source.footerLinks,
    versions: source.versions,
    defaultLocale: source.defaultLocale,
  };
}

async function compileVersion(
  repository: ReturnType<typeof parseRepositoryUrl> & { slug: string },
  repositoryDirectory: string,
  revision: string,
  branch: string,
  versionId: string,
  displayName: string,
  configuration: ProjectConfiguration,
): Promise<{ project: CachedProject; version: CachedDocumentationVersion }> {
  const routeProject = {
    slug: repository.slug,
    documentationType: configuration.documentationType,
    category: configuration.category,
    defaultVersion: versionId,
    defaultLocale: configuration.defaultLocale,
  };
  const assetPublicPath = `/repository-assets/${repository.slug}/${versionId}`;
  const assetDestination = path.join(assetsDirectory, repository.slug, versionId);
  const baseProject = await buildDocumentation(
    repository,
    repositoryDirectory,
    revision,
    displayName,
    configuration,
    projectDocumentationBasePath(routeProject, versionId, configuration.defaultLocale),
    undefined,
    {
      assetBasePath: assetPublicPath,
      configuration,
      locale: configuration.defaultLocale,
      versionBranch: branch,
      versionId,
    },
  );

  const baseLocale = baseProject.versions[versionId].locales[configuration.defaultLocale];
  await copyDocumentationAssets(path.join(repositoryDirectory, "docs"), assetDestination);
  await copyRootReadmeAssets(repositoryDirectory, assetDestination, baseLocale, assetPublicPath);

  const locales: Record<string, CachedDocumentationLocale> = {
    [configuration.defaultLocale]: baseLocale,
  };
  for (const translation of await translationDirectories(repositoryDirectory, configuration.documentationFormat)) {
    if (translation.code === configuration.defaultLocale) {
      throw new Error(`The default locale "${translation.code}" cannot also be a translation directory.`);
    }
    let translatedProject: CachedProject;
    try {
      translatedProject = await buildDocumentation(
        repository,
        repositoryDirectory,
        revision,
        displayName,
        configuration,
        projectDocumentationBasePath(routeProject, versionId, translation.code),
        undefined,
        {
          assetBasePath: assetPublicPath,
          configuration,
          docsRelativeDirectory: translation.relativePath,
          includeRootReadme: false,
          locale: translation.code,
          versionBranch: branch,
          versionId,
        },
      );
    } catch (error) {
      if (error instanceof MissingDocumentationError) continue;
      throw error;
    }
    const translated = translatedProject.versions[versionId].locales[translation.code];
    const pages = {
      ...localizedFallbackPages(
        baseLocale.pages,
        projectDocumentationBasePath(routeProject, versionId, configuration.defaultLocale),
        projectDocumentationBasePath(routeProject, versionId, translation.code),
      ),
      ...translated.pages,
    };
    locales[translation.code] = {
      code: translation.code,
      label: localeLabel(translation.code),
      defaultPage: baseLocale.defaultPage,
      navigation: localizedNavigation(baseLocale.navigation, pages),
      pages,
    };
  }

  return {
    project: baseProject,
    version: {
      id: versionId,
      label: versionLabel(versionId),
      branch,
      sourceRevision: revision,
      builtAt: baseProject.versions[versionId].builtAt,
      locales,
    },
  };
}

async function copyModFavicon(
  repositoryDirectory: string,
  project: CachedProject,
): Promise<string | null> {
  if (project.documentationType !== "minecraft" || project.category !== "mod") return null;

  const resourcesPath = path.join(repositoryDirectory, "src", "main", "resources");
  let resourcesRoot: string;
  try {
    resourcesRoot = await realpath(resourcesPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  const repositoryRoot = await realpath(repositoryDirectory);
  if (resourcesRoot !== repositoryRoot && !resourcesRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
    return null;
  }

  const candidates: string[] = [];
  const fabricMetadata = path.join(resourcesRoot, "fabric.mod.json");
  try {
    const metadataStats = await lstat(fabricMetadata);
    if (metadataStats.isFile() && !metadataStats.isSymbolicLink()) {
      const metadata = JSON.parse(await readFile(fabricMetadata, "utf8")) as { icon?: unknown };
      if (typeof metadata.icon === "string") candidates.push(metadata.icon);
      else if (metadata.icon && typeof metadata.icon === "object" && !Array.isArray(metadata.icon)) {
        candidates.push(...Object.values(metadata.icon).filter((value): value is string => typeof value === "string"));
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }

  for (const metadataName of ["mods.toml", "neoforge.mods.toml"]) {
    const metadataPath = path.join(resourcesRoot, "META-INF", metadataName);
    try {
      const metadataStats = await lstat(metadataPath);
      if (!metadataStats.isFile() || metadataStats.isSymbolicLink()) continue;
      const metadata = await readFile(metadataPath, "utf8");
      for (const match of metadata.matchAll(/^\s*logoFile\s*=\s*["']([^"']+)["']/gm)) {
        candidates.push(match[1]);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  try {
    const entries = await readdir(path.join(resourcesRoot, "assets"), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) candidates.push(path.join("assets", entry.name, "icon.png"));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  for (const candidate of [...new Set(candidates)]) {
    const iconPath = path.resolve(resourcesRoot, candidate);
    if (iconPath !== resourcesRoot && !iconPath.startsWith(`${resourcesRoot}${path.sep}`)) continue;
    let iconStats: Awaited<ReturnType<typeof lstat>>;
    try {
      iconStats = await lstat(iconPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!iconStats.isFile() || iconStats.isSymbolicLink()) continue;
    const resolvedIcon = await realpath(iconPath);
    if (resolvedIcon !== resourcesRoot && !resolvedIcon.startsWith(`${resourcesRoot}${path.sep}`)) continue;

    await mkdir(faviconsDirectory, { recursive: true });
    await copyFile(resolvedIcon, path.join(faviconsDirectory, `${project.slug}.png`));
    return `/repository-favicons/${project.slug}.png`;
  }
  return null;
}

async function syncSource(
  source: Awaited<ReturnType<typeof loadRepositorySources>>[number],
  options: { incremental: boolean; manifest: CompiledCacheManifest; compilerFingerprint: string },
): Promise<SyncResult | null> {
  process.stdout.write(`Syncing ${source.name}...\n`);
  const parsed = parseRepositoryUrl(source.repository);
  const repository = { ...parsed, slug: source.slug };
  const synced = await syncRepository(repository);
  let project: CachedProject;
  let cacheKey: string;
  try {
    const configured = await readProjectConfiguration(
      path.join(synced.directory, "docs"),
      projectDefaults(source),
    );
    const detectedLicenses = await detectRepositoryLicenses({
      branch: synced.defaultBranch,
      repositoryDirectory: synced.directory,
      repositoryUrl: parsed.normalizedUrl.replace(/\.git$/, ""),
    });
    const configuration: ProjectConfiguration = {
      ...configured,
      licenses: { ...detectedLicenses, ...configured.licenses },
    };
    const versionSpecs: Array<{ id: string; branch: string; revision: string }> = [
      { id: "latest", branch: synced.defaultBranch, revision: synced.revision },
      ...Object.entries(configuration.versions).map(([id, branch]) => ({ id, branch, revision: "" })),
    ];
    for (const spec of versionSpecs.slice(1)) {
      spec.revision = await checkoutRepositoryBranch(synced.directory, spec.branch);
    }
    await checkoutRepositoryBranch(synced.directory, synced.defaultBranch);
    const defaultRevision = await readRepositoryRevision(synced.directory);
    if (defaultRevision !== synced.revision) {
      throw new Error(`Default branch changed during sync: expected ${synced.revision}, found ${defaultRevision}`);
    }
    cacheKey = hashValue({
      repositoryIdentity: `${parsed.host}/${parsed.owner}/${parsed.repository}`.toLowerCase(),
      repositoryUrl: parsed.normalizedUrl,
      slug: source.slug,
      registration: source,
      versions: versionSpecs,
      effectiveConfiguration: configuration,
      compilerFingerprint: options.compilerFingerprint,
    });
    if (options.incremental && options.manifest.projects[source.slug] === cacheKey) {
      const cached = await readProjectCacheEntry(compiledCacheDirectory, source.slug, cacheKey);
      if (cached) {
        await restoreProjectCacheAssets(
          compiledCacheDirectory,
          source.slug,
          path.join(assetsDirectory, source.slug),
          faviconsDirectory,
        );
        process.stdout.write(`Reused ${source.name} from compiled cache.\n`);
        return { project: cached.project, cacheKey, reused: true };
      }
      process.stdout.write(`Rebuilding ${source.name}: compiled cache entry is missing or invalid.\n`);
    }
    const versions: Record<string, CachedDocumentationVersion> = {};
    let latestProject: CachedProject | null = null;
    for (const spec of versionSpecs) {
      const revision = spec.id === "latest"
        ? synced.revision
        : await checkoutRepositoryBranch(synced.directory, spec.branch);
      if (revision !== spec.revision) throw new Error(`Repository branch changed during sync: ${spec.branch}`);
      const compiled = await compileVersion(
        repository,
        synced.directory,
        revision,
        spec.branch,
        spec.id,
        configuration.name,
        configuration,
      );
      versions[spec.id] = compiled.version;
      if (spec.id === "latest") {
        latestProject = compiled.project;
        latestProject.favicon = await copyModFavicon(synced.directory, latestProject);
      }
    }
    if (!latestProject) throw new Error(`Could not compile the latest documentation for ${source.name}.`);
    project = { ...latestProject, defaultVersion: "latest", versions };
  } catch (error) {
    if (error instanceof MissingDocumentationError) {
      process.stderr.write(`Skipped ${source.name}: ${error.message}\n`);
      return null;
    }
    throw error;
  }
  const versionCount = Object.keys(project.versions).length;
  const localeCount = new Set(Object.values(project.versions).flatMap((version) => Object.keys(version.locales))).size;
  const defaultVersion = project.versions[project.defaultVersion];
  const defaultLocale = defaultVersion.locales[project.defaultLocale];
  process.stdout.write(
    `Synced ${source.name}: ${Object.keys(defaultLocale.pages).length} pages, ${versionCount} version${versionCount === 1 ? "" : "s"}, ${localeCount} locale${localeCount === 1 ? "" : "s"}.\n`,
  );
  await persistProjectCache(project, cacheKey);
  return { project, cacheKey, reused: false };
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const mode = syncMode();
  const sources = await loadRepositorySources();
  const previousOutput = await readPreviousOutput();
  const fingerprint = await compilerFingerprint();
  const priorManifest = mode === "clean" ? null : await readCacheManifest(fingerprint);
  if (!priorManifest) {
    await rm(compiledCacheDirectory, { recursive: true, force: true });
    process.stdout.write(mode === "clean"
      ? "Cleared compiled project cache.\n"
      : "Compiled cache is missing or incompatible; rebuilding all projects.\n");
  }
  const manifest = priorManifest ?? { version: compiledCacheVersion, compilerFingerprint: fingerprint, projects: {} };
  await rm(assetsDirectory, { recursive: true, force: true });
  await rm(faviconsDirectory, { recursive: true, force: true });
  await mkdir(assetsDirectory, { recursive: true });
  await mkdir(faviconsDirectory, { recursive: true });

  const concurrency = syncConcurrency(sources.length);
  const synchronizedProjects = new Array<SyncResult | null>(sources.length);
  let nextSource = 0;

  process.stdout.write(`Syncing ${sources.length} repositories in ${mode} mode with ${concurrency} worker${concurrency === 1 ? "" : "s"}.\n`);
  async function worker(): Promise<void> {
    while (nextSource < sources.length) {
      const index = nextSource;
      nextSource += 1;
      synchronizedProjects[index] = await syncSource(sources[index], {
        incremental: mode === "incremental" && priorManifest !== null,
        manifest,
        compilerFingerprint: fingerprint,
      });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const results = synchronizedProjects.filter((result): result is SyncResult => result !== null);
  const projects = results.map((result) => result.project);

  const siteRevision = await readRepositoryRevision(process.cwd());
  const siteAuthor = await readRepositoryDefaultAuthor(process.cwd());
  const parsedSiteRepository = parseRepositoryUrl(config.site.repository);
  const siteRepository = { ...parsedSiteRepository, slug: "repodocs" };
  const siteDocumentation = await buildDocumentation(
    siteRepository,
    process.cwd(),
    siteRevision,
    config.site.name,
    {
      documentationFormat: "repodocs",
      id: "repodocs",
      name: config.site.name,
      summary: config.site.description,
      documentationType: null,
      category: null,
      modId: null,
      owners: [],
      gameVersions: [],
      loaders: [],
      tags: [],
      licenses: {},
      platforms: {},
      useReadmeFrontPage: false,
      footerLinks: [],
      versions: {},
      defaultLocale: "en",
    },
    "/docs",
    async (sourcePath) => {
      const fileStats = await stat(path.join(process.cwd(), sourcePath));
      return {
        createdAt: (fileStats.birthtimeMs > 0 ? fileStats.birthtime : fileStats.mtime).toISOString(),
        updatedAt: fileStats.mtime.toISOString(),
        updatedRevision: siteRevision,
        authors: [siteAuthor],
      };
    },
  );
  await copyDocumentationAssets(
    path.join(process.cwd(), "docs"),
    path.join(assetsDirectory, siteDocumentation.slug),
  );
  await cleanStaleCacheEntries(projects);
  await writeCacheManifest(fingerprint, Object.fromEntries(results.map(({ project, cacheKey }) => [project.slug, cacheKey])));
  const outputContent = { siteDocumentation, projects };
  const unchanged = previousOutput
    && hashValue(meaningfulOutput(previousOutput.value)) === hashValue(meaningfulOutput(outputContent));
  const output = {
    generatedAt: unchanged ? previousOutput.generatedAt : new Date().toISOString(),
    ...outputContent,
  };
  await mkdir(generatedDirectory, { recursive: true });
  const destination = path.join(generatedDirectory, "docs.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(output), "utf8");
  await rename(temporary, destination);
  process.stdout.write(
    `Generated ${projects.length} static project${projects.length === 1 ? "" : "s"}; reused ${results.filter(({ reused }) => reused).length}; rebuilt ${results.filter(({ reused }) => !reused).length}; skipped ${sources.length - projects.length} in ${((performance.now() - startedAt) / 1000).toFixed(1)}s.\n`,
  );
}

await main();
