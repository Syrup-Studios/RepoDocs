import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import { parse as parseYaml } from "yaml";
import { createMarkdown, prepareMarkdown, slugifyHeading, type Heading } from "@/lib/markdown";
import type { CachedPage, CachedProject, NavItem } from "@/lib/types";
import { readRepositoryFileHistory, type RepositoryDetails } from "@/lib/repository";
import { projectBasePath } from "@/lib/routes";

type ProjectClassification = {
  documentationType: string | null;
  category: string | null;
  useReadmeFrontPage: boolean;
};

export class MissingDocumentationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingDocumentationError";
  }
}

async function readProjectClassification(
  docsDirectory: string,
  defaults: ProjectClassification,
): Promise<ProjectClassification> {
  const configurationFile = path.join(docsDirectory, "repodocs.yml");
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(configurationFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaults;
    }
    throw new Error("RepoDocs could not read docs/repodocs.yml.", { cause: error });
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("docs/repodocs.yml must be a regular file.");
  }

  const parsed = parseYaml(await readFile(configurationFile, "utf8")) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("docs/repodocs.yml must contain a YAML object.");
  }
  if (typeof parsed.type !== "string" || typeof parsed.category !== "string") {
    throw new Error("docs/repodocs.yml must define string values for type and category.");
  }
  if (parsed.rootREADME !== undefined && typeof parsed.rootREADME !== "boolean") {
    throw new Error("rootREADME in docs/repodocs.yml must be true or false.");
  }

  const documentationType = parsed.type.trim().toLowerCase();
  const category = parsed.category.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(documentationType) || !/^[a-z0-9][a-z0-9-]*$/.test(category)) {
    throw new Error("The type and category in docs/repodocs.yml must use lowercase letters, numbers, or hyphens.");
  }
  if (documentationType === "minecraft" && category !== "mod" && category !== "modpack") {
    throw new Error('Minecraft documentation must use category: "mod" or category: "modpack".');
  }
  return {
    documentationType,
    category,
    useReadmeFrontPage: parsed.rootREADME === undefined
      ? defaults.useReadmeFrontPage
      : parsed.rootREADME,
  };
}

function pagePathFromFile(relativeFile: string): string {
  const withoutExtension = relativeFile.replace(/\.md$/i, "");
  const basename = path.posix.basename(withoutExtension).toLowerCase();
  if (basename === "index" || basename === "readme") {
    const directory = path.posix.dirname(withoutExtension);
    return directory === "." ? "" : directory;
  }
  return withoutExtension;
}

function contentRoot(files: string[]): string {
  if (files.some((file) => /^(?:index|readme)\.md$/i.test(file))) return "";
  const firstSegments = new Set(files.map((file) => file.split("/")[0]));
  if (firstSegments.size !== 1) return "";
  const [directory] = firstSegments;
  return files.some((file) => new RegExp(`^${directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(?:index|readme)\\.md$`, "i").test(file))
    ? directory
    : "";
}

function publicPagePath(relativeFile: string, root: string): string {
  const pagePath = pagePathFromFile(relativeFile);
  if (!root) return pagePath;
  if (pagePath === root) return "";
  return pagePath.startsWith(`${root}/`) ? pagePath.slice(root.length + 1) : pagePath;
}

