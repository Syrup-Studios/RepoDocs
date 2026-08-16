import { useEffect, useId, useState, type ReactNode } from "react";
import { CalendarPlus, History, UserRound } from "lucide-react";
import type { RenderedDocumentation } from "@/lib/types";

function relativeDate(value: string, reference: string): string {
  const elapsedSeconds = (new Date(value).getTime() - new Date(reference).getTime()) / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60],
    ["month", 30 * 24 * 60 * 60],
    ["week", 7 * 24 * 60 * 60],
    ["day", 24 * 60 * 60],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  for (const [unit, seconds] of units) {
    if (Math.abs(elapsedSeconds) >= seconds) {
      return formatter.format(Math.round(elapsedSeconds / seconds), unit);
    }
  }
  return "just now";
}

function localDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function LocalDateTitle({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  const [title, setTitle] = useState(`${label} ${new Date(value).toISOString()}`);
  const tooltipId = useId();

  useEffect(() => {
    setTitle(`${label} ${localDate(value)}`);
  }, [label, value]);

  return (
    <span className="history-tooltip" aria-describedby={tooltipId} tabIndex={0}>
      {children}
      <span className="history-tooltip-content" id={tooltipId} role="tooltip">{title}</span>
    </span>
  );
}

export function DocumentationContent({
  page,
  referenceDate,
  sourcePath,
  commitRevision,
  sourceHref,
  commitHref,
}: {
  page: RenderedDocumentation;
  referenceDate: string;
  sourcePath: string;
  commitRevision: string;
  sourceHref: string;
  commitHref: string;
}) {
  return (
    <>
      <main className="docs-main">
        <article className="markdown-body">
          <div dangerouslySetInnerHTML={{ __html: page.html }} />
        </article>
        <footer className="page-footer">
          <div className="page-history" aria-label="Document history">
            <LocalDateTitle label="Last edited" value={page.history.updatedAt}>
              <History size={17} aria-hidden="true" />
              {relativeDate(page.history.updatedAt, referenceDate)}
            </LocalDateTitle>
            <LocalDateTitle label="Created" value={page.history.createdAt}>
              <CalendarPlus size={17} aria-hidden="true" />
              {relativeDate(page.history.createdAt, referenceDate)}
            </LocalDateTitle>
            <span title={`Authors: ${page.history.authors.join(", ")}`}>
              <UserRound size={17} aria-hidden="true" />
              {page.history.authors.join(", ")}
            </span>
          </div>
          <div className="page-source">
            <span>Source: <a href={sourceHref} target="_blank" rel="noreferrer"><code>{sourcePath}</code></a></span>
            <span>Commit <a href={commitHref} target="_blank" rel="noreferrer">{commitRevision.slice(0, 7)}</a></span>
          </div>
        </footer>
      </main>

      {page.headings.length > 0 && (
        <aside className="page-toc">
          <b>Table of contents</b>
          {page.headings.map((heading) => (
            <a className={heading.level === 3 ? "nested" : ""} href={`#${heading.id}`} key={heading.id}>{heading.text}</a>
          ))}
        </aside>
      )}
    </>
  );
}
