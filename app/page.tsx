import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  FileText,
  GitBranch,
  Github,
  Search,
} from "lucide-react";
import { GameDirectoryPage } from "@/components/game-directory-page";
import { categorySegment, projectPageHref } from "@/lib/routes";
import { withBasePath } from "@/lib/base-path";
import type { SiteConfig } from "@/lib/config";
import type { CachedProject, GeneratedDocumentation } from "@/lib/types";

export type DirectorySelection = {
  type: string | null;
  category: string | null;
  general?: boolean;
  infoPage?: "how-it-works";
};

function label(value: string): string {
  if (value === "minecraft") return "Minecraft";
  if (value === "mod") return "Mods";
  if (value === "modpack") return "Modpacks";
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function projectCard(project: CachedProject) {
  return (
    <article className="portal-project" key={project.slug}>
      <div className="project-icon">{project.name.slice(0, 1).toUpperCase()}</div>
      <div className="project-details">
        <h3>{project.name}</h3>
        <p>{project.pages[project.defaultPage]?.description || "Project documentation from the source repository."}</p>
        <div className="project-meta">
          <span><FileText size={14} /> {Object.keys(project.pages).length} pages</span>
          <span><GitBranch size={14} /> {project.sourceRevision.slice(0, 7)}</span>
          {project.documentationType && project.category && <span className="project-kind">{label(project.documentationType)} · {label(project.category)}</span>}
        </div>
      </div>
      <div className="project-actions">
        <a className="open-docs" href={projectPageHref(project, project.defaultPage)}>
          Open docs <ArrowRight size={16} />
        </a>
        <a href={project.repositoryUrl} target="_blank" rel="noreferrer" aria-label={`${project.name} repository`}>
          <Github size={17} /><ExternalLink size={12} />
        </a>
      </div>
    </article>
  );
}

export default function HomePage({ documentation, selection, site }: { documentation: GeneratedDocumentation; selection: DirectorySelection; site: SiteConfig }) {
  const { projects, generatedAt } = documentation;
  const configuredTypes = [...new Set(projects.flatMap((project) => project.documentationType ? [project.documentationType] : []))];
  const documentationTypes = [...new Set(["minecraft", ...configuredTypes])];
  const generalProjects = projects.filter((project) => !project.documentationType || !project.category);
  const selectedType = selection.general ? null : selection.type;
  const typeProjects = selectedType ? projects.filter((project) => project.documentationType === selectedType) : [];
  const categoryNames = selectedType === "minecraft"
    ? [...new Set(["modpack", "mod", ...typeProjects.flatMap((project) => project.category ? [project.category] : [])])]
    : [...new Set(typeProjects.flatMap((project) => project.category ? [project.category] : []))];
  const visibleProjects = selection.general
    ? generalProjects
    : selectedType
      ? typeProjects.filter((project) => !selection.category || project.category === selection.category)
      : [];

  const directoryTitle = selection.general
    ? "General projects"
    : selectedType
      ? selection.category ? label(selection.category) : label(selectedType)
      : "Choose a game";

  if (selectedType === "minecraft") {
    return (
      <GameDirectoryPage
        game="Minecraft"
        projects={typeProjects}
        selectedCategory={selection.category}
        categories={categoryNames.map((category) => ({
          name: category,
          label: label(category),
          href: `/${categorySegment(category)}/`,
        }))}
        site={site}
      />
    );
  }

  if (!selectedType && !selection.general) {
    const showsHowItWorks = selection.infoPage === "how-it-works";
    return (
      <div className="docs-shell home-docs-shell">
        <header className="docs-header">
          <a className="material-brand" href={withBasePath("/")}><span className="material-logo"><BookOpen size={19} /></span><span>{site.name}</span></a>
          <div className="docs-actions">
            <div className="docs-search" aria-label="Search is not available yet"><Search size={17} /><span>Search</span></div>
            <a className="header-repository" href={site.repository} target="_blank" rel="noreferrer"><Github size={20} /><span>{new URL(site.repository).pathname.replace(/^\//, "")}</span></a>
          </div>
        </header>

        <nav className="docs-tabs" aria-label="Main sections">
          <a className={showsHowItWorks ? "" : "active"} href={withBasePath("/")}>Home</a>
          <a className={showsHowItWorks ? "active" : ""} href={withBasePath("/how-it-works/")}>Documentation</a>
        </nav>

        <aside className="docs-sidebar">
          <div className="game-sidebar-title">{showsHowItWorks ? "How it works" : "Games"}</div>
          {!showsHowItWorks && (
            <nav className="docs-nav" aria-label="Games">
              {documentationTypes.map((type) => (
                <a href={withBasePath(type === "minecraft" ? "/modpacks/" : `/${type}/`)} key={type}>{label(type)}</a>
              ))}
              {generalProjects.length > 0 && <a href={withBasePath("/projects/")}>General</a>}
            </nav>
          )}
        </aside>

        <main className="docs-main">
          <article className="markdown-body">
            {showsHowItWorks ? (
              <>
                <h1>How it works</h1>
                <p>{site.name} builds a static documentation site from files stored in a project repository.</p>
                <h2 id="add-a-repository">Add a repository</h2>
                <p>Add the public repository URL, project name, and stable slug to the {site.name} configuration.</p>
                <h2 id="write-documentation">Write documentation</h2>
                <p>Put Markdown files in the repository&apos;s <code>docs/</code> directory. Use <code>.nav.yml</code> files to control navigation.</p>
                <h2 id="build-the-site">Build the site</h2>
                <p>{site.name} pulls the repository and creates static pages for every document.</p>
              </>
            ) : (
              <>
                <h1>{site.name}</h1>
                <p>{site.description}</p>
                <h2 id="choose-a-game">Choose a game</h2>
                <div className="home-game-list">
                  {documentationTypes.map((type) => {
                    const count = projects.filter((project) => project.documentationType === type).length;
                    return (
                      <a href={withBasePath(type === "minecraft" ? "/modpacks/" : `/${type}/`)} key={type}>
                        <span><b>{label(type)}</b><small>{type === "minecraft" ? "Mods and modpacks" : `${label(type)} projects`}</small></span>
                        <small>{count} project{count === 1 ? "" : "s"}</small>
                        <ArrowRight size={16} />
                      </a>
                    );
                  })}
                  {generalProjects.length > 0 && (
                    <a href={withBasePath("/projects/")}>
                      <span><b>General</b><small>Libraries and developer tools</small></span>
                      <small>{generalProjects.length} project{generalProjects.length === 1 ? "" : "s"}</small>
                      <ArrowRight size={16} />
                    </a>
                  )}
                </div>
              </>
            )}
          </article>
        </main>

        <aside className="page-toc">
          <b>Table of contents</b>
          {showsHowItWorks ? (
            <>
              <a href="#add-a-repository">Add a repository</a>
              <a href="#write-documentation">Write documentation</a>
              <a href="#build-the-site">Build the site</a>
            </>
          ) : <a href="#choose-a-game">Choose a game</a>}
        </aside>
      </div>
    );
  }

  return (
    <div className="portal-shell">
      <header className="material-header portal-header">
        <a className="material-brand" href={withBasePath("/")}><span className="material-logo"><BookOpen size={21} /></span><span>{site.name}</span></a>
        <nav aria-label="Main navigation"><a className="active" href={withBasePath("/#projects")}>Projects</a><a href={withBasePath("/#how-it-works")}>How it works</a></nav>
        <a className="header-repository" href={site.repository} target="_blank" rel="noreferrer"><Github size={19} /><span>Source</span></a>
      </header>

      <main className="portal-main">
        <section className="portal-hero">
          <h1>Documentation that stays with the code</h1>
          <p>{site.description}</p>
        </section>

        <section className="project-section" id="projects">
          <div className="section-heading">
            <div><h2>{directoryTitle}</h2></div>
            <small>Last built {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(generatedAt))}</small>
          </div>

          {selectedType && (
            <nav className="project-tabs" aria-label={`${label(selectedType)} categories`}>
              <a className={!selection.category ? "active" : ""} href={withBasePath(`/${selectedType}/`)}>All<span>{typeProjects.length}</span></a>
              {categoryNames.map((category) => {
                const count = typeProjects.filter((project) => project.category === category).length;
                return <a className={selection.category === category ? "active" : ""} href={withBasePath(`/${selectedType}/${categorySegment(category)}/`)} key={category}>{label(category)}<span>{count}</span></a>;
              })}
            </nav>
          )}
          <div className="portal-projects">
            {visibleProjects.map(projectCard)}
            {visibleProjects.length === 0 && <div className="empty-projects"><FileText size={20} /><p>No projects are published in this category.</p></div>}
          </div>
        </section>

        <section className="portal-process" id="how-it-works">
          <div className="section-heading"><div><h2>How it works</h2></div></div>
          <div className="process-grid">
            <div><b>01</b><h3>Add the repository</h3><p>Define its public URL and stable slug in the {site.name} config.</p></div>
            <div><b>02</b><h3>Describe the project</h3><p>Set its type and category in docs/repodocs.yml.</p></div>
            <div><b>03</b><h3>Build the site</h3><p>{site.name} pulls the latest commit and exports every page as static HTML.</p></div>
          </div>
        </section>
      </main>

      <footer className="portal-footer"><span>{site.name}</span><p>The repository owns the documentation.</p></footer>
    </div>
  );
}
