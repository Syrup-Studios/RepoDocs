export type NavItem =
  | { type: "page"; title: string; path: string }
  | { type: "section"; title: string; children: NavItem[] };

export type DocumentHistory = {
  createdAt: string;
  updatedAt: string;
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

export type CachedProject = {
  slug: string;
  name: string;
  repositoryUrl: string;
  repositoryHost: string;
  documentationType: string | null;
  category: string | null;
  defaultPage: string;
  navigation: NavItem[];
  pages: Record<string, CachedPage>;
  sourceRevision: string;
  builtAt: string;
};

export type GeneratedDocumentation = {
  generatedAt: string;
  siteDocumentation: RenderedDocumentation & {
    sourceRevision: string;
  };
  projects: CachedProject[];
};
