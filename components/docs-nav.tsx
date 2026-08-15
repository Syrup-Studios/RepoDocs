import { ChevronRight } from "lucide-react";
import type { NavItem } from "@/lib/types";

function pageHref(basePath: string, path: string): string {
  return `${basePath}${path ? `/${path}` : ""}/`;
}

function containsPage(item: NavItem, currentPath: string): boolean {
  if (item.type === "page") return item.path === currentPath;
  return item.children.some((child) => containsPage(child, currentPath));
}

export function DocsNav({ items, basePath, currentPath }: { items: NavItem[]; basePath: string; currentPath: string }) {
  return (
    <nav className="docs-nav" aria-label="Documentation pages">
      {items.map((item, index) => {
        if (item.type === "page") {
          return (
            <a className={currentPath === item.path ? "active" : ""} href={pageHref(basePath, item.path)} key={`${item.path}-${index}`}>
              {item.title}
            </a>
          );
        }

        const indexPage = item.children[0]?.type === "page" ? item.children[0] : null;
        const children = indexPage ? item.children.slice(1) : item.children;
        const expanded = containsPage(item, currentPath);
        const title = indexPage ? (
          <a
            className={`nav-section-title ${currentPath === indexPage.path ? "active" : ""}`}
            href={pageHref(basePath, indexPage.path)}
          >
            {item.title}
          </a>
        ) : (
          <span className="nav-section-title">{item.title}</span>
        );

        if (children.length > 0) {
          return (
            <details className="nav-section" key={`${item.title}-${index}`} open={expanded || undefined}>
              <summary>
                {title}
                <ChevronRight className="nav-section-chevron" size={14} aria-hidden="true" />
              </summary>
              <DocsNav items={children} basePath={basePath} currentPath={currentPath} />
            </details>
          );
        }

        return (
          <div className="nav-section" key={`${item.title}-${index}`}>
            {title}
          </div>
        );
      })}
    </nav>
  );
}
