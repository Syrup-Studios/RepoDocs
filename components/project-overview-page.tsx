import { useState } from "react";
import {
  BookOpen,
  CalendarClock,
  ExternalLink,
  FileText,
  GitBranch,
  Github,
  Languages,
  Link2,
  Map,
  Tag,
  Users,
} from "lucide-react";
import { ProjectHeader } from "@/components/project-header";
import { projectPageHref } from "@/lib/routes";
import type { SiteConfig } from "@/lib/config";
import type {
  CachedDocumentationLocale,
  CachedDocumentationVersion,
  CachedProject,
} from "@/lib/types";

type ProjectLink = {
  label: string;
  url: string;
  kind: "curseforge" | "modrinth" | "github" | "other";
};

function label(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classification(project: CachedProject): string {
  if (!project.documentationType || !project.category) return "project";
  return `${label(project.documentationType)} ${label(project.category)}`;
}

function projectLinks(project: CachedProject): ProjectLink[] {
  const typePath = project.category === "modpack" ? "modpack" : "mod";
  const curseForgePath = project.category === "modpack" ? "modpacks" : "mc-mods";
  const platformLinks: ProjectLink[] = [
    ...(project.platforms.curseforge
      ? [{
          label: "CurseForge",
          url: `https://www.curseforge.com/minecraft/${curseForgePath}/${project.platforms.curseforge}`,
          kind: "curseforge" as const,
        }]
      : []),
    ...(project.platforms.modrinth
      ? [{
          label: "Modrinth",
          url: `https://modrinth.com/${typePath}/${project.platforms.modrinth}`,
          kind: "modrinth" as const,
        }]
      : []),
  ];
  const additionalLinks: ProjectLink[] = project.footerLinks.map((link) => ({
    ...link,
    kind: link.url.startsWith("https://github.com/") ? "github" : "other",
  }));
  return [...platformLinks, ...additionalLinks].filter((link, index, links) =>
    links.findIndex((candidate) => candidate.url === link.url) === index,
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof BookOpen; children: string }) {
  return <h2 className="project-section-title"><Icon size={18} />{children}</h2>;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export function ProjectOverviewPage({
  locale,
  project,
  projects,
  site,
  version,
}: {
  locale: CachedDocumentationLocale;
  project: CachedProject;
  projects: CachedProject[];
  site: SiteConfig;
  version: CachedDocumentationVersion;
}) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const landingPage = locale.pages[locale.defaultPage];
  const authors = landingPage?.history.authors ?? [];
  const pageCount = Object.keys(locale.pages).length;
  const localeCount = Object.keys(version.locales).length;
  const versionCount = Object.keys(project.versions).length;
  const links = projectLinks(project);
  const documentationHref = projectPageHref(project, locale.defaultPage, version.id, locale.code);

  return (
    <div className="docs-shell project-overview-shell">
      <ProjectHeader
        active="overview"
        currentPath={locale.defaultPage}
        locale={locale}
        project={project}
        projects={projects}
        site={site}
        version={version}
      />

      <main className="project-overview-page">
        <header className="project-profile-header">
          {project.favicon
            ? <img src={project.favicon} alt="" width="56" height="56" />
            : <span className="project-profile-fallback" aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>}
          <div>
            <h1>{project.name}</h1>
            <p>{landingPage?.description || `Documentation for ${project.name}.`}</p>
          </div>
        </header>

        <div className="project-profile-summary">
          <p>
            <strong>{project.name}</strong> is a {classification(project)}
            {authors.length > 0 && <> documented by <strong>{authors.join(", ")}</strong></>}.
          </p>
          <p>
            Available in <strong>{versionCount} {versionCount === 1 ? "version" : "versions"}</strong> with <strong>{localeCount} {localeCount === 1 ? "language" : "languages"}</strong>. The selected version contains <strong>{pageCount} {pageCount === 1 ? "page" : "pages"}</strong>.
          </p>
          {(project.documentationType || project.category) && (
            <div className="project-profile-tags"><Tag size={15} /><span>Tagged:</span>
              {project.documentationType && <b>{label(project.documentationType)}</b>}
              {project.category && <b>{label(project.category)}</b>}
            </div>
          )}
        </div>

        {landingPage && (
          <section className="project-overview-section">
            <SectionTitle icon={BookOpen}>Description</SectionTitle>
            <div className={`project-description-card${descriptionExpanded ? " expanded" : ""}`}>
              {!descriptionExpanded && (
                <button type="button" onClick={() => setDescriptionExpanded(true)} aria-expanded="false">
                  Expand description
                </button>
              )}
              <article className="markdown-body" dangerouslySetInnerHTML={{ __html: landingPage.html }} />
            </div>
          </section>
        )}

        <section className="project-overview-section">
          <SectionTitle icon={Map}>Navigation</SectionTitle>
          <div className="project-navigation-cards">
            <a href={documentationHref}>
              <span><FileText size={18} /><strong>Browse documentation</strong></span>
              <small>{pageCount} {pageCount === 1 ? "page" : "pages"} available.</small>
            </a>
            <a href={project.repositoryUrl} target="_blank" rel="noreferrer noopener">
              <span><GitBranch size={18} /><strong>Browse source</strong></span>
              <small>Open the project repository.</small>
            </a>
          </div>
        </section>

        {links.length > 0 && (
          <section className="project-overview-section">
            <SectionTitle icon={Link2}>Links</SectionTitle>
            <nav className="project-link-buttons" aria-label={`${project.name} links`}>
              {links.map((link) => (
                <a className={`project-link-button ${link.kind}`} href={link.url} target="_blank" rel="noreferrer noopener" key={link.url}>
                  {link.kind === "github" ? <Github size={17} /> : <ExternalLink size={16} />}
                  {link.label}
                </a>
              ))}
            </nav>
          </section>
        )}

        <section className="project-overview-section">
          <SectionTitle icon={GitBranch}>Project information</SectionTitle>
          <div className="project-information-grid">
            <div><GitBranch size={17} /><span><small>Current version</small><strong>{version.label}</strong></span></div>
            <div><Languages size={17} /><span><small>Current language</small><strong>{locale.label}</strong></span></div>
            <div><CalendarClock size={17} /><span><small>Documentation built</small><strong>{shortDate(version.builtAt)}</strong></span></div>
            <div><Users size={17} /><span><small>Contributors</small><strong>{authors.length || "Unknown"}</strong></span></div>
          </div>
        </section>
      </main>
    </div>
  );
}