function pageTitle(markdownSource: string, relativeFile: string): string {
  const heading = markdownSource.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.replace(/[`*_]/g, "");
  const basename = path.basename(relativeFile, ".md");
  return basename
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pageDescription(source: string): string {
  return source
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#{1,6}\s+.+$/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function configureMarkdown(
  markdown: InstanceType<typeof MarkdownIt>,
  currentFile: string,
  projectSlug: string,
  routeBase: string,
  pagePaths: Map<string, string>,
  headings: Heading[],
): void {
  const usedHeadings = new Map<string, number>();
  markdown.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
    const next = tokens[index + 1];
    const text = next?.content ?? "Section";
    const id = slugifyHeading(text, usedHeadings);
    tokens[index].attrSet("id", id);
    headings.push({ id, text, level: Number(tokens[index].tag.slice(1)) });
    return renderer.renderToken(tokens, index, options);
  };

  markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const hrefIndex = token.attrIndex("href");
    if (hrefIndex >= 0) {
      const href = String(token.attrs![hrefIndex][1]);
      const [target, hash = ""] = href.split("#", 2);
      if (target && !/^[a-z][a-z\d+.-]*:/i.test(target) && !target.startsWith("/")) {
        const decoded = decodeURIComponent(target);
        const resolved = path.posix.normalize(
          path.posix.join(path.posix.dirname(currentFile), decoded),
        );
        const pagePath = pagePaths.get(resolved);
        if (pagePath !== undefined) {
          token.attrs![hrefIndex][1] = `${routeBase}${pagePath ? `/${pagePath}` : ""}/${hash ? `#${hash}` : ""}`;
        } else if (!resolved.startsWith("../")) {
          token.attrs![hrefIndex][1] = `/repository-assets/${projectSlug}/${resolved}${hash ? `#${hash}` : ""}`;
        }
      } else if (/^https?:\/\//i.test(href)) {
        token.attrSet("target", "_blank");
        token.attrSet("rel", "noreferrer noopener");
      }
    }
    return renderer.renderToken(tokens, index, options);
  };

  markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const sourceIndex = token.attrIndex("src");
    if (sourceIndex >= 0) {
      const source = String(token.attrs![sourceIndex][1]);
      if (!/^[a-z][a-z\d+.-]*:/i.test(source) && !source.startsWith("/")) {
        const resolved = path.posix.normalize(
          path.posix.join(path.posix.dirname(currentFile), decodeURIComponent(source)),
        );
        if (!resolved.startsWith("../")) {
          token.attrs![sourceIndex][1] = `/repository-assets/${projectSlug}/${resolved}`;
        }
      }
    }
    return renderer.renderToken(tokens, index, options);
  };
}

async function findMarkdownFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) results.push(...(await findMarkdownFiles(directory, relative)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) results.push(relative);
  }
  return results;
}

type NavigationContext = {
  docsDirectory: string;
  files: string[];
  validFiles: Set<string>;
  titles: Map<string, string>;
  routePaths: Map<string, string>;
};

function cleanNavigationTitle(title: string): string {
  return title.replace(/<[^>]*>/g, "").trim();
}

function navigationLabel(name: string): string {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveNavigationTarget(
  target: string,
  directory: string,
  context: NavigationContext,
): { type: "file"; path: string } | { type: "directory"; path: string } | null {
  const resolved = path.posix.normalize(path.posix.join(directory, target));
  if (resolved === ".." || resolved.startsWith("../")) return null;
  if (context.validFiles.has(resolved)) return { type: "file", path: resolved };
  if (!resolved.toLowerCase().endsWith(".md") && context.validFiles.has(`${resolved}.md`)) {
    return { type: "file", path: `${resolved}.md` };
  }
  const prefix = resolved ? `${resolved}/` : "";
  if (context.files.some((file) => file.startsWith(prefix))) {
    return { type: "directory", path: resolved };
  }
  return null;
}

function directNavigationTargets(directory: string, context: NavigationContext): string[] {
  const prefix = directory ? `${directory}/` : "";
  const targets = new Set<string>();
  for (const file of context.files) {
    if (!file.startsWith(prefix)) continue;
    const remainder = file.slice(prefix.length);
    const [first, ...rest] = remainder.split("/");
    targets.add(rest.length ? first : remainder);
  }
  return [...targets].sort((a, b) => {
    const aHome = /^(readme|index)\.md$/i.test(a);
    const bHome = /^(readme|index)\.md$/i.test(b);
    if (aHome !== bHome) return aHome ? -1 : 1;
    return a.localeCompare(b);
  });
}

async function navigationItemForTarget(
  target: string,
  directory: string,
  context: NavigationContext,
  customTitle?: string,
): Promise<NavItem> {
  const resolved = resolveNavigationTarget(target, directory, context);
  if (!resolved) {
    const location = directory ? `${directory}/${target}` : target;
    throw new Error(`Navigation refers to a missing page or folder: ${location}`);
  }
  if (resolved.type === "file") {
    return {
      type: "page",
      title: cleanNavigationTitle(customTitle ?? context.titles.get(resolved.path) ?? pageTitle("", resolved.path)),
      path: context.routePaths.get(resolved.path) ?? pagePathFromFile(resolved.path),
    };
  }
  const children = await navigationForDirectory(resolved.path, context);
  const indexPage = children[0]?.type === "page" ? children[0] : null;
  return {
    type: "section",
    title: cleanNavigationTitle(customTitle ?? indexPage?.title ?? navigationLabel(path.posix.basename(resolved.path))),
    children,
  };
}

function explicitlyNamedTargets(
  value: unknown[],
  directory: string,
  context: NavigationContext,
): Set<string> {
  const targets = new Set<string>();
  for (const entry of value) {
    let target: unknown = entry;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const pairs = Object.entries(entry);
      if (pairs.length === 1) target = pairs[0][1];
    }
    if (typeof target !== "string" || target === "*") continue;
    const resolved = resolveNavigationTarget(target, directory, context);
    if (!resolved) continue;
    const prefix = directory ? `${directory}/` : "";
    targets.add(resolved.path.slice(prefix.length).split("/")[0]);
  }
  return targets;
}

async function parseNavEntry(
  value: unknown,
  directory: string,
  context: NavigationContext,
): Promise<NavItem[]> {
  if (!Array.isArray(value)) throw new Error("The nav value in .nav.yml must be a list.");
  const items: NavItem[] = [];
  const explicitTargets = explicitlyNamedTargets(value, directory, context);
  for (const entry of value) {
    if (entry === "*") {
      for (const target of directNavigationTargets(directory, context)) {
        if (!explicitTargets.has(target)) {
          items.push(await navigationItemForTarget(target, directory, context));
        }
      }
      continue;
    }
    if (typeof entry === "string") {
      items.push(await navigationItemForTarget(entry, directory, context));
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Each navigation item must be a page or named section.");
    }
    const pairs = Object.entries(entry);
    if (pairs.length !== 1) throw new Error("Each navigation item must have one title.");
    const [rawTitle, target] = pairs[0];
    const title = cleanNavigationTitle(rawTitle);
    if (typeof target === "string") {
      items.push(await navigationItemForTarget(target, directory, context, title));
    } else {
      items.push({
        type: "section",
        title,
        children: await parseNavEntry(target, directory, context),
      });
    }
  }
  return items;
}

async function navigationForDirectory(
  directory: string,
  context: NavigationContext,
): Promise<NavItem[]> {
  const navigationFile = path.join(context.docsDirectory, directory, ".nav.yml");
  try {
    const stats = await lstat(navigationFile);
    if (stats.isFile() && !stats.isSymbolicLink()) {
      const parsed = parseYaml(await readFile(navigationFile, "utf8")) as { nav?: unknown };
      return parseNavEntry(parsed?.nav, directory, context);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const items: NavItem[] = [];
  for (const target of directNavigationTargets(directory, context)) {
    items.push(await navigationItemForTarget(target, directory, context));
  }
  return items;
}

function firstPage(items: NavItem[]): string | null {
  for (const item of items) {
    if (item.type === "page") return item.path;
    const nested = firstPage(item.children);
    if (nested !== null) return nested;
  }
  return null;
}

export async function buildDocumentation(
  repository: RepositoryDetails,
  repositoryDirectory: string,
  revision: string,
  displayName = repository.repository,
  defaultClassification: ProjectClassification = {
    documentationType: null,
    category: null,
    useReadmeFrontPage: false,
  },
): Promise<CachedProject> {
  const docsDirectory = path.join(repositoryDirectory, "docs");
  let docsStats: Awaited<ReturnType<typeof lstat>>;
  try {
    docsStats = await lstat(docsDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new MissingDocumentationError("This repository does not have a root docs/ directory.");
    }
    throw error;
  }
  if (!docsStats.isDirectory() || docsStats.isSymbolicLink()) {
    throw new MissingDocumentationError("This repository does not have a valid root docs/ directory.");
  }

  const files = await findMarkdownFiles(docsDirectory);
  if (!files.length) {
    throw new MissingDocumentationError("The docs/ directory does not contain Markdown files.");
  }
  const projectConfiguration = await readProjectClassification(docsDirectory, defaultClassification);
  const { useReadmeFrontPage, ...classification } = projectConfiguration;
  const root = contentRoot(files);
  const routeBase = projectBasePath({ slug: repository.slug, ...classification });

  const pagePaths = new Map<string, string>();
  const routePaths = new Map<string, string>();
  for (const file of files) {
    const pagePath = publicPagePath(file, root);
    routePaths.set(file, pagePath);
    pagePaths.set(file, pagePath);
    pagePaths.set(file.replace(/\.md$/i, ""), pagePath);
    if (/\/(?:index|readme)\.md$/i.test(file)) {
      pagePaths.set(file.replace(/\/(?:index|readme)\.md$/i, ""), pagePath);
    } else if (/^(?:index|readme)\.md$/i.test(file)) {
      pagePaths.set("", pagePath);
    }
  }
  const titles = new Map<string, string>();
  const pages: Record<string, CachedPage> = {};
  const markdown = createMarkdown((code, language): string => {
    if (language && hljs.getLanguage(language)) {
      return `<pre><code class="hljs language-${language}">${hljs.highlight(code, { language }).value}</code></pre>`;
    }
    return `<pre><code class="hljs">${code
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")}</code></pre>`;
  });
  for (const file of files) {
    const source = await readFile(path.join(docsDirectory, file), "utf8");
    const history = await readRepositoryFileHistory(repositoryDirectory, path.posix.join("docs", file));
    const preparedSource = prepareMarkdown(source);
    const title = pageTitle(source, file);
    const headings: Heading[] = [];
    configureMarkdown(markdown, file, repository.slug, routeBase, pagePaths, headings);
    const pagePath = routePaths.get(file)!;
    titles.set(file, title);
    pages[pagePath] = {
      path: pagePath,
      sourcePath: path.posix.join("docs", file),
      title,
      description: pageDescription(preparedSource),
      html: markdown.render(preparedSource),
      headings: headings.filter((heading) => heading.level === 2 || heading.level === 3),
      history,
    };
  }

  if (useReadmeFrontPage) {
    const readmeFile = path.join(repositoryDirectory, "README.md");
    let readmeStats: Awaited<ReturnType<typeof lstat>>;
    try {
      readmeStats = await lstat(readmeFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error("rootREADME is enabled, but the repository does not have a root README.md file.", { cause: error });
      }
      throw error;
    }
    if (!readmeStats.isFile() || readmeStats.isSymbolicLink()) {
      throw new Error("rootREADME requires a regular root README.md file.");
    }

    const source = await readFile(readmeFile, "utf8");
    const history = await readRepositoryFileHistory(repositoryDirectory, "README.md");
    const preparedSource = prepareMarkdown(source);
    const headings: Heading[] = [];
    const rootPagePaths = new Map(pagePaths);
    for (const [file, pagePath] of pagePaths) rootPagePaths.set(path.posix.join("docs", file), pagePath);
    configureMarkdown(markdown, "README.md", repository.slug, routeBase, rootPagePaths, headings);
    pages[""] = {
      path: "",
      sourcePath: "README.md",
      title: pageTitle(source, "README.md"),
      description: pageDescription(preparedSource),
      html: markdown.render(preparedSource),
      headings: headings.filter((heading) => heading.level === 2 || heading.level === 3),
      history,
    };
  }

  let navigation: NavItem[];
  const candidates = [
    path.join(repositoryDirectory, ".nav.yml"),
    path.join(docsDirectory, ".nav.yml"),
  ];
  let navFile: string | null = null;
  for (const candidate of candidates) {
    try {
      const candidateStats = await lstat(candidate);
      if (candidateStats.isFile() && !candidateStats.isSymbolicLink()) {
        navFile = candidate;
        break;
      }
    } catch {
      continue;
    }
  }

  if (navFile) {
    const parsed = parseYaml(
      await readFile(navFile, "utf8"),
    ) as { nav?: unknown };
    navigation = await parseNavEntry(parsed?.nav, "", {
      docsDirectory,
      files,
      validFiles: new Set(files),
      titles,
      routePaths,
    });
  } else {
    navigation = await navigationForDirectory("", {
      docsDirectory,
      files,
      validFiles: new Set(files),
      titles,
      routePaths,
    });
  }

  const defaultPage = pages[""] ? "" : firstPage(navigation);
  if (defaultPage === null) throw new Error("The navigation does not contain a page.");

  return {
    slug: repository.slug,
    name: displayName,
    repositoryUrl: repository.normalizedUrl.replace(/\.git$/, ""),
    repositoryHost: repository.host,
    ...classification,
    defaultPage,
    navigation,
    pages,
    sourceRevision: revision,
    builtAt: new Date().toISOString(),
  };
}
