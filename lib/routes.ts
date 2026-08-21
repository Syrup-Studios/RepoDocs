import { directoryCategory } from "@/lib/classification";

type RoutableProject = {
  slug: string;
  defaultLocale: string;
  defaultVersion: string;
};

export function categorySegment(category: string | null): string | null {
  if (category === "mod") return "mods";
  if (category === "modpack") return "modpacks";
  return category;
}

export function classifiedCategoryFromSegment(type: string, segment: string): string {
  if (type === "minecraft" && segment === "mods") return "mod";
  if (type === "minecraft" && segment === "modpacks") return "modpack";
  const category = directoryCategory(type, segment);
  return category?.name ?? segment;
}

export function projectRootHref(
  project: RoutableProject,
  locale = project.defaultLocale,
  version = project.defaultVersion,
): string {
  return `/${locale}/project/${project.slug}/${version}/`;
}

export function projectDocumentationBasePath(
  project: RoutableProject,
  version = project.defaultVersion,
  locale = project.defaultLocale,
): string {
  return `/${locale}/project/${project.slug}/${version}/docs`;
}

export function projectPageHref(
  project: RoutableProject,
  pagePath: string,
  version = project.defaultVersion,
  locale = project.defaultLocale,
): string {
  const base = projectDocumentationBasePath(project, version, locale);
  return `${base}${pagePath ? `/${pagePath}` : ""}/`;
}
