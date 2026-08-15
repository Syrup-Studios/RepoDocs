/// <reference types="vite/client" />

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

export function siteBasePath(): string {
  return normalizeBasePath(import.meta.env.BASE_URL ?? process.env.REPODOCS_BASE_PATH);
}

export function withBasePath(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const basePath = siteBasePath();
  return basePath === "/" ? href : `${basePath.slice(0, -1)}${href}`;
}

export function withoutBasePath(pathname: string): string {
  const basePath = siteBasePath();
  if (basePath === "/") return pathname;

  const baseWithoutTrailingSlash = basePath.slice(0, -1);
  if (pathname === baseWithoutTrailingSlash) return "/";
  if (pathname.startsWith(basePath)) return `/${pathname.slice(basePath.length)}`;
  return pathname;
}
