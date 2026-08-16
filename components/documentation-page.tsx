import { DocumentationContent } from "@/components/documentation-content";
import { DocsNav } from "@/components/docs-nav";
import { ProjectHeader } from "@/components/project-header";
import { projectDocumentationBasePath } from "@/lib/routes";
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
} from "@/lib/types";

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
  return (
    <div className="docs-shell">
      <ProjectHeader active="documentation" currentPath={currentPath} locale={locale} project={project} projects={projects} site={site} version={version} />

      <aside className="docs-sidebar">
        <DocsNav
          items={locale.navigation}
          basePath={projectDocumentationBasePath(project, version.id, locale.code)}
          currentPath={currentPath}
        />
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
    </div>
  );
}
