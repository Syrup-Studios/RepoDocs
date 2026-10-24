import HomePage, { type DirectorySelection } from "@/app/page";
import { DocumentationPage } from "@/components/documentation-page";
import { NotFound } from "@/components/not-found";
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
import type { CachedProject, GeneratedDocumentationIndex } from "@/lib/types";
import { DashboardPage } from "@/components/dashboard-page";
import { AddRepositoryPage } from "@/components/add-repository-page";
import { ManageRepositoryPage } from "@/components/manage-repository-page";

function knownTypes(documentation: GeneratedDocumentationIndex): string[] {
  return [...new Set([
    ...firstClassDirectories().map((directory) => directory.type),
    ...documentation.projects.flatMap((project) => project.documentationType ? [project.documentationType] : []),
  ])];
}

function knownCategories(type: string, documentation: GeneratedDocumentationIndex): string[] {
  const configured = documentation.projects.flatMap((project) => project.documentationType === type && project.category ? [project.category] : []);
  return directoryCategoryNames(type, configured);
}

function directorySelection(parts: string[], documentation: GeneratedDocumentationIndex): DirectorySelection | null {
  if (parts.length === 0) return { type: null, category: null };
  if (parts.length === 1 && parts[0] === "docs") return { type: null, category: null, infoPage: "docs" };
  if (parts.length === 1 && parts[0] === "projects") return { type: null, category: null, general: true };
  if (parts.length === 1 && (parts[0] === "mods" || parts[0] === "modpacks")) {
    return { type: "minecraft", category: classifiedCategoryFromSegment("minecraft", parts[0]) };
  }
  if (!knownTypes(documentation).includes(parts[0]) || parts.length > 2) return null;
  const definition = directoryDefinition(parts[0]);
  if (parts.length === 1) return { type: parts[0], category: definition?.defaultCategory ?? null };
  const category = classifiedCategoryFromSegment(parts[0], parts[1]);
  if (!knownCategories(parts[0], documentation).includes(category)) return null;
  return { type: parts[0], category };
}

function pathParts(pathname: string): string[] {
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return [];
  }
}

export function resolvePage(pathname: string, documentation: GeneratedDocumentationIndex, projectData?: CachedProject) {
  const siteDocumentation = defaultDocumentationContext(documentation.siteDocumentation);
  const parts = pathParts(pathname);
  if (parts[0] === "dashboard" && (parts.length === 1 || (parts.length === 2 && ["add", "manage"].includes(parts[1])))) {
    return { type: "dashboard" as const, addRepository: parts[1] === "add", manageRepository: parts[1] === "manage" };
  }
  if (parts[0] === "docs") {
    const documentationPath = parts.slice(1).join("/");
    if (siteDocumentation.locale.pages[documentationPath]) {
      return {
        type: "home" as const,
        selection: { type: null, category: null, infoPage: "docs" as const, documentationPath },
      };
    }
  }

  const defaultLocaleAlias = parts[0] === "project" && parts.length === 2;
  if (defaultLocaleAlias || (parts[1] === "project" && parts[0] && parts[2])) {
    const localeCode = defaultLocaleAlias ? "en" : parts[0];
    const projectSlug = defaultLocaleAlias ? parts[1] : parts[2];
    const projectSummary = documentation.projects.find((item) => item.slug === projectSlug);
    if (!projectSummary) return { type: "not-found" as const };
    const project = projectData?.slug === projectSlug ? projectData : null;
    if (!project) return { type: "project-loading" as const, slug: projectSlug };
    const isLatestAlias = defaultLocaleAlias || parts.length === 3;
    const version = project.versions[isLatestAlias ? "latest" : parts[3]];
    const locale = version?.locales[localeCode];
    if (!version || !locale) return { type: "not-found" as const };
    if (isLatestAlias || parts.length === 4) {
      const currentPath = locale.defaultPage;
      const page = locale.pages[currentPath];
      if (!page) return { type: "not-found" as const };
      return {
        type: "documentation" as const,
        project,
        version,
        locale,
        page,
        currentPath,
        ...(isLatestAlias ? { redirectHref: projectPageHref(project, currentPath, version.id, locale.code) } : {}),
      };
    }
    if (parts[4] !== "docs") return { type: "not-found" as const };
    const currentPath = parts.slice(5).join("/") || locale.defaultPage;
    const page = locale.pages[currentPath];
    if (!page) return { type: "not-found" as const };
    return { type: "documentation" as const, project, version, locale, page, currentPath };
  }

  const selection = directorySelection(parts, documentation);
  if (selection) return { type: "home" as const, selection };

  return { type: "not-found" as const };
}

export function pageMetadata(pathname: string, documentation: GeneratedDocumentationIndex, projectData?: CachedProject): { title: string; description: string; favicon: string | null } {
  const resolved = resolvePage(pathname, documentation, projectData);
  if (resolved.type === "project-loading") return { title: config.site.name, description: config.site.description, favicon: null };
  if (resolved.type === "dashboard") return { title: `${resolved.addRepository ? "Add Repository" : "My Repositories"} · ${config.site.name}`, description: "Manage your repositories.", favicon: null };
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

export function App({ pathname, search = "", documentation, projectData }: { pathname: string; search?: string; documentation: GeneratedDocumentationIndex; projectData?: CachedProject }) {
  const resolved = resolvePage(pathname, documentation, projectData);
  if (resolved.type === "project-loading") return null;
  if (resolved.type === "dashboard") return resolved.manageRepository
    ? <ManageRepositoryPage siteName={config.site.name} search={search} />
    : resolved.addRepository
      ? <AddRepositoryPage siteName={config.site.name} />
      : <DashboardPage siteName={config.site.name} />;
  if (resolved.type === "home") return <HomePage documentation={documentation} selection={resolved.selection} site={config.site} />;
  if (resolved.type === "documentation") {
    return <DocumentationPage projects={documentation.projects} project={resolved.project} version={resolved.version} locale={resolved.locale} page={resolved.page} currentPath={resolved.currentPath} site={config.site} />;
  }
  return <NotFound siteName={config.site.name} />;
}

export function staticPaths(documentation: GeneratedDocumentationIndex): string[] {
  const siteDocumentationPaths = Object.keys(defaultDocumentationContext(documentation.siteDocumentation).locale.pages).map((pagePath) =>
    `/docs${pagePath ? `/${pagePath}` : ""}/`,
  );
  const paths = [
    "/",
    "/dashboard/",
    "/dashboard/add/",
    "/dashboard/manage/",
    ...siteDocumentationPaths,
    "/projects/",
    "/mods/",
    "/modpacks/",
    ...firstClassDirectories().filter((directory) => directory.type !== "minecraft").map((directory) => directory.href),
    ...knownTypes(documentation).filter((type) => !directoryDefinition(type)).flatMap((type) => [
      `/${type}/`,
      ...knownCategories(type, documentation).map((category) => directoryHref(type, category)),
    ]),
    ...documentation.projects.flatMap((project) =>
      [
        ...Object.values(project.versions).flatMap((version) => Object.values(version.locales).flatMap((locale) => [
          projectRootHref(project, locale.code, version.id),
          projectPageHref(project, "", version.id, locale.code),
          ...Object.keys(locale.pages).map((pagePath) => projectPageHref(project, pagePath, version.id, locale.code)),
        ])),
        ...Object.keys(project.versions.latest?.locales ?? {}).flatMap((locale) => [
          `/${locale}/project/${project.slug}/`,
          ...(locale === "en" ? [`/project/${project.slug}/`] : []),
        ]),
      ],
    ),
  ];
  return [...new Set(paths)];
}
