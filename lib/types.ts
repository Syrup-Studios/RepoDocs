export type NavItem =
  | { type: "page"; title: string; path: string }
  | { type: "section"; title: string; children: NavItem[] };

export type CachedPage = {
  path: string;
  sourcePath: string;
  title: string;
  description: string;
  html: string;
  headings: Array<{ id: string; text: string; level: number }>;
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
  projects: CachedProject[];
};
