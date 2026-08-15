export type RepositorySource = {
  /** Name shown on the project index and documentation pages. */
  name: string;
  /** Stable URL segment. Use lowercase letters, numbers, and hyphens. */
  slug: string;
  /** Public HTTPS Git repository URL. */
  repository: string;
};

export type RepositoryConfig = RepositorySource;

export type RepoDocsConfig = {
  site: {
    name: string;
    description: string;
    repository: string;
  };
};

export type SiteConfig = RepoDocsConfig["site"];
