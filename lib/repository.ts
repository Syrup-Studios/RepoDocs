import { createHash } from "node:crypto";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { repositoriesDirectory } from "@/lib/paths";

const ALLOWED_HOSTS = new Set([
  "github.com",
  "gitlab.com",
  "codeberg.org",
  "bitbucket.org",
]);

export type RepositoryDetails = {
  normalizedUrl: string;
  host: string;
  owner: string;
  repository: string;
  slug: string;
};

export type RepositoryFileHistory = {
  createdAt: string;
  updatedAt: string;
  authors: string[];
};

export function parseRepositoryUrl(input: string): RepositoryDetails {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid repository URL.");
  }

  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(
      "Use a public HTTPS URL from GitHub, GitLab, Codeberg, or Bitbucket.",
    );
  }

  if (url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("The repository URL cannot contain credentials, a port, or query data.");
  }

  const parts = url.pathname
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (parts.length !== 2) {
    throw new Error("Use the repository root URL, including its owner and name.");
  }

  const [owner, repository] = parts;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repository)) {
    throw new Error("The repository owner or name contains unsupported characters.");
  }

  const normalizedUrl = `https://${url.hostname}/${owner}/${repository}.git`;
  const baseSlug = repository
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";
  const suffix = createHash("sha256")
    .update(`${url.hostname}/${owner}/${repository}`.toLowerCase())
    .digest("hex")
    .slice(0, 6);

  return {
    normalizedUrl,
    host: url.hostname,
    owner,
    repository,
    slug: `${baseSlug}-${suffix}`,
  };
}

function runGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_NOSYSTEM: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, 60_000);

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || "Git could not read the repository."));
    });
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function syncRepository(
  repository: RepositoryDetails,
): Promise<{ directory: string; revision: string }> {
  const base = repositoriesDirectory();
  const directory = path.join(base, repository.slug);
  await mkdir(base, { recursive: true });

  if (await exists(path.join(directory, ".git"))) {
    await runGit(["remote", "set-url", "origin", repository.normalizedUrl], directory);
    const isShallow = await runGit(["rev-parse", "--is-shallow-repository"], directory);
    await runGit(isShallow === "true"
      ? ["fetch", "--unshallow", "--no-tags", "origin"]
      : ["fetch", "--no-tags", "origin"], directory);
    await runGit(["reset", "--hard", "FETCH_HEAD"], directory);
    await runGit(["clean", "-fdx"], directory);
  } else {
    await rm(directory, { recursive: true, force: true });
    await runGit([
      "clone",
      "--single-branch",
      "--no-tags",
      "--",
      repository.normalizedUrl,
      directory,
    ]);
  }

  const revision = await runGit(["rev-parse", "HEAD"], directory);
  return { directory, revision };
}

export async function readRepositoryFileHistory(
  repositoryDirectory: string,
  relativeFile: string,
): Promise<RepositoryFileHistory> {
  const output = await runGit([
    "log",
    "--follow",
    "--format=%aI%x1f%an%x1f%ae%x1e",
    "--",
    relativeFile,
  ], repositoryDirectory);
  const commits = output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [date, name, email] = record.split("\x1f");
      return { date, name, email };
    })
    .filter((commit) => commit.date && commit.name);

  if (commits.length === 0) {
    throw new Error(`Git history is missing for ${relativeFile}.`);
  }

  const authors = new Map<string, string>();
  for (const commit of commits) {
    const identity = commit.email?.toLowerCase() || commit.name.toLowerCase();
    if (!authors.has(identity)) authors.set(identity, commit.name);
  }

  return {
    updatedAt: commits[0].date,
    createdAt: commits[commits.length - 1].date,
    authors: [...new Set(authors.values())],
  };
}
