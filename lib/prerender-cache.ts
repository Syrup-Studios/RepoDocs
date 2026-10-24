import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type CacheEntry = { key: string; bodyHash: string };
export type PrerenderCacheManifest = { version: 1; routes: Record<string, CacheEntry> };

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validHtml(body: string): boolean {
  const source = body.trim();
  if (!source.startsWith("<") || !source.endsWith(">") || source.includes("\0")) return false;
  const voidElements = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const stack: string[] = [];
  for (const match of source.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z][a-z0-9:-]*)\b[^>]*?>/gi)) {
    const token = match[0];
    const tag = match[1]?.toLowerCase();
    if (!tag) continue;
    if (token.startsWith("</")) {
      if (stack.pop() !== tag) return false;
    } else if (!voidElements.has(tag) && !token.endsWith("/>")) {
      stack.push(tag);
    }
  }
  return stack.length === 0;
}

export function cacheKey(value: unknown): string {
  return digest(JSON.stringify(value));
}

export function isPrerenderTemplate(template: string): boolean {
  return [
    "<!--repodocs-title-->",
    "<!--repodocs-description-->",
    "<!--repodocs-favicon-->",
    "<!--repodocs-content-->",
  ].every((placeholder) => template.includes(placeholder));
}

export function selectPrerenderTemplate(current: string, cached: string | null): string {
  if (isPrerenderTemplate(current)) return current;
  if (cached !== null && isPrerenderTemplate(cached)) return cached;
  throw new Error("Prerender template placeholders are missing; run the Vite build before prerendering.");
}

export async function readPrerenderManifest(directory: string): Promise<PrerenderCacheManifest> {
  try {
    const value = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as PrerenderCacheManifest;
    if (!value || value.version !== 1 || !value.routes || typeof value.routes !== "object") {
      return { version: 1, routes: {} };
    }
    return {
      version: 1,
      routes: Object.fromEntries(Object.entries(value.routes).filter(([, entry]) =>
        Boolean(entry)
        && /^[a-f0-9]{64}$/.test(entry.key)
        && /^[a-f0-9]{64}$/.test(entry.bodyHash),
      )),
    };
  } catch {
    return { version: 1, routes: {} };
  }
}

function bodyFile(directory: string, key: string): string {
  return path.join(directory, "bodies", `${key}.html`);
}

export async function readCachedRouteBody(
  directory: string,
  manifest: PrerenderCacheManifest,
  route: string,
  key: string,
): Promise<string | null> {
  const entry = manifest.routes[route];
  if (!entry || entry.key !== key) return null;
  try {
    const body = await readFile(bodyFile(directory, key), "utf8");
    return digest(body) === entry.bodyHash && validHtml(body) ? body : null;
  } catch {
    return null;
  }
}

export async function writeCachedRouteBody(directory: string, key: string, body: string): Promise<CacheEntry> {
  if (!validHtml(body)) throw new Error("Refusing to cache invalid prerendered HTML.");
  await mkdir(path.join(directory, "bodies"), { recursive: true });
  const destination = bodyFile(directory, key);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, destination);
  return { key, bodyHash: digest(body) };
}

export async function writePrerenderManifest(
  directory: string,
  routes: Record<string, CacheEntry>,
): Promise<void> {
  await mkdir(path.join(directory, "bodies"), { recursive: true });
  const destination = path.join(directory, "manifest.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, routes }, null, 2)}\n`, "utf8");
  await rename(temporary, destination);

  const activeBodies = new Set(Object.values(routes).map((entry) => `${entry.key}.html`));
  for (const name of await readdir(path.join(directory, "bodies"))) {
    if (name.endsWith(".html") && !activeBodies.has(name)) {
      await rm(path.join(directory, "bodies", name), { force: true });
    }
  }
}
