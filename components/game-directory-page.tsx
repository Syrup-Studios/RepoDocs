import { BookOpen, ChevronRight, Github, Search } from "lucide-react";
import { DocsNav } from "@/components/docs-nav";
import { projectBasePath, projectPageHref } from "@/lib/routes";
import type { SiteConfig } from "@/lib/config";
import type { CachedProject } from "@/lib/types";

type GameCategory = {
  name: string;
  label: string;
  href: string;
};

function projectNavigation(project: CachedProject) {
  const root = project.navigation.length === 1 ? project.navigation[0] : null;
  const items = root?.type === "section" && root.title.toLowerCase() === project.name.toLowerCase()
    ? root.children
    : project.navigation;
  return items.filter((item) => item.type !== "page" || item.path !== project.defaultPage);
}

export function GameDirectoryPage({
  game,
  projects,
  categories,
  selectedCategory,
  site,
}: {
  game: string;
  projects: CachedProject[];
  categories: GameCategory[];
  selectedCategory: string | null;
  site: SiteConfig;
}) {
  const repositoryName = new URL(site.repository).pathname.replace(/^\//, "");
  const effectiveCategory = selectedCategory
    ?? categories.find((category) => projects.some((project) => project.category === category.name))?.name
    ?? categories[0]?.name
    ?? null;
  const visibleProjects = projects.filter((project) => project.category === effectiveCategory);
  const activeCategory = categories.find((category) => category.name === effectiveCategory);

  return (
    <div className="game-directory-shell">
      <header className="docs-header game-header">
        <a className="material-brand" href="/"><span className="material-logo"><BookOpen size={19} /></span><span>{site.name}</span></a>
        <span className="game-header-title">{game}</span>
        <div className="docs-actions">
          <div className="docs-search" aria-label="Search is not available yet"><Search size={17} /><span>Search</span></div>
          <a className="header-repository" href={site.repository} target="_blank" rel="noreferrer"><Github size={20} /><span>{repositoryName}</span></a>
        </div>
      </header>

      <nav className="docs-tabs game-tabs" aria-label={`${game} categories`}>
        {categories.map((category) => (
          <a className={effectiveCategory === category.name ? "active" : ""} href={category.href} key={category.name}>
            {category.label}
          </a>
        ))}
      </nav>

      <aside className="docs-sidebar game-project-sidebar">
        <div className="game-sidebar-title">{activeCategory?.label ?? "Projects"}</div>
        <nav className="game-project-list" aria-label={`${activeCategory?.label ?? game} projects`}>
          {visibleProjects.map((project) => (
            <details className="project-tree" key={project.slug}>
              <summary>
                <a href={projectPageHref(project, project.defaultPage)}>{project.name}</a>
                <ChevronRight className="project-tree-chevron" size={15} aria-hidden="true" />
              </summary>
              <DocsNav items={projectNavigation(project)} basePath={projectBasePath(project)} currentPath="__category__" />
            </details>
          ))}
        </nav>
        {visibleProjects.length === 0 && <p className="game-sidebar-empty">No {activeCategory?.label.toLowerCase() ?? "projects"} are published yet.</p>}
      </aside>

      <main className="game-directory-main">
        <h1>{activeCategory?.label ?? game}</h1>
        <p>Choose a project from the sidebar.</p>
      </main>
    </div>
  );
}
