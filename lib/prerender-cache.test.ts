import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  cacheKey,
  selectPrerenderTemplate,
  readCachedRouteBody,
  readPrerenderManifest,
  writeCachedRouteBody,
  writePrerenderManifest,
} from "@/lib/prerender-cache";

describe("prerender cache", () => {
  test("uses the current Vite template or the saved pristine template", () => {
    const template = "<head><!--repodocs-title--><!--repodocs-description--><!--repodocs-favicon--></head><body><!--repodocs-content--></body>";
    const rendered = "<head><title>Home</title></head><body><main>Home</main></body>";
    expect(selectPrerenderTemplate(template, null)).toBe(template);
    expect(selectPrerenderTemplate(rendered, template)).toBe(template);
    let missingTemplateFailed = false;
    try { selectPrerenderTemplate(rendered, null); } catch (error) { missingTemplateFailed = String(error).includes("run the Vite build"); }
    expect(missingTemplateFailed).toBe(true);
    let corruptTemplateFailed = false;
    try { selectPrerenderTemplate(rendered, "corrupt"); } catch (error) { corruptTemplateFailed = String(error).includes("run the Vite build"); }
    expect(corruptTemplateFailed).toBe(true);
  });

  test("reuses valid bodies and misses stale or corrupt entries", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "repodocs-prerender-"));
    try {
      const route = "/en/project/sample/latest/docs/";
      const key = cacheKey({ route: ["sample", "latest", "en", ""] });
      expect(await readCachedRouteBody(directory, { version: 1, routes: {} }, route, key)).toBe(null);

      const entry = await writeCachedRouteBody(directory, key, "<main>cached</main>");
      await writePrerenderManifest(directory, { [route]: entry });
      const manifest = await readPrerenderManifest(directory);
      expect(await readCachedRouteBody(directory, manifest, route, key)).toBe("<main>cached</main>");
      expect(await readCachedRouteBody(directory, manifest, route, cacheKey({ route: "changed" }))).toBe(null);

      const bodyPath = path.join(directory, "bodies", `${key}.html`);
      await rm(bodyPath);
      expect(await readCachedRouteBody(directory, manifest, route, key)).toBe(null);
      await writeFile(bodyPath, "corrupt");
      expect(await readCachedRouteBody(directory, manifest, route, key)).toBe(null);

      const invalidHtml = "<main>";
      await writeFile(bodyPath, invalidHtml);
      const invalidManifest = {
        version: 1 as const,
        routes: { [route]: { key, bodyHash: createHash("sha256").update(invalidHtml).digest("hex") } },
      };
      expect(await readCachedRouteBody(directory, invalidManifest, route, key)).toBe(null);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
