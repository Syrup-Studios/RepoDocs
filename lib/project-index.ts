import type { CachedProject, GeneratedDocumentation, GeneratedDocumentationIndex, ProjectIndexEntry } from "@/lib/types";

export function projectIndexEntry(project: CachedProject): ProjectIndexEntry {
  return {
    ...project,
    versions: Object.fromEntries(Object.entries(project.versions).map(([id, version]) => [
      id,
      {
        ...version,
        locales: Object.fromEntries(Object.entries(version.locales).map(([code, locale]) => [
          code,
          {
            ...locale,
            pages: Object.fromEntries(Object.entries(locale.pages).map(([pagePath, page]) => [
              pagePath,
              { path: page.path, title: page.title, description: page.description },
            ])),
          },
        ])),
      },
    ])),
  };
}

export function documentationIndex(documentation: GeneratedDocumentation): GeneratedDocumentationIndex {
  return {
    generatedAt: documentation.generatedAt,
    siteDocumentation: documentation.siteDocumentation,
    projects: documentation.projects.map(projectIndexEntry),
  };
}

export function projectSlugFromPathname(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "project" && parts.length === 2) return parts[1];
  if (parts[1] === "project" && parts[0] && parts[2]) return parts[2];
  return null;
}

export async function fetchProjectData(slug: string): Promise<CachedProject> {
  const response = await fetch(`/_data/projects/${encodeURIComponent(slug)}.json`);
  if (!response.ok) throw new Error(`Could not load project documentation: ${slug}`);
  return response.json() as Promise<CachedProject>;
}
