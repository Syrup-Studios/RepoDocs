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

export function repositoryFileHref(repositoryUrl: string, revision: string, sourcePath: string): string {
  const repository = repositoryBase(repositoryUrl);
  const host = new URL(repository).hostname;
  const filePath = encodedFilePath(sourcePath);
  if (host === "gitlab.com") return `${repository}/-/blob/${revision}/${filePath}`;
  if (host === "codeberg.org") return `${repository}/src/commit/${revision}/${filePath}`;
  if (host === "bitbucket.org") return `${repository}/src/${revision}/${filePath}`;
  return `${repository}/blob/${revision}/${filePath}`;
}
