import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { projectPageHref } from "@/lib/routes";
import type { CachedPage, CachedProject } from "@/lib/types";

type SearchEntry = {
  project: CachedProject;
  page: CachedPage;
  href: string;
  text: string;
  title: string;
  projectName: string;
  body: string;
  locale: string;
  version: string;
};

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return text;
  const expression = new RegExp(`(${terms.map(escapeRegularExpression).join("|")})`, "gi");
  const normalizedTerms = new Set(terms.map(normalize));
  return <>{text.split(expression).map((part, index) =>
    normalizedTerms.has(normalize(part))
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : part,
  )}</>;
}

function resultExcerpt(entry: SearchEntry, terms: string[]): string {
  const description = entry.page.description;
  const source = description && terms.some((term) => normalize(description).includes(term))
    ? description
    : entry.body || description || "Documentation page";
  const normalizedSource = normalize(source);
  const positions = terms.map((term) => normalizedSource.indexOf(term)).filter((position) => position >= 0);
  if (positions.length === 0 || source.length <= 190) return source.slice(0, 190);

  const match = Math.min(...positions);
  let start = Math.max(0, match - 70);
  let end = Math.min(source.length, start + 190);
  if (start > 0) start = source.indexOf(" ", start) + 1 || start;
  if (end < source.length) {
    const wordEnd = source.lastIndexOf(" ", end);
    if (wordEnd > start) end = wordEnd;
  }
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

function searchScore(entry: SearchEntry, query: string, terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    if (entry.title === term) score += 120;
    else if (entry.title.startsWith(term)) score += 80;
    else if (entry.title.includes(term)) score += 55;
    else if (entry.projectName.includes(term)) score += 35;
    else if (entry.text.includes(term)) score += 8;
    else return -1;
  }
  if (entry.title.includes(query)) score += 70;
  if (entry.projectName.includes(query)) score += 30;
  return score;
}

function buildIndex(projects: CachedProject[]): SearchEntry[] {
  return projects.flatMap((project) => Object.values(project.versions).flatMap((version) =>
    Object.values(version.locales).flatMap((locale) => Object.values(locale.pages).map((page) => {
      const body = plainText(page.html);
      return {
        project,
        page,
        href: projectPageHref(project, page.path, version.id, locale.code),
        title: normalize(page.title),
        projectName: normalize(project.name),
        text: normalize(`${page.title} ${project.name} ${version.label} ${locale.label} ${page.description} ${body}`),
        body,
        locale: locale.label,
        version: version.label,
      };
    })),
  ));
}

export function DocumentationSearch({ projects }: { projects: CachedProject[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const index = useMemo(() => buildIndex(projects), [projects]);
  const normalizedQuery = normalize(query);
  const terms = useMemo(() => normalizedQuery.split(" ").filter(Boolean), [normalizedQuery]);
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return index
      .map((entry) => ({ entry, score: searchScore(entry, normalizedQuery, terms) }))
      .filter((result) => result.score >= 0)
      .sort((left, right) => right.score - left.score
        || left.entry.project.name.localeCompare(right.entry.project.name)
        || left.entry.page.title.localeCompare(right.entry.page.title))
      .slice(0, 20)
      .map((result) => result.entry);
  }, [index, normalizedQuery, terms]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      } else if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => input.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="docs-search"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <Search size={17} aria-hidden="true" />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>

      {isOpen && (
        <div className="search-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}>
          <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search documentation">
            <div className="search-input-row">
              <Search size={20} aria-hidden="true" />
              <input
                ref={input}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search documentation"
                aria-label="Search documentation"
              />
              <button type="button" className="search-close" onClick={() => setIsOpen(false)} aria-label="Close search">
                <X size={19} aria-hidden="true" />
              </button>
            </div>

            <div className="search-results" aria-live="polite">
              {!normalizedQuery && <p className="search-state">Search across {index.length} documentation pages.</p>}
              {normalizedQuery && results.length === 0 && <p className="search-state">No documentation matches “{query.trim()}”.</p>}
              {results.length > 0 && (
                <>
                  <p className="search-result-count">{results.length} result{results.length === 1 ? "" : "s"}</p>
                  <nav aria-label="Search results">
                    {results.map((entry) => (
                      <a href={entry.href} onClick={() => setIsOpen(false)} key={`${entry.project.slug}:${entry.version}:${entry.locale}:${entry.page.path}`}>
                        <small><HighlightedText text={`${entry.project.name} · ${entry.version} · ${entry.locale}`} terms={terms} /></small>
                        <strong><HighlightedText text={entry.page.title} terms={terms} /></strong>
                        <p><HighlightedText text={resultExcerpt(entry, terms)} terms={terms} /></p>
                      </a>
                    ))}
                  </nav>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
