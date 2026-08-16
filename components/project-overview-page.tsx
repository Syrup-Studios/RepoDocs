import { useEffect, useState, type MouseEvent } from "react";
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
  Scale,
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
  ProjectLicense,
} from "@/lib/types";

type ProjectLink = {
  label: string;
  url: string;
  kind: "curseforge" | "modrinth" | "github" | "git" | "other";
};

function label(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classification(project: CachedProject): string {
  if (!project.documentationType || !project.category) return "Project documentation";
  return `${label(project.documentationType)} ${label(project.category)}`;
}

function repositoryPlatform(url: string): { label: string; kind: "github" | "git" } {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "github.com") return { label: "GitHub", kind: "github" };
    if (hostname === "gitlab.com" || hostname.includes("gitlab")) return { label: "GitLab", kind: "git" };
    if (hostname === "codeberg.org") return { label: "Codeberg", kind: "git" };
    if (hostname === "bitbucket.org") return { label: "Bitbucket", kind: "git" };
    if (hostname === "dev.azure.com" || hostname.endsWith(".visualstudio.com")) return { label: "Azure DevOps", kind: "git" };
    if (hostname === "git.sr.ht") return { label: "SourceHut", kind: "git" };
    return { label: label(hostname.split(".")[0] || "Git"), kind: "git" };
  } catch {
    return { label: "Git", kind: "git" };
  }
}

