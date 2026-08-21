import { BookOpen, Github } from "lucide-react";
import { DocumentationSearch } from "@/components/documentation-search";
import { GroupedProjectList } from "@/components/grouped-project-list";
import { SiteFooter } from "@/components/site-footer";
import type { SiteConfig } from "@/lib/config";
import type { CachedProject } from "@/lib/types";

type GameCategory = {
  name: string;
  label: string;
  href: string;
};

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
        <GroupedProjectList
          projects={visibleProjects}
          ariaLabel={`${activeCategory?.label ?? game} projects`}
        />
        {visibleProjects.length === 0 && <p className="game-sidebar-empty">No {activeCategory?.label.toLowerCase() ?? "projects"} are published yet.</p>}
      </aside>

      <main className="game-directory-main">
        <h1>{activeCategory?.label ?? game}</h1>
        <p>Choose a project from the sidebar.</p>
      </main>
      <SiteFooter name={site.name} />
    </div>
  );
}
