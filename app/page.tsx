import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  FileText,
  GitBranch,
  Github,
} from "lucide-react";
import { GameDirectoryPage } from "@/components/game-directory-page";
import { DocumentationContent } from "@/components/documentation-content";
import { DocumentationSearch } from "@/components/documentation-search";
import { DocsNav } from "@/components/docs-nav";
import { SiteFooter } from "@/components/site-footer";
import {
  categoryLabel,
  directoryCategoryNames,
  directoryDefinition,
  directoryHref,
  directoryLabel,
  firstClassDirectories,
} from "@/lib/classification";
import { projectPageHref } from "@/lib/routes";
import { defaultDocumentationContext } from "@/lib/documentation-context";
import { repositoryCommitHref, repositoryFileHref } from "@/lib/repository-links";
import type { SiteConfig } from "@/lib/config";
import type { CachedProject, GeneratedDocumentation } from "@/lib/types";

export type DirectorySelection = {
  type: string | null;
  category: string | null;
  general?: boolean;
  infoPage?: "docs";
  documentationPath?: string;
};

function label(value: string): string {
  if (value === "mod") return "Mods";
  if (value === "modpack") return "Modpacks";
  return directoryLabel(value);
}

function projectCard(project: CachedProject) {
  const { version, locale } = defaultDocumentationContext(project);
  return (
    <article className="portal-project" key={project.slug}>
      <div className="project-icon">
        {project.favicon
          ? <img src={project.favicon} alt="" width="42" height="42" />
          : project.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="project-details">
        <h3>{project.name}</h3>
        <p>{project.summary || locale.pages[locale.defaultPage]?.description || "Project documentation from the source repository."}</p>
        <div className="project-meta">
          <span><FileText size={14} /> {Object.keys(locale.pages).length} pages</span>
          <span><GitBranch size={14} /> {version.sourceRevision.slice(0, 7)}</span>
          {project.gameVersions.length > 0 && <span>{project.gameVersions[0]}</span>}
          {project.loaders.length > 0 && <span>{project.loaders.map(label).join(" · ")}</span>}
          {project.documentationType && project.category && <span className="project-kind">{label(project.documentationType)} · {label(project.category)}</span>}
        </div>
      </div>
      <div className="project-actions">
        <a className="open-docs" href={projectPageHref(project, locale.defaultPage, version.id, locale.code)}>
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
  const { projects, generatedAt, siteDocumentation: docsProject } = documentation;
  const { version: docsVersion, locale: docsLocale } = defaultDocumentationContext(docsProject);
  const documentationPath = selection.documentationPath ?? docsLocale.defaultPage;
  const docsPage = docsLocale.pages[documentationPath];
  const configuredTypes = [...new Set(projects.flatMap((project) => project.documentationType ? [project.documentationType] : []))];
  const documentationTypes = [...new Set([
    ...firstClassDirectories().map((directory) => directory.type),
    ...configuredTypes,
  ])];
  const generalProjects = projects.filter((project) => !project.documentationType || !project.category);
  const selectedType = selection.general ? null : selection.type;
  const typeProjects = selectedType ? projects.filter((project) => project.documentationType === selectedType) : [];
  const categoryNames = selectedType
    ? directoryCategoryNames(selectedType, typeProjects.flatMap((project) => project.category ? [project.category] : []))
    : [];
  const visibleProjects = selection.general
    ? generalProjects
    : selectedType
      ? typeProjects.filter((project) => !selection.category || project.category === selection.category)
      : [];

  const directoryTitle = selection.general
    ? "General projects"
    : selectedType
      ? selection.category ? label(selection.category) : label(selectedType)
      : "Choose a category";

  const selectedDirectory = selectedType ? directoryDefinition(selectedType) : null;
  if (selectedDirectory) {
    return (
      <GameDirectoryPage
        game={selectedDirectory.label}
        projects={typeProjects}
        searchProjects={projects}
        selectedCategory={selection.category}
        categories={categoryNames.map((category) => ({
          name: category,
          label: categoryLabel(selectedType, category),
          href: directoryHref(selectedDirectory.type, category),
        }))}
        site={site}
      />
    );
  }

  if (!selectedType && !selection.general) {
    const showsHowItWorks = selection.infoPage === "docs";
    return (
      <div className="docs-shell home-docs-shell">
        <header className="docs-header">
          <a className="material-brand" href="/"><span className="material-logo"><BookOpen size={19} /></span><span>{site.name}</span></a>
          <div className="docs-actions">
            <DocumentationSearch projects={projects} />
            <a className="header-repository" href={site.repository} target="_blank" rel="noreferrer"><Github size={20} /><span>{new URL(site.repository).pathname.replace(/^\//, "")}</span></a>
          </div>
        </header>

        <nav className="docs-tabs" aria-label="Main sections">
          <a className={showsHowItWorks ? "" : "active"} href="/">Home</a>
          <a className={showsHowItWorks ? "active" : ""} href="/docs/">Documentation</a>
        </nav>

        <aside className="docs-sidebar">
          <div className="game-sidebar-title">{showsHowItWorks ? "RepoDocs guide" : "Categories"}</div>
          {showsHowItWorks ? (
            <DocsNav items={docsLocale.navigation} basePath="/docs" currentPath={documentationPath} />
          ) : (
            <nav className="docs-nav" aria-label="Categories">
              {documentationTypes.map((type) => (
                <a href={directoryHref(type)} key={type}>{label(type)}</a>
              ))}
              {generalProjects.length > 0 && <a href="/projects/">General</a>}
            </nav>
          )}
        </aside>

        {showsHowItWorks ? (
          <DocumentationContent
            page={docsPage}
            referenceDate={docsVersion.builtAt}
            sourcePath={docsPage.sourcePath}
            commitRevision={docsPage.history.updatedRevision}
            sourceHref={repositoryFileHref(site.repository, docsVersion.sourceRevision, docsPage.sourcePath)}
            commitHref={repositoryCommitHref(site.repository, docsPage.history.updatedRevision)}
          />
        ) : (
          <>
            <main className="docs-main">
              <article className="markdown-body">
                <h1>{site.name}</h1>
                <p>{site.description}</p>
                <h2 id="choose-a-category">Choose a category</h2>
                <div className="home-game-list">
                  {documentationTypes.map((type) => {
                    const count = projects.filter((project) => project.documentationType === type).length;
                    return (
                      <a href={directoryHref(type)} key={type}>
                        <span><b>{label(type)}</b><small>{directoryDefinition(type)?.description ?? `${label(type)} projects`}</small></span>
                        <small>{count} project{count === 1 ? "" : "s"}</small>
                        <ArrowRight size={16} />
                      </a>
                    );
                  })}
                  {generalProjects.length > 0 && (
                    <a href="/projects/">
                      <span><b>General</b><small>Libraries and developer tools</small></span>
                      <small>{generalProjects.length} project{generalProjects.length === 1 ? "" : "s"}</small>
                      <ArrowRight size={16} />
                    </a>
                  )}
                </div>
              </article>
            </main>
            <aside className="page-toc">
              <b>Table of contents</b>
              <a href="#choose-a-category">Choose a category</a>
            </aside>
          </>
        )}
        <SiteFooter name={site.name} />
      </div>
    );
  }

  return (
    <div className="portal-shell">
      <header className="material-header portal-header">
        <a className="material-brand" href="/"><span className="material-logo"><BookOpen size={21} /></span><span>{site.name}</span></a>
        <nav aria-label="Main navigation"><a className="active" href="/#projects">Projects</a><a href="/#how-it-works">How it works</a></nav>
        <DocumentationSearch projects={projects} />
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
              <a className={!selection.category ? "active" : ""} href={`/${selectedType}/`}>All<span>{typeProjects.length}</span></a>
              {categoryNames.map((category) => {
                const count = typeProjects.filter((project) => project.category === category).length;
                return <a className={selection.category === category ? "active" : ""} href={directoryHref(selectedType, category)} key={category}>{categoryLabel(selectedType, category)}<span>{count}</span></a>;
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

      <SiteFooter name={site.name} />
    </div>
  );
}