function projectLinks(project: CachedProject): ProjectLink[] {
  const typePath = project.category === "modpack" ? "modpack" : "mod";
  const curseForgePath = project.category === "modpack" ? "modpacks" : "mc-mods";
  const platformLinks: ProjectLink[] = [
    ...(project.platforms.modrinth
      ? [{
          label: "Modrinth",
          url: `https://modrinth.com/${typePath}/${project.platforms.modrinth.id}`,
          kind: "modrinth" as const,
        }]
      : []),
    ...(project.platforms.curseforge
      ? [{
          label: "CurseForge",
          url: `https://www.curseforge.com/minecraft/${curseForgePath}/${project.platforms.curseforge.id}`,
          kind: "curseforge" as const,
        }]
      : []),
  ].sort((left, right) => {
    if (!project.platforms.primary) return 0;
    if (left.kind === project.platforms.primary) return -1;
    if (right.kind === project.platforms.primary) return 1;
    return 0;
  });
  const additionalLinks: ProjectLink[] = project.footerLinks.map((link) => ({
    ...link,
    kind: link.url.startsWith("https://github.com/") ? "github" : "other",
  }));
  const sourcePlatform = repositoryPlatform(project.repositoryUrl);
  return [
    { label: sourcePlatform.label, url: project.repositoryUrl, kind: sourcePlatform.kind },
    ...platformLinks,
    ...additionalLinks,
  ].filter((link, index, links) => links.findIndex((candidate) => candidate.url === link.url) === index);
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function licenseLabel(license: ProjectLicense): string {
  return license.name ?? license.id ?? "Custom license";
}

function licenseSource(license: ProjectLicense): string {
  if (license.source === "repository") return `Detected from ${license.sourcePath ?? "repository"}`;
  if (license.source === "platform") return "Provided by the primary platform";
  return "Declared in project metadata";
}

function SectionTitle({ icon: Icon, children }: { icon: typeof BookOpen; children: string }) {
  return <h2 className="project-section-title"><Icon size={18} />{children}</h2>;
}

function LicenseCard({ label: cardLabel, license }: { label: string; license: ProjectLicense }) {
  const content = license.url
    ? <a href={license.url} target="_blank" rel="noreferrer noopener">{licenseLabel(license)}</a>
    : <strong>{licenseLabel(license)}</strong>;
  return (
    <div className="project-license-card">
      <Scale size={18} />
      <span>
        <small>{cardLabel}</small>
        {content}
        <em>{licenseSource(license)}</em>
      </span>
    </div>
  );
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
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const landingPage = locale.pages[locale.defaultPage];
  const authors = landingPage?.history.authors ?? [];
  const pageCount = Object.keys(locale.pages).length;
  const localeCount = Object.keys(version.locales).length;
  const versionCount = Object.keys(project.versions).length;
  const links = projectLinks(project);
  const documentationHref = projectPageHref(project, locale.defaultPage, version.id, locale.code);
  const displayedTags = [...new Set([...project.loaders, ...project.tags])];

  useEffect(() => {
    if (!expandedImage) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedImage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expandedImage]);

  function expandDescriptionImage(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const image = target.closest("img");
    if (!image || image.closest("a")) return;
    setExpandedImage({ src: image.currentSrc || image.src, alt: image.alt });
  }

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
            <p>{project.summary || landingPage?.description || `Documentation for ${project.name}.`}</p>
          </div>
        </header>

        <div className="project-profile-summary">
          <p>
            <strong>{project.name}</strong> is a {classification(project).toLowerCase()}
            {project.owners.length > 0 && <> maintained by {project.owners.map((owner, index) => (
              <span key={owner}>{index > 0 && ", "}<a href={`https://github.com/${owner}`} target="_blank" rel="noreferrer noopener">{owner}</a></span>
            ))}</>}.
          </p>
          <p>
            Available in <strong>{versionCount} {versionCount === 1 ? "version" : "versions"}</strong> with <strong>{localeCount} {localeCount === 1 ? "language" : "languages"}</strong>. The selected version contains <strong>{pageCount} {pageCount === 1 ? "page" : "pages"}</strong>
            {project.gameVersions.length > 0 && <> for <strong>{project.gameVersions.join(", ")}</strong></>}.
          </p>
          {(displayedTags.length > 0 || project.documentationType || project.category) && (
            <div className="project-profile-tags"><Tag size={15} /><span>Tagged:</span>
              {project.documentationType && <b>{label(project.documentationType)}</b>}
              {project.category && <b>{label(project.category)}</b>}
              {displayedTags.map((tag) => <b key={tag}>{label(tag)}</b>)}
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
              <article
                className="markdown-body"
                onClick={expandDescriptionImage}
                dangerouslySetInnerHTML={{ __html: landingPage.html }}
              />
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
                  {link.kind === "github" ? <Github size={17} /> : link.kind === "git" ? <GitBranch size={17} /> : <ExternalLink size={16} />}
                  {link.label}
                </a>
              ))}
            </nav>
          </section>
        )}

        {(project.licenses.project || project.licenses.documentation) && (
          <section className="project-overview-section">
            <SectionTitle icon={Scale}>Licenses</SectionTitle>
            <div className="project-license-grid">
              {project.licenses.project && <LicenseCard label="Project license" license={project.licenses.project} />}
              {project.licenses.documentation && <LicenseCard label="Documentation license" license={project.licenses.documentation} />}
            </div>
          </section>
        )}

        <section className="project-overview-section">
          <SectionTitle icon={GitBranch}>Project information</SectionTitle>
          <div className="project-information-grid">
            {project.modId && <div><FileText size={17} /><span><small>Mod ID</small><strong>{project.modId}</strong></span></div>}
            <div><GitBranch size={17} /><span><small>Current version</small><strong>{version.label}</strong></span></div>
            <div><Languages size={17} /><span><small>Current language</small><strong>{locale.label}</strong></span></div>
            <div><CalendarClock size={17} /><span><small>Documentation built</small><strong>{shortDate(version.builtAt)}</strong></span></div>
            <div><Users size={17} /><span><small>Contributors</small><strong>{authors.length || "Unknown"}</strong></span></div>
            <div><GitBranch size={17} /><span><small>Source</small><strong>{version.branch} · {version.sourceRevision.slice(0, 7)}</strong></span></div>
          </div>
        </section>

        {expandedImage && (
          <div
            className="project-image-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={expandedImage.alt || "Expanded project image"}
            onClick={() => setExpandedImage(null)}
          >
            <button type="button" onClick={() => setExpandedImage(null)} aria-label="Close expanded image">Close</button>
            <img src={expandedImage.src} alt={expandedImage.alt} onClick={(event) => event.stopPropagation()} />
          </div>
        )}
      </main>
    </div>
  );
}
