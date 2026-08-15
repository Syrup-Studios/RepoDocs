type ClassifiedProject = {
  slug: string;
  documentationType: string | null;
  category: string | null;
};

export function categorySegment(category: string | null): string | null {
  if (category === "mod") return "mods";
  if (category === "modpack") return "modpacks";
  return category;
}

export function projectBasePath(project: ClassifiedProject): string {
  const category = project.documentationType === "minecraft" ? categorySegment(project.category) : null;
  return category ? `/${category}/${project.slug}` : `/docs/${project.slug}`;
}

export function projectPageHref(project: ClassifiedProject, pagePath: string): string {
  return `${projectBasePath(project)}${pagePath ? `/${pagePath}` : ""}/`;
}
