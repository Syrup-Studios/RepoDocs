export type DirectoryCategory = {
  name: string;
  label: string;
  href: string;
};

export type DirectoryDefinition = {
  type: string;
  label: string;
  description: string;
  href: string;
  categories: DirectoryCategory[];
  defaultCategory?: string;
};

const definitions: DirectoryDefinition[] = [
  {
    type: "minecraft",
    label: "Minecraft",
    description: "Mods and modpacks",
    href: "/modpacks/",
    defaultCategory: "modpack",
    categories: [
      { name: "modpack", label: "Modpacks", href: "/modpacks/" },
      { name: "mod", label: "Mods", href: "/mods/" },
    ],
  },
  {
    type: "discord",
    label: "Discord",
    description: "Discord bots",
    href: "/discord/",
    defaultCategory: "bot",
    categories: [
      { name: "bot", label: "Bots", href: "/discord/" },
    ],
  },
];

const definitionMap = new Map(definitions.map((definition) => [definition.type, definition]));

export function firstClassDirectories(): DirectoryDefinition[] {
  return definitions;
}

export function directoryDefinition(type: string | null): DirectoryDefinition | null {
  return type ? definitionMap.get(type) ?? null : null;
}

export function directoryCategory(type: string | null, category: string | null): DirectoryCategory | null {
  return directoryDefinition(type)?.categories.find((item) => item.name === category) ?? null;
}

export function directoryCategoryNames(type: string, configured: string[] = []): string[] {
  const builtIn = directoryDefinition(type)?.categories.map((category) => category.name) ?? [];
  return [...new Set([...builtIn, ...configured])];
}

export function directoryHref(type: string, category?: string | null): string {
  const categoryDefinition = directoryCategory(type, category ?? null);
  if (categoryDefinition) return categoryDefinition.href;
  if (category) return `/${type}/${category}/`;
  const definition = directoryDefinition(type);
  return definition?.href ?? `/${type}/`;
}

export function directoryLabel(type: string): string {
  const definition = directoryDefinition(type);
  return definition?.label ?? type.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function categoryLabel(type: string | null, category: string): string {
  const definition = directoryCategory(type, category);
  return definition?.label ?? category.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function validateClassification(type: string, category: string, location: string): void {
  const definition = directoryDefinition(type);
  if (type === "minecraft" && category !== "mod" && category !== "modpack") {
    throw new Error(`${location} must use category "mod" or "modpack" for Minecraft documentation.`);
  }
  if (definition?.type === "discord" && category !== "bot") {
    throw new Error(`${location} must use category "bot" for Discord documentation.`);
  }
}
