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

export function projectOverviewHref(
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
