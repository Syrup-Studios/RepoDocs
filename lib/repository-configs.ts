import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { RepositoryConfig, RepositorySource } from "@/lib/config";

const validSlug = /^[a-z0-9][a-z0-9-]{0,62}$/;
const validClassification = /^[a-z0-9][a-z0-9-]*$/;

function validateRepositoryConfig(value: unknown, location: string): RepositoryConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location} must contain a YAML configuration object.`);
  }

  const config = value as Record<string, unknown>;
  if (typeof config.name !== "string" || !config.name.trim()) {
    throw new Error(`${location} must define a non-empty name.`);
  }
  if (typeof config.slug !== "string" || !validSlug.test(config.slug)) {
    throw new Error(`${location} must define a slug that uses lowercase letters, numbers, and hyphens.`);
  }
  if (typeof config.repository !== "string" || !config.repository.trim()) {
    throw new Error(`${location} must define a non-empty repository URL.`);
  }
  if ((config.type === undefined) !== (config.category === undefined)) {
    throw new Error(`${location} must define type and category together.`);
  }
  if (config.rootREADME !== undefined && typeof config.rootREADME !== "boolean") {
    throw new Error(`${location} rootREADME must be true or false.`);
  }

  let documentationType: string | null = null;
  let category: string | null = null;
  if (config.type !== undefined && config.category !== undefined) {
    if (typeof config.type !== "string" || typeof config.category !== "string") {
      throw new Error(`${location} must define string values for type and category.`);
    }
    documentationType = config.type.trim().toLowerCase();
    category = config.category.trim().toLowerCase();
    if (!validClassification.test(documentationType) || !validClassification.test(category)) {
      throw new Error(`${location} type and category must use lowercase letters, numbers, or hyphens.`);
    }
    if (documentationType === "minecraft" && category !== "mod" && category !== "modpack") {
      throw new Error(`${location} must use category "mod" or "modpack" for Minecraft documentation.`);
    }
  }

  return {
    name: config.name.trim(),
    slug: config.slug,
    repository: config.repository.trim(),
    documentationType,
    category,
    useReadmeFrontPage: config.rootREADME === true,
  };
}

export async function loadRepositorySources(
  rootDirectory = path.join(process.cwd(), "repositories"),
): Promise<RepositorySource[]> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(rootDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Repository configuration directory does not exist: ${rootDirectory}`, { cause: error });
    }
    throw error;
  }

  const configurationFiles = entries
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && !entry.name.startsWith(".") && entry.name.endsWith(".yml"))
    .sort((left, right) => left.name.localeCompare(right.name));

  const sources: RepositorySource[] = [];
  const slugs = new Set<string>();
  for (const file of configurationFiles) {
    const configurationFile = path.join(rootDirectory, file.name);
    let loaded: unknown;
    try {
      loaded = parseYaml(await readFile(configurationFile, "utf8"));
    } catch (error) {
      throw new Error(`Could not load repository configuration: ${configurationFile}`, { cause: error });
    }

    const config = validateRepositoryConfig(loaded, configurationFile);
    if (slugs.has(config.slug)) {
      throw new Error(`Duplicate repository slug: ${config.slug}`);
    }
    slugs.add(config.slug);
    sources.push(config);
  }

  return sources;
}
