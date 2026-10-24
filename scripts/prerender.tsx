import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToString } from "react-dom/server";
import generatedData from "@/generated/docs.json";
import { directoryDefinition } from "@/lib/classification";
import { cacheDirectory } from "@/lib/paths";
import {
  cacheKey,
  selectPrerenderTemplate,
  readCachedRouteBody,
  readPrerenderManifest,
  writeCachedRouteBody,
  writePrerenderManifest,
} from "@/lib/prerender-cache";
import { projectRootHref } from "@/lib/routes";
import { documentationIndex, projectSlugFromPathname } from "@/lib/project-index";
import config from "@/repodocs.config";
import type { GeneratedDocumentation } from "@/lib/types";
import { App, pageMetadata, resolvePage, staticPaths } from "@/src/app";

const outputDirectory = path.join(process.cwd(), "dist");
const documentation = generatedData as unknown as GeneratedDocumentation;
const index = documentationIndex(documentation);
const prerenderCacheDirectory = path.join(cacheDirectory(), "prerender");
const cleanCache = process.argv.includes("--clean");
if (cleanCache) await rm(prerenderCacheDirectory, { recursive: true, force: true });
const templatePath = path.join(prerenderCacheDirectory, "template.html");
const currentTemplate = await readFile(path.join(outputDirectory, "index.html"), "utf8");
let cachedTemplate: string | null = null;
try {
  cachedTemplate = await readFile(templatePath, "utf8");
} catch {
  // A Vite build starts with a fresh template in dist/index.html.
}
const template = selectPrerenderTemplate(currentTemplate, cachedTemplate);
if (template === currentTemplate) {
  await mkdir(prerenderCacheDirectory, { recursive: true });
  const temporaryTemplatePath = `${templatePath}.${process.pid}.tmp`;
  await writeFile(temporaryTemplatePath, template, "utf8");
  await rename(temporaryTemplatePath, templatePath);
}
const previousCache = await readPrerenderManifest(prerenderCacheDirectory);
const currentCacheRoutes: Record<string, { key: string; bodyHash: string }> = {};
await rm(path.join(outputDirectory, "publication.json"), { force: true });
const dataDirectory = path.join(outputDirectory, "_data");
await mkdir(path.join(dataDirectory, "projects"), { recursive: true });
await writeFile(path.join(dataDirectory, "index.json"), JSON.stringify(index), "utf8");
await Promise.all(documentation.projects.map((project) =>
  writeFile(path.join(dataDirectory, "projects", `${project.slug}.json`), JSON.stringify(project), "utf8"),
));

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function renderSourceFingerprint(): Promise<string> {
  const files = ["index.html", "package.json", "bun.lock", "repodocs.config.ts", "scripts/prerender.tsx", "vite.config.ts"];
  async function collect(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile() && /\.(?:ts|tsx|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(file);
    }
  }
  for (const directory of ["app", "components", "lib", "src"]) await collect(directory);
  const contents = await Promise.all([...new Set(files)].sort().map(async (file) => [file, await readFile(file, "utf8")]));
  return cacheKey(contents);
}

const layoutFingerprint = cacheKey({
  site: config.site,
  sourceFingerprint: await renderSourceFingerprint(),
});
const indexFingerprint = cacheKey(index);

function projectDisplayEntry(project: (typeof index.projects)[number]) {
  const version = project.versions[project.defaultVersion];
  const locale = version.locales[project.defaultLocale];
  return {
    slug: project.slug,
    name: project.name,
    repositoryUrl: project.repositoryUrl,
    repositoryHost: project.repositoryHost,
    repositoryOwner: project.repositoryOwner,
    documentationType: project.documentationType,
    category: project.category,
    defaultVersion: project.defaultVersion,
    defaultLocale: project.defaultLocale,
    version: { id: version.id, label: version.label },
    locale: { code: locale.code, label: locale.label, defaultPage: locale.defaultPage, navigation: locale.navigation },
  };
}

function routeCacheKey(pathname: string) {
  const slug = projectSlugFromPathname(pathname);
  const projectData = slug ? documentation.projects.find((project) => project.slug === slug) : undefined;
  const resolved = resolvePage(pathname, index, projectData);
  if (resolved.type === "documentation") {
    const directory = directoryDefinition(resolved.project.documentationType);
    const relatedProjects = directory
      ? index.projects.filter((project) => project.documentationType === resolved.project.documentationType && project.category === resolved.project.category)
      : [];
    return {
      projectData,
      key: cacheKey({
        kind: "documentation",
        route: [resolved.project.slug, resolved.version.id, resolved.locale.code, resolved.currentPath],
        project: projectData,
        relatedProjects: relatedProjects.map(projectDisplayEntry),
        layoutFingerprint,
      }),
    };
  }
  return {
    projectData,
    key: cacheKey({ kind: "route", pathname, indexFingerprint, layoutFingerprint }),
  };
}

