import { BookOpen, ChevronRight, Github } from "lucide-react";
import { DocumentationContent } from "@/components/documentation-content";
import { DocsNav } from "@/components/docs-nav";
import { DocumentationSearch } from "@/components/documentation-search";
import { projectBasePath, projectPageHref } from "@/lib/routes";
import type { SiteConfig } from "@/lib/config";
import type { CachedPage, CachedProject, NavItem } from "@/lib/types";

function firstPage(item: NavItem): string | null {
  if (item.type === "page") return item.path;
  for (const child of item.children) {
    const result = firstPage(child);
    if (result !== null) return result;
  }
  return null;
}

function includesPage(item: NavItem, pagePath: string): boolean {
  if (item.type === "page") return item.path === pagePath;
  return item.children.some((child) => includesPage(child, pagePath));
}

function projectNavigation(project: CachedProject): NavItem[] {
  const root = project.navigation.length === 1 ? project.navigation[0] : null;
  const items = root?.type === "section" && root.title.toLowerCase() === project.name.toLowerCase()
    ? root.children
    : project.navigation;
  return items.filter((item) => item.type !== "page" || item.path !== project.defaultPage);
}

export function DocumentationPage({
  projects,
  project,
  page,
  currentPath,
  site,
}: {
  projects: CachedProject[];
  project: CachedProject;
  page: CachedPage;
  currentPath: string;
  site: SiteConfig;
}) {
  const activeNavigation = project.navigation.find((item) => includesPage(item, currentPath));
  const repositoryName = new URL(project.repositoryUrl).pathname.replace(/^\//, "");
  const isMinecraft = project.documentationType === "minecraft";
  const categoryProjects = isMinecraft
    ? projects.filter((item) => item.documentationType === "minecraft" && item.category === project.category)
    : [];
  const categoryLabel = project.category === "modpack" ? "Modpacks" : project.category === "mod" ? "Mods" : "Projects";
  const visibleProjectNavigation = projectNavigation(project);

  return (
    <div className="docs-shell">
      <header className="docs-header">
        <a className="material-brand" href="/"><span className="material-logo"><BookOpen size={19} /></span><span>{isMinecraft ? site.name : project.name}</span></a>
        {isMinecraft && <span className="game-header-title">Minecraft</span>}
        <div className="docs-actions">
          <DocumentationSearch projects={projects} />
          <a className="header-repository" href={project.repositoryUrl} target="_blank" rel="noreferrer" title="Open repository"><Github size={20} /><span>{repositoryName}</span></a>
        </div>
      </header>

      <nav className="docs-tabs" aria-label="Documentation sections">
        {isMinecraft ? (
          <>
            <a className={project.category === "modpack" ? "active" : ""} href="/modpacks/">Modpacks</a>
            <a className={project.category === "mod" ? "active" : ""} href="/mods/">Mods</a>
          </>
        ) : project.navigation.map((item, index) => {
          const target = firstPage(item);
          if (target === null) return null;
          return (
            <a className={includesPage(item, currentPath) ? "active" : ""} href={projectPageHref(project, target)} key={`${item.title}-${index}`}>
              {item.title}
            </a>
          );
        })}
      </nav>

      <aside className="docs-sidebar">
        {isMinecraft ? (
          <div className="classified-docs-navigation">
            <div className="game-sidebar-title">{categoryLabel}</div>
            {categoryProjects.map((listedProject) => {
              const isCurrent = listedProject.slug === project.slug;
              const navigation = isCurrent ? visibleProjectNavigation : projectNavigation(listedProject);
              const href = projectPageHref(listedProject, listedProject.defaultPage);
              if (navigation.length === 0) {
                return <a className={isCurrent ? "project-tree-link active" : "project-tree-link"} href={href} key={listedProject.slug}>{listedProject.name}</a>;
              }
              return (
                <details className={isCurrent ? "project-tree active" : "project-tree"} key={listedProject.slug} open={isCurrent || undefined}>
                  <summary>
                    <a href={href}>{listedProject.name}</a>
                    <ChevronRight className="project-tree-chevron" size={15} aria-hidden="true" />
                  </summary>
                  <DocsNav
                    items={navigation}
                    basePath={projectBasePath(listedProject)}
                    currentPath={isCurrent ? currentPath : "__closed__"}
                  />
                </details>
              );
            })}
          </div>
        ) : (
          <DocsNav items={activeNavigation ? [activeNavigation] : project.navigation} basePath={projectBasePath(project)} currentPath={currentPath} />
        )}
      </aside>

      <DocumentationContent
        page={page}
        referenceDate={project.builtAt}
        sourcePath={page.sourcePath}
        sourceRevision={project.sourceRevision}
      />
    </div>
  );
}
