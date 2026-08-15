import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, CalendarPlus, ChevronRight, Github, History, UserRound } from "lucide-react";
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

function relativeDate(value: string, reference: string): string {
  const elapsedSeconds = (new Date(value).getTime() - new Date(reference).getTime()) / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60],
    ["month", 30 * 24 * 60 * 60],
    ["week", 7 * 24 * 60 * 60],
    ["day", 24 * 60 * 60],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  for (const [unit, seconds] of units) {
    if (Math.abs(elapsedSeconds) >= seconds) {
      return formatter.format(Math.round(elapsedSeconds / seconds), unit);
    }
  }
  return "just now";
}

function localDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function LocalDateTitle({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  const [title, setTitle] = useState(`${label} ${new Date(value).toISOString()}`);

  useEffect(() => {
    setTitle(`${label} ${localDate(value)}`);
  }, [label, value]);

  return <span title={title}>{children}</span>;
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

      <main className="docs-main">
        <article className="markdown-body">
          <div dangerouslySetInnerHTML={{ __html: page.html }} />
        </article>
        <footer className="page-footer">
          <div className="page-history" aria-label="Document history">
            <LocalDateTitle label="Last edited" value={page.history.updatedAt}>
              <History size={17} aria-hidden="true" />
              {relativeDate(page.history.updatedAt, project.builtAt)}
            </LocalDateTitle>
            <LocalDateTitle label="Created" value={page.history.createdAt}>
              <CalendarPlus size={17} aria-hidden="true" />
              {relativeDate(page.history.createdAt, project.builtAt)}
            </LocalDateTitle>
            <span title={`Authors: ${page.history.authors.join(", ")}`}>
              <UserRound size={17} aria-hidden="true" />
              {page.history.authors.join(", ")}
            </span>
          </div>
          <div className="page-source">
            <span>Source: <code>docs/{page.sourcePath}</code></span>
            <span>Commit {project.sourceRevision.slice(0, 7)}</span>
          </div>
        </footer>
      </main>

      {page.headings.length > 0 && (
        <aside className="page-toc">
          <b>Table of contents</b>
          {page.headings.map((heading) => <a className={heading.level === 3 ? "nested" : ""} href={`#${heading.id}`} key={heading.id}>{heading.text}</a>)}
        </aside>
      )}
    </div>
  );
}
