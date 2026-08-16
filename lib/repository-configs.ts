import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { RepositoryConfig, RepositorySource } from "@/lib/config";
import { parseFooterLinks } from "@/lib/footer";
import type { ProjectLicense, ProjectLicenses, ProjectPlatformName, ProjectPlatforms } from "@/lib/types";

const validSlug = /^[a-z0-9][a-z0-9-]{0,62}$/;
const validClassification = /^[a-z0-9][a-z0-9-]*$/;
const validVersion = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const validLocale = /^[a-z]{2}(?:[_-][a-z0-9]{2,8})?$/;
const validModId = /^[a-z][a-z0-9_-]{0,63}$/;
const validOwner = /^[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?$/;
const validGameVersion = /^[^\r\n]{1,64}$/;
const supportedPlatforms = new Set(["modrinth", "curseforge"]);
const repositoryConfigurationKeys = new Set([
  "name",
  "summary",
  "slug",
  "repository",
  "type",
  "category",
  "modId",
  "owners",
  "gameVersions",
  "loaders",
  "tags",
  "licenses",
  "rootREADME",
  "defaultLocale",
  "platforms",
  "versions",
  "footer",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseUniqueStrings(
  value: unknown,
  location: string,
  options: { pattern?: RegExp; lowercase?: boolean } = {},
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${location} must be a list of strings.`);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) throw new Error(`${location} must contain non-empty strings.`);
    const normalized = options.lowercase ? item.trim().toLowerCase() : item.trim();
    if (options.pattern && !options.pattern.test(normalized)) {
      throw new Error(`${location} contains an invalid value: ${item}`);
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) throw new Error(`${location} cannot contain duplicate values.`);
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function parseSummary(value: unknown, location: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 240 || /[\r\n]/.test(value)) {
    throw new Error(`${location} must be one line with 1 to 240 characters.`);
  }
  return value.trim();
}

export function parseModId(value: unknown, location: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !validModId.test(value)) {
    throw new Error(`${location} must start with a lowercase letter and use lowercase letters, numbers, underscores, or hyphens.`);
  }
  return value;
}

export function parseOwners(value: unknown, location: string): string[] {
  return parseUniqueStrings(value, location, { pattern: validOwner });
}

export function parseGameVersions(value: unknown, location: string): string[] {
  return parseUniqueStrings(value, location, { pattern: validGameVersion });
}

export function parseLoaders(value: unknown, location: string): string[] {
  return parseUniqueStrings(value, location, { pattern: validClassification, lowercase: true });
}

export function parseTags(value: unknown, location: string): string[] {
  return parseUniqueStrings(value, location, { pattern: validClassification, lowercase: true });
}

function parseLicense(value: unknown, location: string): ProjectLicense {
  if (!isObject(value)) throw new Error(`${location} must be an object.`);
  const allowedKeys = new Set(["id", "name", "url"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new Error(`Unknown field in ${location}: ${key}`);
  }
  const license: ProjectLicense = { source: "metadata" };
  for (const key of ["id", "name"] as const) {
    const field = value[key];
    if (field !== undefined) {
      if (typeof field !== "string" || !field.trim() || field.trim().length > 120 || /[\r\n]/.test(field)) {
        throw new Error(`${location}.${key} must be one line with 1 to 120 characters.`);
      }
      license[key] = field.trim();
    }
  }
  if (value.url !== undefined) {
    if (typeof value.url !== "string") throw new Error(`${location}.url must be an HTTP or HTTPS URL.`);
    let url: URL;
    try {
      url = new URL(value.url);
    } catch (error) {
      throw new Error(`${location}.url must be a valid web URL.`, { cause: error });
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error(`${location}.url must be an HTTP or HTTPS URL without credentials.`);
    }
    license.url = url.toString();
  }
  if (!license.id && !license.name) throw new Error(`${location} must define id or name.`);
  return license;
}

export function parseLicenses(value: unknown, location: string): ProjectLicenses {
  if (value === undefined) return {};
  if (!isObject(value)) throw new Error(`${location} must define project or documentation licenses.`);
  const licenses: ProjectLicenses = {};
  for (const [kind, license] of Object.entries(value)) {
    if (kind !== "project" && kind !== "documentation") {
      throw new Error(`Unknown license type in ${location}: ${kind}`);
    }
    licenses[kind] = parseLicense(license, `${location}.${kind}`);
  }
  return licenses;
}

export function parsePlatforms(value: unknown, location: string): ProjectPlatforms {
  if (value === undefined) return {};
  if (!isObject(value)) {
    throw new Error(`${location} platforms must map platform names to project references.`);
  }
  const platforms: ProjectPlatforms = {};
  for (const [platform, reference] of Object.entries(value)) {
    if (platform === "primary") {
      if (reference !== "modrinth" && reference !== "curseforge") {
        throw new Error(`${location} platform primary must be "modrinth" or "curseforge".`);
      }
      platforms.primary = reference;
      continue;
    }
    if (!supportedPlatforms.has(platform)) {
      throw new Error(`${location} uses unsupported platform "${platform}".`);
    }
    if (!isObject(reference)) {
      throw new Error(`${location} platform "${platform}" must be an object with an id.`);
    }
    for (const key of Object.keys(reference)) {
      if (key !== "id") throw new Error(`Unknown field in ${location} platform "${platform}": ${key}`);
    }
    if (typeof reference.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(reference.id)) {
      throw new Error(`${location} platform "${platform}" must define a valid id.`);
    }
    platforms[platform as ProjectPlatformName] = { id: reference.id };
  }
  if (platforms.primary && !platforms[platforms.primary]) {
    throw new Error(`${location} primary platform "${platforms.primary}" does not have a project reference.`);
  }
  return platforms;
}

export function parseVersions(value: unknown, location: string): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location} versions must be a map of version IDs to Git branches.`);
  }
  const versions: Record<string, string> = {};
  for (const [id, branch] of Object.entries(value)) {
    if (id === "latest" || !validVersion.test(id)) {
      throw new Error(`${location} version IDs must be URL-safe and cannot use the reserved ID "latest".`);
    }
    if (typeof branch !== "string" || !branch.trim()) {
      throw new Error(`${location} version "${id}" must define a Git branch.`);
    }
    versions[id] = branch.trim();
  }
  return versions;
}

function validateRepositoryConfig(value: unknown, location: string): RepositoryConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location} must contain a YAML configuration object.`);
  }

  const config = value as Record<string, unknown>;
  for (const key of Object.keys(config)) {
    if (!repositoryConfigurationKeys.has(key)) throw new Error(`Unknown field in ${location}: ${key}`);
  }
  if (typeof config.name !== "string" || !config.name.trim()) {
    throw new Error(`${location} must define a non-empty name.`);
  }
  if (config.name.trim().length > 100 || /[\r\n]/.test(config.name)) {
    throw new Error(`${location} name must be one line with 1 to 100 characters.`);
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
  const footerLinks = config.footer === undefined
    ? []
    : parseFooterLinks(config.footer, `${location} footer`);
  const versions = parseVersions(config.versions, location);
  const platforms = parsePlatforms(config.platforms, location);
  const owners = parseOwners(config.owners, `${location} owners`);
  const gameVersions = parseGameVersions(config.gameVersions, `${location} gameVersions`);
  const loaders = parseLoaders(config.loaders, `${location} loaders`);
  const tags = parseTags(config.tags, `${location} tags`);
  const licenses = parseLicenses(config.licenses, `${location} licenses`);
  const summary = parseSummary(config.summary, `${location} summary`);
  const modId = parseModId(config.modId, `${location} modId`);
  const defaultLocale = config.defaultLocale === undefined ? "en" : config.defaultLocale;
  if (typeof defaultLocale !== "string" || !validLocale.test(defaultLocale.toLowerCase())) {
    throw new Error(`${location} defaultLocale must be a language code such as "en" or "pt-br".`);
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
    summary,
    slug: config.slug,
    repository: config.repository.trim(),
    documentationType,
    category,
    modId,
    owners,
    gameVersions,
    loaders,
    tags,
    licenses,
    useReadmeFrontPage: config.rootREADME === true,
    footerLinks,
    platforms,
    versions,
    defaultLocale: defaultLocale.toLowerCase().replaceAll("_", "-"),
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
