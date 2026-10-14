import type { CachedProject, RepositoryFooterLink } from "@/lib/types";

function repositoryBase(repositoryUrl: string): string {
  return repositoryUrl.replace(/\/+$/, "");
}

export function projectFooterLinks(project: CachedProject): RepositoryFooterLink[] {
  const customLinks = project.footerLinks;
  const customByHref = new Map(customLinks.map((link) => [link.url.replace(/\/+$/, ""), link]));
  const links: RepositoryFooterLink[] = [];
  const seen = new Set<string>();
  const add = (label: string, url: string) => {
    const key = url.replace(/\/+$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    links.push(customByHref.get(key) ?? { label, url });
  };
  const category = project.documentationType === "minecraft" ? project.category : null;
  const platformNames = project.platforms.primary
    ? [project.platforms.primary, project.platforms.primary === "modrinth" ? "curseforge" : "modrinth"] as const
    : ["modrinth", "curseforge"] as const;

  for (const platform of platformNames) {
    const id = project.platforms[platform]?.id;
    if (!id) continue;
    if (platform === "modrinth" && category === "mod") add("Modrinth", `https://modrinth.com/mod/${id}`);
    if (platform === "modrinth" && category === "modpack") add("Modrinth", `https://modrinth.com/modpack/${id}`);
    if (platform === "curseforge" && /^\d+$/.test(id)) {
      add("CurseForge", `https://www.curseforge.com/projects/${id}`);
    } else if (platform === "curseforge" && category === "mod") {
      add("CurseForge", `https://www.curseforge.com/minecraft/mc-mods/${id}`);
    } else if (platform === "curseforge" && category === "modpack") {
      add("CurseForge", `https://www.curseforge.com/minecraft/modpacks/${id}`);
    }
  }

  const host = new URL(project.repositoryUrl).hostname;
  const sourceLabel: Record<string, string> = {
    "github.com": "GitHub",
    "gitlab.com": "GitLab",
    "bitbucket.org": "Bitbucket",
    "codeberg.org": "Codeberg",
  };
  add(sourceLabel[host] ?? "Source", project.repositoryUrl);

  const license = project.licenses.project;
  if (license?.url) add(license.name ?? license.id ?? "License", license.url);
  for (const link of customLinks) add(link.label, link.url);

  return links;
}

function encodedFilePath(sourcePath: string): string {
  return sourcePath.split("/").map(encodeURIComponent).join("/");
}

export function repositoryCommitHref(repositoryUrl: string, revision: string): string {
  const repository = repositoryBase(repositoryUrl);
  const host = new URL(repository).hostname;
  if (host === "gitlab.com") return `${repository}/-/commit/${revision}`;
  if (host === "bitbucket.org") return `${repository}/commits/${revision}`;
  return `${repository}/commit/${revision}`;
}

export function repositoryFileHref(
  repositoryUrl: string,
  revision: string,
  sourcePath: string,
  referenceType: "branch" | "commit" = "commit",
): string {
  const repository = repositoryBase(repositoryUrl);
  const host = new URL(repository).hostname;
  const filePath = encodedFilePath(sourcePath);
  const reference = revision.split("/").map(encodeURIComponent).join("/");
  if (host === "gitlab.com") return `${repository}/-/blob/${reference}/${filePath}`;
  if (host === "codeberg.org") return `${repository}/src/${referenceType}/${reference}/${filePath}`;
  if (host === "bitbucket.org") return `${repository}/src/${reference}/${filePath}`;
  return `${repository}/blob/${reference}/${filePath}`;
}

export function repositoryIssuesHref(repositoryUrl: string): string {
  const repository = repositoryBase(repositoryUrl);
  return new URL(repository).hostname === "gitlab.com" ? `${repository}/-/issues` : `${repository}/issues`;
}
