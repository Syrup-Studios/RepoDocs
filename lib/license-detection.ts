import type { Dirent } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { repositoryFileHref } from "@/lib/repository-links";
import type { ProjectLicense, ProjectLicenses } from "@/lib/types";

type KnownLicense = {
  id: string;
  name: string;
  requiredText: string[];
  excludedText?: string[];
};

const maximumLicenseFileSize = 512 * 1024;
const licenseFileNames = [
  "license",
  "license.md",
  "license.txt",
  "licence",
  "licence.md",
  "licence.txt",
  "copying",
  "copying.md",
  "copying.txt",
];

// Order specific licenses before licenses whose names or text they contain.
const knownLicenses: KnownLicense[] = [
  {
    id: "AGPL-3.0-only",
    name: "GNU Affero General Public License v3.0",
    requiredText: ["gnu affero general public license", "version 3, 19 november 2007"],
  },
  {
    id: "LGPL-3.0-only",
    name: "GNU Lesser General Public License v3.0",
    requiredText: ["gnu lesser general public license", "version 3, 29 june 2007"],
  },
  {
    id: "LGPL-2.1-only",
    name: "GNU Lesser General Public License v2.1",
    requiredText: ["gnu lesser general public license", "version 2.1, february 1999"],
  },
  {
    id: "LGPL-2.0-only",
    name: "GNU Library General Public License v2.0",
    requiredText: ["gnu library general public license", "version 2, june 1991"],
  },
  {
    id: "GPL-3.0-only",
    name: "GNU General Public License v3.0",
    requiredText: ["gnu general public license", "version 3, 29 june 2007"],
    excludedText: ["affero", "lesser"],
  },
  {
    id: "GPL-2.0-only",
    name: "GNU General Public License v2.0",
    requiredText: ["gnu general public license", "version 2, june 1991"],
    excludedText: ["lesser"],
  },
  {
    id: "Apache-2.0",
    name: "Apache License 2.0",
    requiredText: ["apache license", "version 2.0, january 2004", "http://www.apache.org/licenses/"],
  },
  {
    id: "MPL-2.0",
    name: "Mozilla Public License 2.0",
    requiredText: ["mozilla public license version 2.0", "http://mozilla.org/mpl/2.0/"],
  },
  {
    id: "EPL-2.0",
    name: "Eclipse Public License 2.0",
    requiredText: ["eclipse public license - v 2.0", "http://www.eclipse.org/legal/epl-2.0"],
  },
  {
    id: "BSD-3-Clause",
    name: "BSD 3-Clause License",
    requiredText: [
      "redistribution and use in source and binary forms, with or without modification, are permitted",
      "neither the name of",
      "this software is provided by the copyright holders and contributors \"as is\"",
    ],
  },
  {
    id: "BSD-2-Clause",
    name: "BSD 2-Clause License",
    requiredText: [
      "redistribution and use in source and binary forms, with or without modification, are permitted",
      "this software is provided by the copyright holders and contributors \"as is\"",
    ],
    excludedText: ["neither the name of"],
  },
  {
    id: "ISC",
    name: "ISC License",
    requiredText: [
      "permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted",
      "the software is provided \"as is\"",
    ],
  },
  {
    id: "MIT",
    name: "MIT License",
    requiredText: [
      "permission is hereby granted, free of charge, to any person obtaining a copy",
      "the software is provided \"as is\"",
    ],
  },
  {
    id: "Unlicense",
    name: "The Unlicense",
    requiredText: [
      "this is free and unencumbered software released into the public domain",
      "http://unlicense.org/",
    ],
  },
  {
    id: "BSL-1.0",
    name: "Boost Software License 1.0",
    requiredText: ["boost software license - version 1.0 - august 17th, 2003"],
  },
  {
    id: "Zlib",
    name: "zlib License",
    requiredText: [
      "this software is provided 'as-is', without any express or implied warranty",
      "permission is granted to anyone to use this software for any purpose",
      "the origin of this software must not be misrepresented",
    ],
  },
  {
    id: "OFL-1.1",
    name: "SIL Open Font License 1.1",
    requiredText: ["sil open font license", "version 1.1 - 26 february 2007"],
  },
  {
    id: "CC0-1.0",
    name: "CC0 1.0 Universal",
    requiredText: ["cc0 1.0 universal", "creativecommons.org/publicdomain/zero/1.0"],
  },
  {
    id: "CC-BY-SA-4.0",
    name: "Creative Commons Attribution-ShareAlike 4.0 International",
    requiredText: ["attribution-sharealike 4.0 international", "creativecommons.org/licenses/by-sa/4.0"],
  },
  {
    id: "CC-BY-4.0",
    name: "Creative Commons Attribution 4.0 International",
    requiredText: ["attribution 4.0 international", "creativecommons.org/licenses/by/4.0"],
    excludedText: ["attribution-sharealike"],
  },
];

