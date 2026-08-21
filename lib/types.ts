export type NavItem =
  | { type: "page"; title: string; path: string }
  | { type: "section"; title: string; children: NavItem[] };

export type RepositoryFooterLink = {
  label: string;
  url: string;
};

export type ProjectPlatformReference = {
  id: string;
};

export type ProjectPlatformName = "modrinth" | "curseforge";

export type ProjectPlatforms = {
  primary?: ProjectPlatformName;
  modrinth?: ProjectPlatformReference;
  curseforge?: ProjectPlatformReference;
};

export type ProjectLicense = {
  id?: string;
  name?: string;
  url?: string;
  source: "metadata" | "repository" | "platform";
  sourcePath?: string;
};

export type ProjectLicenses = {
  project?: ProjectLicense;
  documentation?: ProjectLicense;
};

export type DocumentHistory = {
  createdAt: string;
  updatedAt: string;
  updatedRevision: string;
  authors: string[];
};

export type RenderedDocumentation = {
  html: string;
  headings: Array<{ id: string; text: string; level: number }>;
  history: DocumentHistory;
};

export type CachedPage = RenderedDocumentation & {
  path: string;
  sourcePath: string;
  title: string;
  description: string;
};

export type CachedDocumentationLocale = {
  code: string;
  label: string;
  defaultPage: string;
  navigation: NavItem[];
  pages: Record<string, CachedPage>;
};

export type CachedDocumentationVersion = {
  id: string;
  label: string;
  branch: string;
  sourceRevision: string;
  builtAt: string;
  locales: Record<string, CachedDocumentationLocale>;
};

export type CachedProject = {
  slug: string;
  name: string;
  summary: string | null;
  favicon: string | null;
  repositoryUrl: string;
  repositoryHost: string;
  repositoryOwner: string;
  documentationType: string | null;
  category: string | null;
  modId: string | null;
  owners: string[];
  gameVersions: string[];
  loaders: string[];
  tags: string[];
  licenses: ProjectLicenses;
  platforms: ProjectPlatforms;
  footerLinks: RepositoryFooterLink[];
  defaultVersion: string;
  defaultLocale: string;
  versions: Record<string, CachedDocumentationVersion>;
};

export type GeneratedDocumentation = {
  generatedAt: string;
  siteDocumentation: CachedProject;
  projects: CachedProject[];
};
