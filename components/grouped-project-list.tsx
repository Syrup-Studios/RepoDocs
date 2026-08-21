import { ProjectTree } from "@/components/project-tree";
import { defaultDocumentationContext } from "@/lib/documentation-context";
import { projectDocumentationBasePath, projectPageHref } from "@/lib/routes";
import type {
  CachedDocumentationLocale,
  CachedDocumentationVersion,
  CachedProject,
  NavItem,
} from "@/lib/types";

type GroupedProject = {
  key: string;
  owner: string;
  host: string;
  projects: CachedProject[];
};

function projectNavigation(project: CachedProject, locale: CachedDocumentationLocale): NavItem[] {
  const root = locale.navigation.length === 1 ? locale.navigation[0] : null;
  const items = root?.type === "section" && root.title.toLowerCase() === project.name.toLowerCase()
    ? root.children
    : locale.navigation;
  return items.filter((item) => item.type !== "page" || item.path !== locale.defaultPage);
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base", numeric: true });
}

function repositoryOwner(project: CachedProject): string {
  if (project.repositoryOwner) return project.repositoryOwner;
  const parts = new URL(project.repositoryUrl).pathname.split("/").filter(Boolean);
  return parts[0] ?? "Unknown owner";
}

function groupProjects(projects: CachedProject[]): GroupedProject[] {
  const groups = new Map<string, GroupedProject>();

  for (const project of projects) {
    const owner = repositoryOwner(project);
    const host = project.repositoryHost.toLowerCase();
    const ownerKey = owner.toLowerCase();
    const key = `${host}/${ownerKey}`;
    const group = groups.get(key);
    if (group) {
      group.projects.push(project);
    } else {
      groups.set(key, { key, owner, host, projects: [project] });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      projects: [...group.projects].sort((left, right) => compare(left.name, right.name) || compare(left.slug, right.slug)),
    }))
    .sort((left, right) => compare(left.owner, right.owner) || compare(left.host, right.host));
}

function ownerLabels(groups: GroupedProject[]): Map<string, string> {
  const hostsByOwner = new Map<string, Set<string>>();
  for (const group of groups) {
    const hosts = hostsByOwner.get(group.owner.toLowerCase()) ?? new Set<string>();
    hosts.add(group.host);
    hostsByOwner.set(group.owner.toLowerCase(), hosts);
  }

  return new Map(groups.map((group) => [
    group.key,
    (hostsByOwner.get(group.owner.toLowerCase())?.size ?? 0) > 1
      ? `${group.owner} · ${group.host}`
      : group.owner,
  ]));
}

export function GroupedProjectList({
  projects,
  ariaLabel,
  currentProject,
  currentVersion,
  currentLocale,
  currentPath,
}: {
  projects: CachedProject[];
  ariaLabel: string;
  currentProject?: CachedProject;
  currentVersion?: CachedDocumentationVersion;
  currentLocale?: CachedDocumentationLocale;
  currentPath?: string;
}) {
  const groups = groupProjects(projects);
  const labels = ownerLabels(groups);

  return (
    <nav className="grouped-project-list" aria-label={ariaLabel}>
      {groups.map((group) => (
        <section className="repository-owner-group" key={group.key}>
          <h2 className="repository-owner-heading">{labels.get(group.key)}</h2>
          <div className="repository-owner-projects">
            {group.projects.map((listedProject) => {
              const isCurrent = listedProject.slug === currentProject?.slug;
              const context = isCurrent && currentVersion && currentLocale
                ? { version: currentVersion, locale: currentLocale }
                : defaultDocumentationContext(listedProject);
              const navigation = projectNavigation(listedProject, context.locale);
              const href = projectPageHref(listedProject, context.locale.defaultPage, context.version.id, context.locale.code);

              if (navigation.length === 0) {
                return (
                  <a
                    className={isCurrent ? "project-tree-link active" : "project-tree-link"}
                    href={href}
                    key={listedProject.slug}
                  >
                    {listedProject.name}
                  </a>
                );
              }

              return (
                <ProjectTree
                  name={listedProject.name}
                  href={href}
                  navigation={navigation}
                  basePath={projectDocumentationBasePath(listedProject, context.version.id, context.locale.code)}
                  currentPath={isCurrent ? currentPath ?? "" : "__closed__"}
                  isCurrent={isCurrent}
                  key={listedProject.slug}
                />
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
