import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource/nunito/latin-400.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "highlight.js/styles/github-dark.css";
import "@/app/globals.css";
import { App, pageMetadata } from "@/src/app";
import { withoutBasePath } from "@/lib/base-path";

const root = document.getElementById("root");
if (!root) throw new Error("RepoDocs root element is missing.");

type ClientLocation = {
  pathname: string;
  search: string;
  hash: string;
};

function currentLocation(): ClientLocation {
  return {
    pathname: withoutBasePath(window.location.pathname),
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

function ClientApplication() {
  const [location, setLocation] = useState(currentLocation);
  const initialRender = useRef(true);

  useEffect(() => {
    const handleNavigation = () => setLocation(currentLocation());
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
      window.history.pushState(null, "", destination);
      setLocation(currentLocation());
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
    const metadata = pageMetadata(location.pathname);
    document.title = metadata.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", metadata.description);

    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    window.requestAnimationFrame(() => scrollToLocation(location.hash));
  }, [location]);

  return <App pathname={location.pathname} />;
}

const application = <StrictMode><ClientApplication /></StrictMode>;
const hasRenderedContent = root.children.length > 0 || Boolean(root.textContent?.trim());
if (hasRenderedContent) hydrateRoot(root, application);
else createRoot(root).render(application);
