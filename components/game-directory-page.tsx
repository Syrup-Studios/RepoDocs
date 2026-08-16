import { BookOpen, Github } from "lucide-react";
import { DocumentationSearch } from "@/components/documentation-search";
import { ProjectTree } from "@/components/project-tree";
import { projectDocumentationBasePath, projectOverviewHref } from "@/lib/routes";
import { defaultDocumentationContext } from "@/lib/documentation-context";
import type { SiteConfig } from "@/lib/config";
import type { CachedProject } from "@/lib/types";

type GameCategory = {
  name: string;
  label: string;
  href: string;
};

function projectNavigation(project: CachedProject) {
  const { locale } = defaultDocumentationContext(project);
  const root = locale.navigation.length === 1 ? locale.navigation[0] : null;
  const items = root?.type === "section" && root.title.toLowerCase() === project.name.toLowerCase()
    ? root.children
    : locale.navigation;
  return items.filter((item) => item.type !== "page" || item.path !== locale.defaultPage);
}

export function GameDirectoryPage({
  game,
  projects,
  searchProjects,
  categories,
  selectedCategory,
  site,
}: {
  game: string;
  projects: CachedProject[];
  searchProjects: CachedProject[];
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
          <DocumentationSearch projects={searchProjects} />
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
          {visibleProjects.map((project) => {
            const navigation = projectNavigation(project);
            const href = projectOverviewHref(project);
            if (navigation.length === 0) {
              return <a className="project-tree-link" href={href} key={project.slug}>{project.name}</a>;
            }
            return (
              <ProjectTree
                name={project.name}
                href={href}
                navigation={navigation}
                basePath={projectDocumentationBasePath(project)}
                currentPath="__category__"
                key={project.slug}
              />
            );
          })}
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
