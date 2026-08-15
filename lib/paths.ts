import path from "node:path";

export function cacheDirectory(): string {
  const configured = process.env.REPODOCS_CACHE_DIR;
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), ".repodocs-cache");
}

export function repositoriesDirectory(): string {
  return path.join(cacheDirectory(), "repositories");
}
