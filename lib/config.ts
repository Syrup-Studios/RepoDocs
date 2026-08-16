import type { ProjectLicenses, ProjectPlatforms, RepositoryFooterLink } from "@/lib/types";

export type RepositorySource = {
  /** Name shown on the project index and documentation pages. */
  name: string;
  /** Short project description used outside documentation pages. */
  summary: string | null;
  /** Stable URL segment. Use lowercase letters, numbers, and hyphens. */
  slug: string;
  /** Public HTTPS Git repository URL. */
  repository: string;
  /** Default documentation type when the source repository does not set one. */
  documentationType: string | null;
  /** Default documentation category when the source repository does not set one. */
  category: string | null;
  /** Minecraft mod ID used by the project. */
  modId: string | null;
  /** GitHub users or organizations that own the project. */
  owners: string[];
  /** Supported game versions, newest first. */
  gameVersions: string[];
  /** Supported mod loaders or runtimes. */
  loaders: string[];
  /** Searchable project labels. */
  tags: string[];
  /** Licenses for the project and its documentation. */
  licenses: ProjectLicenses;
  /** Whether the root README is the default documentation page. */
  useReadmeFrontPage: boolean;
  /** Links shown in the footer of every documentation page. */
  footerLinks: RepositoryFooterLink[];
  /** Project references on supported distribution platforms. */
  platforms: ProjectPlatforms;
  /** Extra documentation versions mapped to Git branch names. */
  versions: Record<string, string>;
  /** Locale used by Markdown files directly inside docs/. */
  defaultLocale: string;
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
