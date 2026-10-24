import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  compiledCacheVersion,
  hashValue,
  isCompatibleCacheManifest,
  readProjectCacheEntry,
  restoreProjectCacheAssets,
  writeProjectCacheEntry,
} from "./compiled-cache.ts";

const temporaryDirectories = [];

async function tempDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "repodocs-cache-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("compiled project cache", () => {
  test("cache keys ignore object key order and change when input changes", () => {
    expect(hashValue({ registration: { name: "A", slug: "a" }, revisions: ["1"] }))
      .toBe(hashValue({ revisions: ["1"], registration: { slug: "a", name: "A" } }));
    expect(hashValue({ slug: "a", revision: "1" })).not.toBe(hashValue({ slug: "a", revision: "2" }));
  });

  test("rejects cache manifests from another compiler fingerprint or version", () => {
    const manifest = { version: compiledCacheVersion, compilerFingerprint: "compiler-a", projects: { a: "a".repeat(64) } };
    expect(isCompatibleCacheManifest(manifest, "compiler-a")).toBe(true);
    expect(isCompatibleCacheManifest(manifest, "compiler-b")).toBe(false);
    expect(isCompatibleCacheManifest({ ...manifest, version: compiledCacheVersion + 1 }, "compiler-a")).toBe(false);
  });

  test("round-trips the compiled project and its assets, and invalidates missing or changed assets", async () => {
    const root = await tempDirectory();
    const cache = path.join(root, "compiled");
    const sourceAssets = path.join(root, "source-assets");
    const sourceFavicon = path.join(root, "source-favicon.png");
    const project = {
      slug: "sample",
      versions: { latest: { sourceRevision: "abc123" } },
      marker: "compiled output",
    };
    await mkdir(path.join(sourceAssets, "latest"), { recursive: true });
    await writeFile(path.join(sourceAssets, "latest", "guide.png"), "original asset");
    await writeFile(sourceFavicon, "favicon");

    await writeProjectCacheEntry(cache, project, "cache-key", sourceAssets, sourceFavicon);
    const cached = await readProjectCacheEntry(cache, "sample", "cache-key");
    expect(cached?.project).toEqual(project);
    expect(await readFile(path.join(cache, "assets", "sample", "repository-assets", "latest", "guide.png"), "utf8"))
      .toBe("original asset");

    const restoredAssets = path.join(root, "restored-assets");
    const restoredFavicons = path.join(root, "restored-favicons");
    await restoreProjectCacheAssets(cache, "sample", restoredAssets, restoredFavicons);
    expect(await readFile(path.join(restoredAssets, "latest", "guide.png"), "utf8")).toBe("original asset");
    expect(await readFile(path.join(restoredFavicons, "sample.png"), "utf8")).toBe("favicon");

    await writeFile(path.join(cache, "assets", "sample", "repository-assets", "latest", "guide.png"), "changed asset");
    expect(await readProjectCacheEntry(cache, "sample", "cache-key")).toBeNull();
    expect(await readProjectCacheEntry(cache, "sample", "different-key")).toBeNull();
  });
});
