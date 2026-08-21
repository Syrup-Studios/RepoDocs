import HomePage, { type DirectorySelection } from "@/app/page";
import { DocumentationPage } from "@/components/documentation-page";
import { NotFound } from "@/components/not-found";
import generatedData from "@/generated/docs.json";
import config from "@/repodocs.config";
import {
  categoryLabel,
  directoryCategoryNames,
  directoryDefinition,
  directoryHref,
  directoryLabel,
  firstClassDirectories,
} from "@/lib/classification";
import {
  projectRootHref,
  projectPageHref,
  classifiedCategoryFromSegment,
} from "@/lib/routes";
import { defaultDocumentationContext } from "@/lib/documentation-context";
import type { GeneratedDocumentation } from "@/lib/types";

const documentation = generatedData as unknown as GeneratedDocumentation;
const siteDocumentation = defaultDocumentationContext(documentation.siteDocumentation);

function knownTypes(): string[] {
  return [...new Set([
    ...firstClassDirectories().map((directory) => directory.type),
    ...documentation.projects.flatMap((project) => project.documentationType ? [project.documentationType] : []),
  ])];
}

function knownCategories(type: string): string[] {
  const configured = documentation.projects.flatMap((project) => project.documentationType === type && project.category ? [project.category] : []);
  return directoryCategoryNames(type, configured);
}

function directorySelection(parts: string[]): DirectorySelection | null {
  if (parts.length === 0) return { type: null, category: null };
  if (parts.length === 1 && parts[0] === "docs") return { type: null, category: null, infoPage: "docs" };
  if (parts.length === 1 && parts[0] === "projects") return { type: null, category: null, general: true };
  if (parts.length === 1 && (parts[0] === "mods" || parts[0] === "modpacks")) {
    return { type: "minecraft", category: classifiedCategoryFromSegment("minecraft", parts[0]) };
  }
  if (!knownTypes().includes(parts[0]) || parts.length > 2) return null;
  const definition = directoryDefinition(parts[0]);
  if (parts.length === 1) return { type: parts[0], category: definition?.defaultCategory ?? null };
  const category = classifiedCategoryFromSegment(parts[0], parts[1]);
  if (!knownCategories(parts[0]).includes(category)) return null;
  return { type: parts[0], category };
}

function pathParts(pathname: string): string[] {
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return [];
  }
}

export function resolvePage(pathname: string) {
  const parts = pathParts(pathname);
  if (parts[0] === "docs") {
    const documentationPath = parts.slice(1).join("/");
    if (siteDocumentation.locale.pages[documentationPath]) {
      return {
        type: "home" as const,
        selection: { type: null, category: null, infoPage: "docs" as const, documentationPath },
      };
    }
  }

  if (parts[1] === "project" && parts[0] && parts[2]) {
    const localeCode = parts[0];
    const project = documentation.projects.find((item) => item.slug === parts[2]);
    if (!project) return { type: "not-found" as const };
    const version = project.versions[parts[3]];
    const locale = version?.locales[localeCode];
    if (!version || !locale) return { type: "not-found" as const };
    if (parts.length === 4) {
      const currentPath = locale.defaultPage;
      const page = locale.pages[currentPath];
      if (!page) return { type: "not-found" as const };
      return { type: "documentation" as const, project, version, locale, page, currentPath };
    }
    if (parts[4] !== "docs") return { type: "not-found" as const };
    const currentPath = parts.slice(5).join("/") || locale.defaultPage;
    const page = locale.pages[currentPath];
    if (!page) return { type: "not-found" as const };
    return { type: "documentation" as const, project, version, locale, page, currentPath };
  }

  const selection = directorySelection(parts);
  if (selection) return { type: "home" as const, selection };

  return { type: "not-found" as const };
}

export function pageMetadata(pathname: string): { title: string; description: string; favicon: string | null } {
  const resolved = resolvePage(pathname);
  if (resolved.type === "home") {
    if (resolved.selection.infoPage === "docs") {
      const { locale } = defaultDocumentationContext(documentation.siteDocumentation);
      const documentationPath = resolved.selection.documentationPath ?? locale.defaultPage;
      const page = locale.pages[documentationPath];
      return {
        title: `${page.title} · ${config.site.name}`,
        description: page.description,
        favicon: null,
      };
    }
    const directoryName = resolved.selection.general
      ? "Projects"
      : resolved.selection.category
        ? categoryLabel(resolved.selection.type, resolved.selection.category)
        : resolved.selection.type
          ? directoryLabel(resolved.selection.type)
          : null;
    const title = directoryName
      ? `${directoryName.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} · ${config.site.name}`
      : config.site.name;
    return { title, description: config.site.description, favicon: null };
  }
  if (resolved.type === "documentation") {
    const pageTitle = resolved.page.title === resolved.project.name
      ? resolved.project.name
      : `${resolved.page.title} · ${resolved.project.name}`;
    return {
      title: `${pageTitle} · ${config.site.name}`,
      description: resolved.page.description,
      favicon: resolved.project.favicon,
    };
  }
  return {
    title: `Page not found · ${config.site.name}`,
    description: "This documentation page does not exist.",
    favicon: null,
  };
}

export function App({ pathname }: { pathname: string }) {
  const resolved = resolvePage(pathname);
  if (resolved.type === "home") return <HomePage documentation={documentation} selection={resolved.selection} site={config.site} />;
  if (resolved.type === "documentation") {
    return <DocumentationPage projects={documentation.projects} project={resolved.project} version={resolved.version} locale={resolved.locale} page={resolved.page} currentPath={resolved.currentPath} site={config.site} />;
  }
  return <NotFound siteName={config.site.name} />;
}

export function staticPaths(): string[] {
  const siteDocumentationPaths = Object.keys(siteDocumentation.locale.pages).map((pagePath) =>
    `/docs${pagePath ? `/${pagePath}` : ""}/`,
  );
  const paths = [
    "/",
    ...siteDocumentationPaths,
    "/projects/",
    "/mods/",
    "/modpacks/",
    ...firstClassDirectories().filter((directory) => directory.type !== "minecraft").map((directory) => directory.href),
    ...knownTypes().filter((type) => !directoryDefinition(type)).flatMap((type) => [
      `/${type}/`,
      ...knownCategories(type).map((category) => directoryHref(type, category)),
    ]),
    ...documentation.projects.flatMap((project) =>
      Object.values(project.versions).flatMap((version) => Object.values(version.locales).flatMap((locale) => [
        projectRootHref(project, locale.code, version.id),
        ...Object.keys(locale.pages).map((pagePath) => projectPageHref(project, pagePath, version.id, locale.code)),
      ])),
    ),
  ];
  return [...new Set(paths)];
}
