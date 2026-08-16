export type NavItem =
  | { type: "page"; title: string; path: string }
  | { type: "section"; title: string; children: NavItem[] };

export type RepositoryFooterLink = {
  label: string;
  url: string;
};

export type ProjectPlatforms = {
  modrinth?: string;
  curseforge?: string;
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
  favicon: string | null;
  repositoryUrl: string;
  repositoryHost: string;
  documentationType: string | null;
  category: string | null;
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
