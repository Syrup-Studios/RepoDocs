import type {
  CachedDocumentationLocale,
  CachedDocumentationVersion,
  CachedProject,
} from "@/lib/types";

export type DocumentationContext = {
  version: CachedDocumentationVersion;
  locale: CachedDocumentationLocale;
};

export function defaultDocumentationContext(project: CachedProject): DocumentationContext {
  const version = project.versions[project.defaultVersion];
  if (!version) throw new Error(`Project "${project.slug}" has no default documentation version.`);

  const locale = version.locales[project.defaultLocale];
  if (!locale) throw new Error(`Project "${project.slug}" has no default documentation locale.`);

  return { version, locale };
}
