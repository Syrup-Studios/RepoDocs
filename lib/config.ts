import type { RepositoryFooterLink } from "@/lib/types";

export type RepositorySource = {
  /** Name shown on the project index and documentation pages. */
  name: string;
  /** Stable URL segment. Use lowercase letters, numbers, and hyphens. */
  slug: string;
  /** Public HTTPS Git repository URL. */
  repository: string;
  /** Default documentation type when the source repository does not set one. */
  documentationType: string | null;
  /** Default documentation category when the source repository does not set one. */
  category: string | null;
  /** Whether the root README is the default documentation page. */
  useReadmeFrontPage: boolean;
  /** Links shown in the footer of every documentation page. */
  footerLinks: RepositoryFooterLink[];
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
