import HomePage, { type DirectorySelection } from "@/app/page";
import { DocumentationPage } from "@/components/documentation-page";
import { NotFound } from "@/components/not-found";
import generatedData from "@/generated/docs.json";
import config from "@/repodocs.config";
import { categorySegment, projectPageHref } from "@/lib/routes";
import type { GeneratedDocumentation } from "@/lib/types";

const documentation = generatedData as unknown as GeneratedDocumentation;

function knownTypes(): string[] {
  return [...new Set(["minecraft", ...documentation.projects.flatMap((project) => project.documentationType ? [project.documentationType] : [])])];
}

function knownCategories(type: string): string[] {
  const configured = documentation.projects.flatMap((project) => project.documentationType === type && project.category ? [project.category] : []);
  return [...new Set(type === "minecraft" ? ["mod", "modpack", ...configured] : configured)];
}

function categoryFromSegment(segment: string): string {
  if (segment === "mods") return "mod";
  if (segment === "modpacks") return "modpack";
  return segment;
}

function directorySelection(parts: string[]): DirectorySelection | null {
  if (parts.length === 0) return { type: null, category: null };
  if (parts.length === 1 && parts[0] === "docs") return { type: null, category: null, infoPage: "docs" };
  if (parts.length === 1 && parts[0] === "projects") return { type: null, category: null, general: true };
  if (parts.length === 1 && (parts[0] === "mods" || parts[0] === "modpacks")) {
    return { type: "minecraft", category: categoryFromSegment(parts[0]) };
  }
  if (!knownTypes().includes(parts[0]) || parts.length > 2) return null;
  if (parts.length === 1) return { type: parts[0], category: null };
  const category = categoryFromSegment(parts[1]);
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
    if (documentation.siteDocumentation.pages[documentationPath]) {
      return {
        type: "home" as const,
        selection: { type: null, category: null, infoPage: "docs" as const, documentationPath },
      };
    }
  }
  const selection = directorySelection(parts);
  if (selection) return { type: "home" as const, selection };

  const classifiedCategory = parts[0] === "mods" || parts[0] === "modpacks"
    ? categoryFromSegment(parts[0])
    : null;
  const isGenericDocs = parts[0] === "docs";
  if ((!classifiedCategory && !isGenericDocs) || !parts[1]) return { type: "not-found" as const };

  const project = documentation.projects.find((item) =>
    item.slug === parts[1]
    && (classifiedCategory
      ? item.documentationType === "minecraft" && item.category === classifiedCategory
      : item.documentationType !== "minecraft" || !item.category),
  );
  if (!project) return { type: "not-found" as const };
  const currentPath = parts.slice(2).join("/") || project.defaultPage;
  const page = project.pages[currentPath];
  if (!page) return { type: "not-found" as const };
  return { type: "documentation" as const, project, page, currentPath };
}

export function pageMetadata(pathname: string): { title: string; description: string; favicon: string | null } {
  const resolved = resolvePage(pathname);
  if (resolved.type === "home") {
    if (resolved.selection.infoPage === "docs") {
      const documentationPath = resolved.selection.documentationPath ?? documentation.siteDocumentation.defaultPage;
      const page = documentation.siteDocumentation.pages[documentationPath];
      return {
        title: `${page.title} · ${config.site.name}`,
        description: page.description,
        favicon: null,
      };
    }
    const directoryName = resolved.selection.general
      ? "Projects"
      : resolved.selection.category ?? resolved.selection.type;
    const title = directoryName
      ? `${directoryName.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} · ${config.site.name}`
      : config.site.name;
    return { title, description: config.site.description, favicon: null };
  }
  if (resolved.type === "documentation") {
    return {
      title: `${resolved.page.title} · ${resolved.project.name} · ${config.site.name}`,
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
    return <DocumentationPage projects={documentation.projects} project={resolved.project} page={resolved.page} currentPath={resolved.currentPath} site={config.site} />;
  }
  return <NotFound siteName={config.site.name} />;
}

export function staticPaths(): string[] {
  const siteDocumentationPaths = Object.keys(documentation.siteDocumentation.pages).map((pagePath) =>
    `/docs${pagePath ? `/${pagePath}` : ""}/`,
  );
  const paths = [
    "/",
    ...siteDocumentationPaths,
    "/projects/",
    "/mods/",
    "/modpacks/",
    ...knownTypes().filter((type) => type !== "minecraft").flatMap((type) => [
      `/${type}/`,
      ...knownCategories(type).map((category) => `/${type}/${categorySegment(category)}/`),
    ]),
    ...documentation.projects.flatMap((project) =>
      Object.keys(project.pages).map((pagePath) => projectPageHref(project, pagePath)),
    ),
  ];
  return [...new Set(paths)];
}
