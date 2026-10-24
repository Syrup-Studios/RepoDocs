import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource/nunito/latin-400.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "highlight.js/styles/github-dark.css";
import "@/app/globals.css";
import { App, pageMetadata, resolvePage } from "@/src/app";
import { fetchProjectData, projectSlugFromPathname } from "@/lib/project-index";
import type { CachedProject, GeneratedDocumentationIndex } from "@/lib/types";

const root = document.getElementById("root");
if (!root) throw new Error("RepoDocs root element is missing.");
const applicationRoot: HTMLElement = root;

type ClientLocation = {
  pathname: string;
  search: string;
  hash: string;
};

function currentLocation(): ClientLocation {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
}

function scrollToLocation(hash: string): void {
  if (!hash) {
    window.scrollTo({ top: 0, left: 0 });
    return;
  }

  let targetId = hash.slice(1);
  try {
    targetId = decodeURIComponent(targetId);
  } catch {
    // Use the original fragment when it contains invalid percent encoding.
  }
  document.getElementById(targetId)?.scrollIntoView();
}

function updateFavicon(href: string | null): void {
  const existing = document.querySelector<HTMLLinkElement>("link[data-repodocs-favicon]");
  if (!href) {
    existing?.remove();
    return;
  }

  const favicon = existing ?? document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/png";
  favicon.href = href;
  favicon.dataset.repodocsFavicon = "";
  if (!existing) document.head.append(favicon);
}

function ClientApplication({ documentation, initialProjects }: { documentation: GeneratedDocumentationIndex; initialProjects: Record<string, CachedProject> }) {
  const [location, setLocation] = useState(currentLocation);
  const [loadedProjects, setLoadedProjects] = useState(initialProjects);
  const loadedProjectsRef = useRef(initialProjects);
  const initialRender = useRef(true);

  const ensureProject = async (pathname: string): Promise<void> => {
    const slug = projectSlugFromPathname(pathname);
    if (!slug || loadedProjectsRef.current[slug]) return;
    const project = await fetchProjectData(slug);
    loadedProjectsRef.current = { ...loadedProjectsRef.current, [slug]: project };
    setLoadedProjects(loadedProjectsRef.current);
  };

  useEffect(() => {
    const handleNavigation = () => {
      const next = currentLocation();
      void ensureProject(next.pathname).then(() => setLocation(next)).catch(() => window.location.reload());
    };
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;

      const anchor = event.target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;

      event.preventDefault();
      void ensureProject(destination.pathname).then(() => {
        window.history.pushState(null, "", destination);
        setLocation(currentLocation());
      }).catch(() => window.location.assign(destination.href));
    };

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.addEventListener("popstate", handleNavigation);
    document.addEventListener("click", handleClick);
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener("popstate", handleNavigation);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  useEffect(() => {
    const projectSlug = projectSlugFromPathname(location.pathname);
    const projectData = projectSlug ? loadedProjects[projectSlug] : undefined;
    const resolved = resolvePage(location.pathname, documentation, projectData);
    if (resolved.type === "documentation" && resolved.redirectHref) {
      const destination = new URL(resolved.redirectHref, window.location.origin);
      destination.search = location.search;
      destination.hash = location.hash;
      window.history.replaceState(null, "", destination);
      setLocation(currentLocation());
      return;
    }

    const metadata = pageMetadata(location.pathname, documentation, projectData);
    document.title = metadata.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", metadata.description);
    updateFavicon(metadata.favicon);

    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    window.requestAnimationFrame(() => scrollToLocation(location.hash));
  }, [location, documentation, loadedProjects]);

  const projectSlug = projectSlugFromPathname(location.pathname);
  return <App pathname={location.pathname} search={location.search} documentation={documentation} projectData={projectSlug ? loadedProjects[projectSlug] : undefined} />;
}

async function start(): Promise<void> {
  const indexResponse = await fetch("/_data/index.json");
  if (!indexResponse.ok) throw new Error("RepoDocs index data is missing.");
  const documentation = await indexResponse.json() as GeneratedDocumentationIndex;
  const initialProjects: Record<string, CachedProject> = {};
  const slug = projectSlugFromPathname(window.location.pathname);
  if (slug) initialProjects[slug] = await fetchProjectData(slug);
  const application = <StrictMode><ClientApplication documentation={documentation} initialProjects={initialProjects} /></StrictMode>;
  const hasRenderedContent = applicationRoot.children.length > 0 || Boolean(applicationRoot.textContent?.trim());
  if (hasRenderedContent) hydrateRoot(applicationRoot, application);
  else createRoot(applicationRoot).render(application);
}

void start().catch((error: unknown) => console.error(error));
