import { BookOpen, Github } from "lucide-react";
import { DocumentationContent } from "@/components/documentation-content";
import { DocsNav } from "@/components/docs-nav";
import { DocumentationSearch } from "@/components/documentation-search";
import { GroupedProjectList } from "@/components/grouped-project-list";
import { SiteFooter } from "@/components/site-footer";
import { projectDocumentationBasePath, projectPageHref } from "@/lib/routes";
import {
  repositoryCommitHref,
  repositoryFileHref,
  repositoryIssuesHref,
} from "@/lib/repository-links";
import type { SiteConfig } from "@/lib/config";
import type {
  CachedDocumentationLocale,
  CachedDocumentationVersion,
  CachedPage,
  CachedProject,
  NavItem,
} from "@/lib/types";

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

function pageForContext(
  project: CachedProject,
  versionId: string,
  localeCode: string,
  requestedPath: string,
): string {
  const version = project.versions[versionId];
  const locale = version.locales[localeCode]
    ?? version.locales[project.defaultLocale]
    ?? Object.values(version.locales)[0];
  return locale.pages[requestedPath] ? requestedPath : locale.defaultPage;
}

export function DocumentationPage({
  projects,
  project,
  page,
  currentPath,
  locale,
  site,
  version,
}: {
  projects: CachedProject[];
  project: CachedProject;
  page: CachedPage;
  currentPath: string;
  locale: CachedDocumentationLocale;
  site: SiteConfig;
  version: CachedDocumentationVersion;
}) {
  const activeNavigation = locale.navigation.find((item) => includesPage(item, currentPath));
  const repositoryName = new URL(project.repositoryUrl).pathname.replace(/^\//, "");
  const isMinecraft = project.documentationType === "minecraft";
  const categoryProjects = isMinecraft
    ? projects.filter((item) => item.documentationType === "minecraft" && item.category === project.category)
    : [];
  const categoryLabel = project.category === "modpack" ? "Modpacks" : project.category === "mod" ? "Mods" : "Projects";
  const versions = Object.values(project.versions);
  const locales = Object.values(version.locales);

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

      <nav className="docs-tabs project-tabs-bar" aria-label="Documentation sections">
        {isMinecraft ? (
          <>
            <a className={project.category === "modpack" ? "active" : ""} href="/modpacks/">Modpacks</a>
            <a className={project.category === "mod" ? "active" : ""} href="/mods/">Mods</a>
          </>
        ) : locale.navigation.map((item, index) => {
          const target = firstPage(item);
          if (target === null) return null;
          return (
            <a
              className={includesPage(item, currentPath) ? "active" : ""}
              href={projectPageHref(project, target, version.id, locale.code)}
              key={`${item.title}-${index}`}
            >
              {item.title}
            </a>
          );
        })}
        <div className="documentation-context">
          <label>
            <span>Version</span>
            <select
              aria-label="Documentation version"
              value={version.id}
              onChange={(event) => {
                const nextVersion = event.currentTarget.value;
                const nextVersionData = project.versions[nextVersion];
                const nextLocale = nextVersionData.locales[locale.code] ? locale.code : project.defaultLocale;
                window.location.href = projectPageHref(
                  project,
                  pageForContext(project, nextVersion, nextLocale, currentPath),
                  nextVersion,
                  nextLocale,
                );
              }}
            >
              {versions.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span>Language</span>
            <select
              aria-label="Documentation language"
              value={locale.code}
              onChange={(event) => {
                const nextLocale = event.currentTarget.value;
                window.location.href = projectPageHref(
                  project,
                  pageForContext(project, version.id, nextLocale, currentPath),
                  version.id,
                  nextLocale,
                );
              }}
            >
              {locales.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </nav>

      <aside className="docs-sidebar">
        {isMinecraft ? (
          <div className="classified-docs-navigation">
            <div className="game-sidebar-title">{categoryLabel}</div>
            <GroupedProjectList
              projects={categoryProjects}
              ariaLabel={`${categoryLabel} projects`}
              currentProject={project}
              currentVersion={version}
              currentLocale={locale}
              currentPath={currentPath}
            />
          </div>
        ) : (
          <DocsNav
            items={activeNavigation ? [activeNavigation] : locale.navigation}
            basePath={projectDocumentationBasePath(project, version.id, locale.code)}
            currentPath={currentPath}
          />
        )}
      </aside>

      <DocumentationContent
        page={page}
        referenceDate={version.builtAt}
        sourcePath={page.sourcePath}
        commitRevision={page.history.updatedRevision}
        sourceHref={repositoryFileHref(project.repositoryUrl, version.branch, page.sourcePath, "branch")}
        commitHref={repositoryCommitHref(project.repositoryUrl, page.history.updatedRevision)}
        repositoryName={project.name}
        repositoryFooter={project.footerLinks}
        editHref={repositoryFileHref(project.repositoryUrl, version.branch, page.sourcePath, "branch")}
        reportHref={repositoryIssuesHref(project.repositoryUrl)}
      />
      <SiteFooter name={site.name} />
    </div>
  );
}
