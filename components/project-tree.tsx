import { useEffect, useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { DocsNav } from "@/components/docs-nav";
import type { NavItem } from "@/lib/types";

export function ProjectTree({
  name,
  href,
  navigation,
  basePath,
  currentPath,
  isCurrent = false,
}: {
  name: string;
  href: string;
  navigation: NavItem[];
  basePath: string;
  currentPath: string;
  isCurrent?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isCurrent);
  const navigationId = useId();

  useEffect(() => {
    if (isCurrent) setIsOpen(true);
  }, [isCurrent]);

  return (
    <div className={`project-tree${isCurrent ? " active" : ""}${isOpen ? " open" : ""}`}>
      <div className="project-tree-header">
        <a href={href}>{name}</a>
        <button
          className="project-tree-toggle"
          type="button"
          aria-controls={navigationId}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Close" : "Open"} ${name} pages`}
          onClick={() => setIsOpen((open) => !open)}
        >
          <ChevronRight className="project-tree-chevron" size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="project-tree-navigation" id={navigationId} hidden={!isOpen}>
        <DocsNav items={navigation} basePath={basePath} currentPath={currentPath} />
      </div>
    </div>
  );
}
