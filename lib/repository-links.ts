function repositoryBase(repositoryUrl: string): string {
  return repositoryUrl.replace(/\/+$/, "");
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
