import { BookOpen, Github } from "lucide-react";
import { DocumentationSearch } from "@/components/documentation-search";
import {
  projectOverviewHref,
  projectPageHref,
} from "@/lib/routes";
import type { SiteConfig } from "@/lib/config";
import type {
  CachedDocumentationLocale,
  CachedDocumentationVersion,
  CachedProject,
} from "@/lib/types";

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

export function ProjectHeader({
  active,
  currentPath,
  locale,
  project,
  projects,
  site,
  version,
}: {
  active: "overview" | "documentation";
  currentPath: string;
  locale: CachedDocumentationLocale;
  project: CachedProject;
  projects: CachedProject[];
  site: SiteConfig;
  version: CachedDocumentationVersion;
}) {
  const repositoryName = new URL(project.repositoryUrl).pathname.replace(/^\//, "");
  const versions = Object.values(project.versions);
  const locales = Object.values(version.locales);

  return (
    <>
      <header className="docs-header">
        <a className="material-brand" href="/"><span className="material-logo"><BookOpen size={19} /></span><span>{site.name}</span></a>
        <a className="project-header-title" href={projectOverviewHref(project, locale.code, version.id)}>{project.name}</a>
        <div className="docs-actions">
          <DocumentationSearch projects={projects} />
          <a className="header-repository" href={project.repositoryUrl} target="_blank" rel="noreferrer" title="Open repository"><Github size={20} /><span>{repositoryName}</span></a>
        </div>
      </header>

      <nav className="docs-tabs project-tabs-bar" aria-label={`${project.name} sections`}>
        <a className={active === "overview" ? "active" : ""} href={projectOverviewHref(project, locale.code, version.id)}>Overview</a>
        <a
          className={active === "documentation" ? "active" : ""}
          href={projectPageHref(project, locale.defaultPage, version.id, locale.code)}
        >
          Documentation
        </a>
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
                window.location.href = active === "overview"
                  ? projectOverviewHref(project, nextLocale, nextVersion)
                  : projectPageHref(
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
                window.location.href = active === "overview"
                  ? projectOverviewHref(project, nextLocale, version.id)
                  : projectPageHref(
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
    </>
  );
}