async function renderBody(pathname: string, projectData?: GeneratedDocumentation["projects"][number]): Promise<string> {
  return renderToString(<App pathname={pathname} documentation={index} projectData={projectData} />);
}

const bodyPromises = new Map<string, Promise<{ body: string; cacheEntry: { key: string; bodyHash: string } }>>();
let cachedBodies = 0;
let renderedBodies = 0;

async function bodyForRoute(pathname: string): Promise<string> {
  const route = routeCacheKey(pathname);
  let resultPromise = bodyPromises.get(route.key);
  if (!resultPromise) {
    resultPromise = (async () => {
      const cached = await readCachedRouteBody(prerenderCacheDirectory, previousCache, pathname, route.key);
      if (cached !== null) {
        cachedBodies += 1;
        const cacheEntry = previousCache.routes[pathname];
        return { body: cached, cacheEntry };
      }
      renderedBodies += 1;
      const body = await renderBody(pathname, route.projectData);
      return { body, cacheEntry: await writeCachedRouteBody(prerenderCacheDirectory, route.key, body) };
    })();
    bodyPromises.set(route.key, resultPromise);
  }
  const { body, cacheEntry } = await resultPromise;
  currentCacheRoutes[pathname] = cacheEntry;
  return body;
}

async function render(pathname: string): Promise<string> {
  const slug = projectSlugFromPathname(pathname);
  const projectData = slug ? documentation.projects.find((project) => project.slug === slug) : undefined;
  const metadata = pageMetadata(pathname, index, projectData);
  const resolved = resolvePage(pathname, index, projectData);
  const redirect = resolved.type === "documentation" && resolved.redirectHref
    ? `<meta http-equiv="refresh" content="0;url=${escapeAttribute(resolved.redirectHref)}"><link rel="canonical" href="${escapeAttribute(resolved.redirectHref)}">`
    : "";
  return template
    .replace("</head>", `${redirect}</head>`)
    .replace("<!--repodocs-title-->", escapeAttribute(metadata.title))
    .replace("<!--repodocs-description-->", escapeAttribute(metadata.description))
    .replace(
      "<!--repodocs-favicon-->",
      metadata.favicon
        ? `<link rel="icon" type="image/png" href="${escapeAttribute(metadata.favicon)}" data-repodocs-favicon />`
        : "",
    )
    .replace("<!--repodocs-content-->", await bodyForRoute(pathname));
}

async function writeRoute(pathname: string): Promise<void> {
  const relative = pathname === "/" ? "" : pathname.replace(/^\/+|\/+$/g, "");
  const directory = path.join(outputDirectory, relative);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), await render(pathname), "utf8");
}

const paths = staticPaths(index);
await Promise.all(paths.map((pathname) => writeRoute(pathname)));

const notFound = await render("/404/");
await writeFile(path.join(outputDirectory, "404.html"), notFound, "utf8");
await mkdir(path.join(outputDirectory, "404"), { recursive: true });
await writeFile(path.join(outputDirectory, "404", "index.html"), notFound, "utf8");

const publication = {
  siteSourceRevision: documentation.siteDocumentation.versions.latest.sourceRevision,
  publishedAt: new Date().toISOString(),
  projects: documentation.projects.map((project) => ({
    slug: project.slug,
    repositoryUrl: project.repositoryUrl,
    sourceRevision: project.versions.latest.sourceRevision,
    documentationUrl: projectRootHref(project, project.defaultLocale, "latest"),
    ...(project.favicon && /^\/repository-favicons\/[a-z0-9][a-z0-9-]*\.png$/.test(project.favicon) ? { iconUrl: project.favicon } : {}),
  })),
};
const manifestPath = path.join(outputDirectory, "publication.json");
const temporaryManifestPath = `${manifestPath}.${process.pid}.tmp`;
await writeFile(temporaryManifestPath, `${JSON.stringify(publication, null, 2)}\n`, "utf8");
await rename(temporaryManifestPath, manifestPath);

await writePrerenderManifest(prerenderCacheDirectory, currentCacheRoutes);
process.stdout.write(`Prerendered ${paths.length} static routes; reused ${cachedBodies} cached bodies and rendered ${renderedBodies}.\n`);