function normalizedLicenseText(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function identifyLicense(contents: string): Pick<ProjectLicense, "id" | "name"> | null {
  const normalized = normalizedLicenseText(contents);
  const match = knownLicenses.find((license) =>
    license.requiredText.every((text) => normalized.includes(text))
    && !license.excludedText?.some((text) => normalized.includes(text)),
  );
  return match ? { id: match.id, name: match.name } : null;
}

function customLicenseName(contents: string): string {
  const lines = contents.split(/\r?\n/).slice(0, 20);
  const firstContentLine = lines.findIndex((line) => line.trim());
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/)?.[1];
    if (!heading && index !== firstContentLine) continue;
    const title = (heading ?? trimmed)
      .replace(/^\*\*(.+)\*\*$/, "$1")
      .trim();
    if (title.length > 0 && title.length <= 120 && /\blicen[cs]e\b/i.test(title)) return title;
  }
  return "Custom license";
}

async function directoryFiles(directory: string): Promise<Dirent<string>[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function findLicenseFile(repositoryDirectory: string, relativeDirectory: string): Promise<string | null> {
  const directory = path.join(repositoryDirectory, relativeDirectory);
  const entries = await directoryFiles(directory);
  const files = new Map<string, string>();
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isFile() && !entry.isSymbolicLink() && !files.has(entry.name.toLowerCase())) {
      files.set(entry.name.toLowerCase(), entry.name);
    }
  }
  for (const candidate of licenseFileNames) {
    const actualName = files.get(candidate);
    if (actualName) return path.posix.join(relativeDirectory, actualName).replace(/^\.\//, "");
  }
  return null;
}

async function detectedLicense(
  repositoryDirectory: string,
  sourcePath: string | null,
  repositoryUrl: string,
  branch: string,
): Promise<ProjectLicense | undefined> {
  if (!sourcePath) return undefined;
  const filePath = path.join(repositoryDirectory, sourcePath);
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > maximumLicenseFileSize) return undefined;
  const contents = await readFile(filePath, "utf8");
  const identified = identifyLicense(contents);
  return {
    ...(identified ?? { name: customLicenseName(contents) }),
    url: repositoryFileHref(repositoryUrl, branch, sourcePath, "branch"),
    source: "repository",
    sourcePath,
  };
}

export async function detectRepositoryLicenses({
  branch,
  repositoryDirectory,
  repositoryUrl,
}: {
  branch: string;
  repositoryDirectory: string;
  repositoryUrl: string;
}): Promise<ProjectLicenses> {
  const [projectPath, documentationPath] = await Promise.all([
    findLicenseFile(repositoryDirectory, "."),
    findLicenseFile(repositoryDirectory, "docs"),
  ]);
  const [project, documentation] = await Promise.all([
    detectedLicense(repositoryDirectory, projectPath, repositoryUrl, branch),
    detectedLicense(repositoryDirectory, documentationPath, repositoryUrl, branch),
  ]);
  return {
    ...(project ? { project } : {}),
    ...(documentation ? { documentation } : {}),
  };
}
