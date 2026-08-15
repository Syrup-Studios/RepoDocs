import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { App, pageMetadata, staticPaths } from "@/src/app";

const outputDirectory = path.join(process.cwd(), "dist");
const template = await readFile(path.join(outputDirectory, "index.html"), "utf8");

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function render(pathname: string): string {
  const metadata = pageMetadata(pathname);
  return template
    .replace("<!--repodocs-title-->", escapeAttribute(metadata.title))
    .replace("<!--repodocs-description-->", escapeAttribute(metadata.description))
    .replace("<!--repodocs-content-->", renderToString(<App pathname={pathname} />));
}

async function writeRoute(pathname: string): Promise<void> {
  const relative = pathname === "/" ? "" : pathname.replace(/^\/+|\/+$/g, "");
  const directory = path.join(outputDirectory, relative);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), render(pathname), "utf8");
}

const paths = staticPaths();
await Promise.all(paths.map((pathname) => writeRoute(pathname)));

const notFound = render("/404/");
await writeFile(path.join(outputDirectory, "404.html"), notFound, "utf8");
await mkdir(path.join(outputDirectory, "404"), { recursive: true });
await writeFile(path.join(outputDirectory, "404", "index.html"), notFound, "utf8");

process.stdout.write(`Prerendered ${paths.length} static routes.\n`);
