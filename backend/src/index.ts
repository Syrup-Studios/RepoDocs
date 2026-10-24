import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  APP_ORIGIN: string;
  SESSION_ENCRYPTION_KEY: string;
  PUBLISHER_APP_ID: string;
  PUBLISHER_INSTALLATION_ID: string;
  PUBLISHER_PRIVATE_KEY_PKCS8: string;
  AUTO_APPROVE_VERIFIED_REPOSITORIES?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
}

interface SessionRow {
  github_id: number;
  login: string;
  avatar_url: string;
  access_token: string;
  refresh_token: string;
  access_expires_at: number;
  refresh_expires_at: number;
  csrf_hash: string;
  expires_at: number;
}

interface GitHubRepository {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  default_branch?: string;
  permissions?: { admin?: boolean };
}

interface SubmissionInput {
  name: string;
  summary?: string;
  slug: string;
  repository: string;
  type?: string;
  category?: string;
  defaultLocale?: string;
  rootREADME?: boolean;
  versions?: Record<string, string>;
}

interface SubmissionRow {
  id: string;
  github_repo_id: number;
  repo_full_name: string;
  requester_github_id: number;
  slug: string;
  name: string;
  config_yaml: string;
  status: string;
  pr_url: string | null;
  pr_number: number | null;
  created_at: number;
  updated_at: number;
}

interface RegistrationConfig {
  slug: string;
  name: string;
  summary?: string;
  repository: string;
  data?: Record<string, unknown>;
}

interface PublicationManifest {
  siteSourceRevision: string;
  publishedAt?: string;
  projects: Array<{ slug: string; repositoryUrl: string; sourceRevision: string; documentationUrl: string; iconUrl?: string }>;
}

interface RepositoryChangeRow {
  id: string;
  slug: string;
  github_repo_id: number;
  repo_full_name: string;
  requester_github_id: number;
  operation: "edit" | "delete";
  config_yaml: string | null;
  payload_hash: string;
  branch: string;
  status: "creating" | "pending_approval" | "closed" | "merged";
  pr_url: string | null;
  pr_number: number | null;
  created_at: number;
  updated_at: number;
}

const SESSION_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(env.SESSION_ENCRYPTION_KEY), (char) => char.charCodeAt(0));
  if (raw.length !== 32) throw new Error("SESSION_ENCRYPTION_KEY must be a base64 encoded 32-byte key");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(env: Env, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), encoder.encode(value));
  const bytes = new Uint8Array(iv.length + result.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(result), iv.length);
  return btoa(String.fromCharCode(...bytes));
}

async function decrypt(env: Env, value: string): Promise<string> {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const result = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await encryptionKey(env), bytes.slice(12));
  return new TextDecoder().decode(result);
}

function cookie(request: Request, name: string): string | undefined {
  return request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function response(body: BodyInit | null, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(body, { status, headers: responseHeaders });
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return response(JSON.stringify(data), status, { "Content-Type": "application/json; charset=utf-8", ...headers });
}

function cookieHeader(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name: string): string {
  return cookieHeader(name, "", 0);
}

async function githubToken(env: Env, body: Record<string, string>): Promise<TokenResponse> {
  const result = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, ...body }),
  });
  if (!result.ok) throw new Error("GitHub token request failed");
  const token = await result.json() as TokenResponse;
  if (token.error) throw new Error("GitHub token request failed");
  return token;
}

async function sessionAccess(request: Request, env: Env): Promise<{ idHash: string; row: SessionRow; accessToken: string } | null> {
  const session = cookie(request, "session");
  if (!session) return null;
  const idHash = await digest(session);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?").bind(idHash, now).first<SessionRow>();
  if (!row) return null;
  let currentRow = row;
  if (row.access_expires_at <= now) {
    if (row.refresh_expires_at <= now) {
      await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run();
      return null;
    }
    const oldRefreshToken = row.refresh_token;
    try {
      const token = await githubToken(env, { grant_type: "refresh_token", refresh_token: await decrypt(env, row.refresh_token) });
      if (!token.access_token || !token.refresh_token) throw new Error("GitHub token refresh failed");
      const accessToken = await encrypt(env, token.access_token);
      const refreshToken = await encrypt(env, token.refresh_token);
      await env.DB.prepare("UPDATE sessions SET access_token = ?, refresh_token = ?, access_expires_at = ?, refresh_expires_at = ? WHERE id_hash = ? AND refresh_token = ?")
        .bind(accessToken, refreshToken, now + (token.expires_in ?? 28800), now + (token.refresh_token_expires_in ?? 15897600), idHash, oldRefreshToken).run();
      const latest = await env.DB.prepare("SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?").bind(idHash, now).first<SessionRow>();
      if (!latest || latest.access_expires_at <= now) return null;
      currentRow = latest;
    } catch {
      const latest = await env.DB.prepare("SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?").bind(idHash, now).first<SessionRow>();
      if (!latest || latest.access_expires_at <= now) {
        await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ? AND refresh_token = ?").bind(idHash, oldRefreshToken).run();
        return null;
      }
      currentRow = latest;
    }
  }
  try {
    return { idHash, row: currentRow, accessToken: await decrypt(env, currentRow.access_token) };
  } catch {
    await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run();
    return null;
  }
}

async function requireCsrf(request: Request, env: Env): Promise<{ idHash: string; row: SessionRow; accessToken: string } | Response> {
  if (request.headers.get("Origin") !== env.APP_ORIGIN) return json({ error: "forbidden", code: "origin_not_allowed" }, 403);
  const auth = await sessionAccess(request, env);
  if (!auth) return json({ error: "unauthorized", code: "session_required" }, 401);
  const csrf = request.headers.get("X-CSRF-Token");
  if (!csrf) return json({ error: "forbidden", code: "csrf_required" }, 403);
  if (auth.row.csrf_hash !== await digest(csrf)) return json({ error: "forbidden", code: "csrf_invalid" }, 403);
  return auth;
}

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "RepoDocs",
};

async function githubGet(path: string, accessToken: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, { headers: { ...githubHeaders, Authorization: `Bearer ${accessToken}` } });
}

async function githubPages<T>(path: string, accessToken: string): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const result = await githubGet(`${path}${separator}per_page=100&page=${page}`, accessToken);
    if (!result.ok) throw new Error(`GitHub request failed (${result.status})`);
    const payload = await result.json() as T[] | { installations?: T[]; repositories?: T[] };
    const items = Array.isArray(payload) ? payload : payload.installations ?? payload.repositories ?? [];
    results.push(...items);
    if (items.length < 100) return results;
  }
  throw new Error("GitHub pagination limit reached");
}

async function limitedBody(request: Request, limit: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function limitedResponseBody(response: Response, limit: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function installationRepositories(accessToken: string): Promise<GitHubRepository[]> {
  const installations = await githubPages<{ id: number }>("/user/installations", accessToken);
  const repositories = await Promise.all(installations.map((installation) => githubPages<GitHubRepository>(`/user/installations/${installation.id}/repositories`, accessToken)));
  return repositories.flat();
}

function parseRepositoryUrl(value: unknown): { owner: string; repo: string; url: string } | null {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) return null;
    const match = /^\/([A-Za-z0-9](?:[A-Za-z0-9_.-]{0,37})?)\/([A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})?)\/?$/.exec(url.pathname);
    if (!match || match[1] === "." || match[1] === ".." || match[2] === "." || match[2] === "..") return null;
    return { owner: match[1], repo: match[2], url: `https://github.com/${match[1]}/${match[2]}` };
  } catch {
    return null;
  }
}

async function repositoryPreflight(
  parsed: { owner: string; repo: string; url: string },
  auth: { row: SessionRow; accessToken: string },
): Promise<{ repository: GitHubRepository; docs: { exists: true; pageFound: true; metadata: { name?: string; summary?: string; type?: string; category?: string; rootREADME?: boolean; defaultLocale: string; versions: Record<string, string> } } } | Response> {
  const repoPath = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const [metadataResponse, permissionResponse, installedRepos] = await Promise.all([
    githubGet(repoPath, auth.accessToken),
    githubGet(`${repoPath}/collaborators/${encodeURIComponent(auth.row.login)}/permission`, auth.accessToken),
    installationRepositories(auth.accessToken),
  ]);
  if (metadataResponse.status === 404) return json({ error: "repository_not_found", code: "repository_not_found" }, 404);
  if (!metadataResponse.ok || !permissionResponse.ok) throw new Error("GitHub validation request failed");
  const repository = await metadataResponse.json() as GitHubRepository;
  const permission = await permissionResponse.json() as { permission?: string };
  if (!installedRepos.some((candidate) => candidate.id === repository.id)) return json({ error: "app_not_installed", code: "repository_not_installed" }, 403);
  if (repository.private || repository.archived) return json({ error: "unsupported_repository", code: "repository_not_publishable" }, 400);
  if (permission.permission !== "admin") return json({ error: "admin_required", code: "repository_admin_required" }, 403);
  const docsResponse = await githubGet(`${repoPath}/contents/docs/`, auth.accessToken);
  if (docsResponse.status === 404) return json({ error: "documentation_directory_missing", code: "docs_directory_missing" }, 422);
  if (!docsResponse.ok) throw new Error("GitHub docs preflight failed");
  const rootEntries = await docsResponse.json() as Array<{ name?: string; type?: string }>;
  if (!Array.isArray(rootEntries)) throw new Error("GitHub returned an invalid docs directory listing");
  const yamlResponse = await githubGet(`${repoPath}/contents/docs/repodocs.yml`, auth.accessToken);
  let metadata: { name?: string; summary?: string; type?: string; category?: string; rootREADME?: boolean; defaultLocale: string; versions: Record<string, string> } = { defaultLocale: "en", versions: {} };
  if (yamlResponse.status !== 404) {
    if (!yamlResponse.ok) throw new Error("GitHub documentation config preflight failed");
    const file = await yamlResponse.json() as { encoding?: string; content?: string; size?: number };
    if (file.encoding !== "base64" || !file.content || file.content.length > 90000 || (file.size ?? 0) > 65536) {
      return json({ error: "documentation_config_invalid", code: "invalid_documentation_config", message: "docs/repodocs.yml must be a base64 YAML file no larger than 64 KiB." }, 422);
    }
    try {
      const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, "")), (char) => char.charCodeAt(0));
      const config = parseYaml(new TextDecoder().decode(bytes)) as unknown;
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("docs/repodocs.yml must contain a YAML object.");
      const values = config as Record<string, unknown>;
      const allowed = new Set(["schema", "name", "summary", "type", "category", "modId", "owners", "gameVersions", "loaders", "tags", "licenses", "rootREADME", "defaultLocale", "platforms", "versions", "footer"]);
      if (Object.keys(values).some((key) => !allowed.has(key))) throw new Error("docs/repodocs.yml contains an unsupported field.");
      if (values.schema !== undefined && values.schema !== 1) throw new Error("docs/repodocs.yml must use numeric schema: 1.");
      if ((values.type === undefined) !== (values.category === undefined)) throw new Error("docs/repodocs.yml must define type and category together.");
      if (values.name !== undefined && (typeof values.name !== "string" || !values.name.trim() || values.name.trim().length > 100 || /[\r\n]/.test(values.name))) throw new Error("name in docs/repodocs.yml must be one line with 1 to 100 characters.");
      if (values.summary !== undefined && (typeof values.summary !== "string" || !values.summary.trim() || values.summary.trim().length > 240 || /[\r\n]/.test(values.summary))) throw new Error("summary in docs/repodocs.yml must be one line with 1 to 240 characters.");
      if (values.defaultLocale !== undefined && (typeof values.defaultLocale !== "string" || !/^[a-z]{2}(?:[_-][a-z0-9]{2,8})?$/i.test(values.defaultLocale))) throw new Error("defaultLocale in docs/repodocs.yml must be a language code such as en or pt-br.");
      if (values.rootREADME !== undefined && typeof values.rootREADME !== "boolean") throw new Error("rootREADME in docs/repodocs.yml must be true or false.");
      const versions: Record<string, string> = {};
      if (values.versions !== undefined) {
        if (!values.versions || typeof values.versions !== "object" || Array.isArray(values.versions)) throw new Error("versions in docs/repodocs.yml must be a map.");
        for (const [id, branch] of Object.entries(values.versions)) {
          if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(id) || id === "latest" || typeof branch !== "string" || !branch.trim() || /[\r\n\0]/.test(branch)) throw new Error("versions in docs/repodocs.yml contains an invalid ID or branch.");
          versions[id] = branch.trim();
        }
      }
      if (values.type !== undefined && (typeof values.type !== "string" || typeof values.category !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(values.type) || !/^[a-z0-9][a-z0-9-]*$/.test(values.category))) throw new Error("type and category in docs/repodocs.yml must use lowercase letters, numbers, or hyphens.");
      if (values.type === "minecraft" && values.category !== "mod" && values.category !== "modpack") throw new Error('docs/repodocs.yml must use category "mod" or "modpack" for Minecraft.');
      if (values.type === "discord" && values.category !== "bot") throw new Error('docs/repodocs.yml must use category "bot" for Discord.');
      metadata = {
        ...(typeof values.name === "string" ? { name: values.name.trim() } : {}),
        ...(typeof values.summary === "string" ? { summary: values.summary.trim() } : {}),
        ...(typeof values.type === "string" ? { type: values.type.trim() } : {}),
        ...(typeof values.category === "string" ? { category: values.category.trim() } : {}),
        ...(typeof values.rootREADME === "boolean" ? { rootREADME: values.rootREADME } : {}),
        defaultLocale: typeof values.defaultLocale === "string" ? values.defaultLocale.toLowerCase().replaceAll("_", "-") : "en",
        versions,
      };
    } catch (error) {
      return json({ error: "documentation_config_invalid", code: "invalid_documentation_config", message: error instanceof Error ? error.message : "docs/repodocs.yml is invalid." }, 422);
    }
  }
  const hasMarkdown = (items: Array<{ name?: string; type?: string }>) => items.some((item) => item.type === "file" && /\.(?:md|mdx)$/i.test(item.name ?? ""));
  let pageFound = hasMarkdown(rootEntries);
  const pendingDirectories = rootEntries.filter((item) => item.type === "dir" && item.name && !item.name.startsWith(".") && !item.name.includes("/") && item.name !== "..").slice(0, 12).map((item) => ({ path: item.name!, depth: 1 }));
  let directoryReads = 0;
  while (!pageFound && pendingDirectories.length > 0 && directoryReads < 20) {
    const directory = pendingDirectories.shift()!;
    const pagesResponse = await githubGet(`${repoPath}/contents/docs/${directory.path.split("/").map(encodeURIComponent).join("/")}`, auth.accessToken);
    directoryReads += 1;
    if (pagesResponse.status === 404) continue;
    if (!pagesResponse.ok) throw new Error("GitHub documentation page preflight failed");
    const entries = await pagesResponse.json() as Array<{ name?: string; type?: string }>;
    if (!Array.isArray(entries)) throw new Error("GitHub returned an invalid documentation directory listing");
    if (hasMarkdown(entries)) {
      pageFound = true;
      break;
    }
    if (directory.depth < 3) {
      for (const item of entries.filter((entry) => entry.type === "dir" && entry.name && !entry.name.startsWith(".") && !entry.name.includes("/")).slice(0, 8)) {
        pendingDirectories.push({ path: `${directory.path}/${item.name}`, depth: directory.depth + 1 });
      }
    }
  }
  if (metadata.rootREADME === true) {
    const readmeResponse = await githubGet(`${repoPath}/contents/README.md`, auth.accessToken);
    if (readmeResponse.ok) pageFound = true;
    else if (readmeResponse.status !== 404) throw new Error("GitHub root README preflight failed");
    else return json({ error: "root_readme_missing", code: "root_readme_missing" }, 422);
  }
  if (!pageFound) return json({ error: "documentation_page_missing", code: "docs_page_missing" }, 422);
  return { repository, docs: { exists: true, pageFound: true, metadata } };
}

async function currentAdminRepository(auth: { row: SessionRow; accessToken: string }, parsed: { owner: string; repo: string; url: string }): Promise<GitHubRepository | Response> {
  const [profileResponse, repositoryResponse, installedRepos] = await Promise.all([
    githubGet("/user", auth.accessToken),
    githubGet(`/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`, auth.accessToken),
    installationRepositories(auth.accessToken),
  ]);
  if (!profileResponse.ok || !repositoryResponse.ok) {
    if (repositoryResponse.status === 404) return json({ error: "repository_not_found", code: "repository_not_found" }, 404);
    throw new Error("GitHub repository access check failed");
  }
  const profile = await profileResponse.json() as { id?: number; login?: string };
  if (profile.id !== auth.row.github_id || !profile.login) return json({ error: "unauthorized", code: "github_identity_changed" }, 401);
  const repository = await repositoryResponse.json() as GitHubRepository;
  if (repository.private || repository.archived) return json({ error: "unsupported_repository", code: "repository_not_publishable" }, 400);
  const installed = installedRepos.find((candidate) => candidate.id === repository.id);
  if (!installed) return json({ error: "app_not_installed", code: "repository_not_installed" }, 403);
  const permissionResponse = await githubGet(`/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/collaborators/${encodeURIComponent(profile.login)}/permission`, auth.accessToken);
  if (permissionResponse.status === 404) return json({ error: "admin_required", code: "repository_admin_required" }, 403);
  if (!permissionResponse.ok) throw new Error("GitHub permission check failed");
  const permission = await permissionResponse.json() as { permission?: string };
  if (permission.permission !== "admin") return json({ error: "admin_required", code: "repository_admin_required" }, 403);
  return { ...repository, permissions: { ...repository.permissions, admin: true } };
}

function validateSubmission(value: unknown, repositoryUrl: string): { value: SubmissionInput; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value: {} as SubmissionInput, error: "invalid_schema" };
  const input = value as Record<string, unknown>;
  const allowed = new Set(["url", "name", "summary", "slug", "type", "category", "defaultLocale", "rootREADME", "versions"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return { value: {} as SubmissionInput, error: "unknown_field" };
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100 || /[\r\n]/.test(input.name)) return { value: {} as SubmissionInput, error: "invalid_name" };
  if (typeof input.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(input.slug)) return { value: {} as SubmissionInput, error: "invalid_slug" };
  if (input.summary !== undefined && (typeof input.summary !== "string" || !input.summary.trim() || input.summary.trim().length > 240 || /[\r\n]/.test(input.summary))) return { value: {} as SubmissionInput, error: "invalid_summary" };
  if ((input.type === undefined) !== (input.category === undefined)) return { value: {} as SubmissionInput, error: "classification_pair_required" };
  if (input.type !== undefined) {
    if (input.type === "minecraft" && input.category !== "mod" && input.category !== "modpack") return { value: {} as SubmissionInput, error: "invalid_classification" };
    if (input.type === "discord" && input.category !== "bot") return { value: {} as SubmissionInput, error: "invalid_classification" };
    if (typeof input.type !== "string" || typeof input.category !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(input.type) || !/^[a-z0-9][a-z0-9-]*$/.test(input.category)) return { value: {} as SubmissionInput, error: "invalid_classification" };
  }
  if (input.defaultLocale !== undefined && (typeof input.defaultLocale !== "string" || !/^[a-z]{2}(?:-[a-z0-9]{2,8})?$/i.test(input.defaultLocale))) return { value: {} as SubmissionInput, error: "invalid_locale" };
  if (input.rootREADME !== undefined && typeof input.rootREADME !== "boolean") return { value: {} as SubmissionInput, error: "invalid_root_readme" };
  const versions = input.versions;
  if (versions !== undefined) {
    if (!versions || typeof versions !== "object" || Array.isArray(versions) || Object.keys(versions).length > 50) return { value: {} as SubmissionInput, error: "invalid_versions" };
    for (const [id, branch] of Object.entries(versions)) {
      if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(id) || id === "latest" || typeof branch !== "string" || !branch.trim() || branch.length > 255 || /[\r\n\0]/.test(branch)) return { value: {} as SubmissionInput, error: "invalid_versions" };
    }
  }
  return { value: {
    name: input.name.trim(),
    ...(input.summary === undefined ? {} : { summary: (input.summary as string).trim() }),
    slug: input.slug,
    repository: repositoryUrl,
    ...(input.type === undefined ? {} : { type: input.type as string, category: input.category as string }),
    ...(input.defaultLocale === undefined ? {} : { defaultLocale: (input.defaultLocale as string).toLowerCase().replaceAll("_", "-") }),
    ...(input.rootREADME === undefined ? {} : { rootREADME: input.rootREADME as boolean }),
    ...(versions === undefined ? {} : { versions: versions as Record<string, string> }),
  } };
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function submissionYaml(input: SubmissionInput): string {
  const lines = [
    `name: ${yamlScalar(input.name)}`,
    ...(input.summary ? [`summary: ${yamlScalar(input.summary)}`] : []),
    `slug: ${yamlScalar(input.slug)}`,
    `repository: ${yamlScalar(input.repository!)}`,
    ...(input.type ? [`type: ${yamlScalar(input.type)}`, `category: ${yamlScalar(input.category!)}`] : []),
    ...(input.defaultLocale ? [`defaultLocale: ${yamlScalar(input.defaultLocale)}`] : []),
    ...(input.rootREADME === undefined ? [] : [`rootREADME: ${input.rootREADME}`]),
  ];
  if (input.versions && Object.keys(input.versions).length) {
    lines.push("versions:");
    for (const [id, branch] of Object.entries(input.versions)) lines.push(`  ${yamlScalar(id)}: ${yamlScalar(branch)}`);
  }
  return `${lines.join("\n")}\n`;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function publisherJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64Url(encoder.encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.PUBLISHER_APP_ID })));
  const signingInput = `${header}.${payload}`;
  const keyBytes = Uint8Array.from(atob(env.PUBLISHER_PRIVATE_KEY_PKCS8), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput)));
  return `${signingInput}.${base64Url(signature)}`;
}

async function publisherToken(env: Env, actionsPermission?: "read" | "write"): Promise<string> {
  if (!env.PUBLISHER_APP_ID || !env.PUBLISHER_INSTALLATION_ID || !env.PUBLISHER_PRIVATE_KEY_PKCS8) throw new Error("Publisher credentials are not configured");
  const jwt = await publisherJwt(env);
  const result = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(env.PUBLISHER_INSTALLATION_ID)}/access_tokens`, {
    method: "POST",
    headers: { ...githubHeaders, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ repositories: ["RepoDocs"], permissions: { contents: "write", pull_requests: "write", ...(actionsPermission ? { actions: actionsPermission } : {}) } }),
  });
  if (!result.ok) throw new Error("Publisher installation token request failed");
  const token = await result.json() as { token?: string };
  if (!token.token) throw new Error("Publisher installation token missing");
  return token.token;
}

async function publisherRequest(path: string, token: string, method = "GET", body?: unknown): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: { ...githubHeaders, Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function latestDeployFailed(env: Env, revision: string, branch: string): Promise<boolean> {
  try {
    const token = await publisherToken(env, "read");
    const query = new URLSearchParams({ branch, head_sha: revision, per_page: "20" });
    const result = await publisherRequest(`/repos/Syrup-Studios/RepoDocs/actions/workflows/deploy-pages.yml/runs?${query}`, token);
    if (!result.ok) return false;
    const body = await result.json() as { workflow_runs?: Array<{ head_sha?: string; status?: string; conclusion?: string; run_number?: number }> };
    if (!Array.isArray(body.workflow_runs)) return false;
    const runs = body.workflow_runs.filter((run) => run.head_sha === revision)
      .sort((left, right) => (right.run_number ?? 0) - (left.run_number ?? 0));
    const latest = runs[0];
    return latest?.status === "completed" && latest.conclusion === "failure";
  } catch {
    return false;
  }
}

type AutoMergeStatus = "requested" | "unavailable";

function autoMergeFields(status?: AutoMergeStatus): Record<string, string> {
  if (!status) return {};
  return status === "requested"
    ? { autoMergeStatus: status }
    : { autoMergeStatus: status, autoMergeMessage: "The pull request remains open because GitHub could not enable auto-merge." };
}

async function requestAutoMerge(env: Env, token: string, pullNumber: number): Promise<AutoMergeStatus | undefined> {
  if (env.AUTO_APPROVE_VERIFIED_REPOSITORIES?.toLowerCase() !== "true") return undefined;
  const headers = { ...githubHeaders, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const lookup = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: "query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){id autoMergeRequest{id}}}}",
        variables: { owner: "Syrup-Studios", repo: "RepoDocs", number: pullNumber },
      }),
    });
    if (!lookup.ok) return "unavailable";
    const lookupData = await lookup.json() as { errors?: unknown[]; data?: { repository?: { pullRequest?: { id?: string; autoMergeRequest?: { id?: string } | null } | null } | null } };
    if (lookupData.errors?.length) return "unavailable";
    const pull = lookupData.data?.repository?.pullRequest;
    if (!pull?.id) return "unavailable";
    if (pull.autoMergeRequest?.id) return "requested";
    const mutation = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: "mutation($pullRequestId:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$pullRequestId,mergeMethod:SQUASH}){pullRequest{autoMergeRequest{id}}}}",
        variables: { pullRequestId: pull.id },
      }),
    });
    if (!mutation.ok) return "unavailable";
    const mutationData = await mutation.json() as { errors?: unknown[]; data?: { enablePullRequestAutoMerge?: { pullRequest?: { autoMergeRequest?: { id?: string } | null } | null } | null } };
    return mutationData.errors?.length || !mutationData.data?.enablePullRequestAutoMerge?.pullRequest?.autoMergeRequest?.id ? "unavailable" : "requested";
  } catch {
    return "unavailable";
  }
}

async function readRepoDocsRegistrations(token: string): Promise<{ defaultBranch: string; sourceRevision: string; configs: RegistrationConfig[] }> {
  const target = "/repos/Syrup-Studios/RepoDocs";
  const repositoryResponse = await publisherRequest(target, token);
  if (!repositoryResponse.ok) throw new Error("Could not read the registration repository");
  const repository = await repositoryResponse.json() as { default_branch?: string };
  if (!repository.default_branch) throw new Error("Registration repository branch is unavailable");
  const headResponse = await publisherRequest(`${target}/git/ref/heads/${encodeURIComponent(repository.default_branch)}`, token);
  if (!headResponse.ok) throw new Error("Could not read the registration branch revision");
  const head = await headResponse.json() as { object?: { sha?: string } };
  if (!head.object?.sha) throw new Error("Registration branch revision is unavailable");
  const treeResponse = await publisherRequest(`${target}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`, token);
  if (!treeResponse.ok) throw new Error("Could not read registration files");
  const tree = await treeResponse.json() as { truncated?: boolean; tree?: Array<{ path?: string; type?: string }> };
  if (tree.truncated) throw new Error("Registration file index is truncated");
  const paths = (tree.tree ?? []).filter((item) => item.type === "blob" && /^repositories\/[^/]+\.ya?ml$/i.test(item.path ?? ""));
  if (paths.length > 200) throw new Error("Registration file limit reached");
  const configs: RegistrationConfig[] = [];
  const slugs = new Set<string>();
  const repositories = new Set<string>();
  let totalBytes = 0;
  for (const item of paths) {
    const path = item.path!;
    const fileResponse = await publisherRequest(`${target}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(repository.default_branch)}`, token);
    if (!fileResponse.ok) throw new Error("Could not read a registration file");
    const file = await fileResponse.json() as { content?: string; encoding?: string };
    if (file.encoding !== "base64" || !file.content) throw new Error("Registration file content is unavailable");
    const text = decodeBase64Utf8(file.content);
    const byteLength = encoder.encode(text).byteLength;
    totalBytes += byteLength;
    if (byteLength > 64 * 1024 || totalBytes > 4 * 1024 * 1024) throw new Error("Registration file size limit reached");
    const value: unknown = parseYaml(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Registration file has an invalid format");
    const config = value as Record<string, unknown>;
    if (typeof config.slug !== "string" || typeof config.name !== "string" || typeof config.repository !== "string") throw new Error("Registration file has an invalid format");
    const repositoryKey = normalizedRepository(config.repository);
    if (slugs.has(config.slug) || (repositoryKey && repositories.has(repositoryKey))) throw new Error("Registration files contain duplicate identities");
    slugs.add(config.slug);
    if (repositoryKey) repositories.add(repositoryKey);
    configs.push({ slug: config.slug, name: config.name, ...(typeof config.summary === "string" ? { summary: config.summary } : {}), repository: config.repository, data: config });
  }
  return { defaultBranch: repository.default_branch, sourceRevision: head.object.sha, configs };
}

async function readPublicationManifest(siteOrigin: string): Promise<PublicationManifest> {
  const result = await fetch(new URL("/publication.json", siteOrigin));
  if (!result.ok) throw new Error("Publication manifest is unavailable");
  if (Number(result.headers.get("Content-Length") ?? 0) > 2 * 1024 * 1024) throw new Error("Publication manifest is too large");
  const text = await limitedResponseBody(result, 2 * 1024 * 1024);
  if (text === null) throw new Error("Publication manifest is too large");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Publication manifest has an invalid format");
  const manifest = value as Record<string, unknown>;
  if (typeof manifest.siteSourceRevision !== "string" || !Array.isArray(manifest.projects) || manifest.projects.length > 5000) throw new Error("Publication manifest has an invalid format");
  if (manifest.publishedAt !== undefined && (typeof manifest.publishedAt !== "string" || !Number.isFinite(Date.parse(manifest.publishedAt)))) throw new Error("Publication manifest has an invalid publication time");
  const seen = new Set<string>();
  const projects = manifest.projects.map((project) => {
    if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error("Publication manifest has an invalid project");
    const entry = project as Record<string, unknown>;
    if ([entry.slug, entry.repositoryUrl, entry.sourceRevision, entry.documentationUrl].some((field) => typeof field !== "string" || !field)) throw new Error("Publication manifest has an invalid project");
    if (entry.iconUrl !== undefined && (typeof entry.iconUrl !== "string" || !/^\/repository-favicons\/[A-Za-z0-9._/-]+$/.test(entry.iconUrl) || entry.iconUrl.includes(".."))) throw new Error("Publication manifest has an invalid project icon");
    const slug = entry.slug as string;
    if (seen.has(slug)) throw new Error("Publication manifest has duplicate project slugs");
    seen.add(slug);
    return { slug, repositoryUrl: entry.repositoryUrl as string, sourceRevision: entry.sourceRevision as string, documentationUrl: entry.documentationUrl as string, ...(typeof entry.iconUrl === "string" ? { iconUrl: entry.iconUrl } : {}) };
  });
  return { siteSourceRevision: manifest.siteSourceRevision, ...(typeof manifest.publishedAt === "string" ? { publishedAt: manifest.publishedAt } : {}), projects };
}

async function verifiedAdminRepositories(accessToken: string, login: string, candidates: GitHubRepository[]): Promise<Set<number>> {
  const unique = new Map<number, GitHubRepository>();
  for (const repository of candidates) {
    if (repository.permissions?.admin === true && !repository.private && !repository.archived) unique.set(repository.id, repository);
  }
  if (unique.size > 250) throw new Error("Admin repository limit reached");
  const verified = new Set<number>();
  for (const repository of unique.values()) {
    const [owner, name] = repository.full_name.split("/");
    if (!owner || !name) continue;
    const result = await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/collaborators/${encodeURIComponent(login)}/permission`, accessToken);
    if (result.status === 404) continue;
    if (!result.ok) throw new Error("Could not verify repository admin permission");
    const permission = await result.json() as { permission?: string };
    if (permission.permission === "admin") verified.add(repository.id);
  }
  return verified;
}

function registrationResult(config: RegistrationConfig, repository: GitHubRepository, manifest: PublicationManifest, prUrl: string | null = null, currentSiteRevision?: string) {
  const matchingProject = manifest.projects.find((project) => project.slug === config.slug && samePublicRepository(project.repositoryUrl, config.repository));
  const published = manifest.siteSourceRevision === currentSiteRevision ? matchingProject : undefined;
  return {
    slug: config.slug,
    name: config.name,
    description: config.summary ?? repository.description,
    repositoryUrl: repository.html_url,
    status: published ? "published" : "publishing",
    documentationUrl: (published ?? matchingProject)?.documentationUrl ?? null,
    sourceRevision: published?.sourceRevision ?? null,
    latestPublishedAt: published ? manifest.publishedAt ?? null : null,
    ...((published ?? matchingProject)?.iconUrl ? { iconUrl: (published ?? matchingProject)!.iconUrl } : {}),
    admin: true,
    prUrl,
  };
}

async function livePullRequest(token: string, row: SubmissionRow): Promise<{ status: "pending_approval" | "closed" | "publishing"; prUrl: string }> {
  if (!Number.isSafeInteger(row.pr_number) || !row.pr_number || row.pr_number < 1) throw new Error("Submission pull request number is invalid");
  const result = await publisherRequest(`/repos/Syrup-Studios/RepoDocs/pulls/${row.pr_number}`, token);
  if (!result.ok) throw new Error("Could not read submission pull request");
  const pull = await result.json() as {
    html_url?: string;
    state?: string;
    merged_at?: string | null;
    head?: { ref?: string; repo?: { full_name?: string } };
    base?: { ref?: string; repo?: { full_name?: string } };
  };
  const expectedBranch = `repo-registration-${row.slug}-${row.id.slice(0, 8)}`;
  if (!pull.html_url || pull.head?.ref !== expectedBranch || pull.head.repo?.full_name?.toLowerCase() !== "syrup-studios/repodocs" || pull.base?.repo?.full_name?.toLowerCase() !== "syrup-studios/repodocs") {
    throw new Error("Submission pull request does not match its stored registration");
  }
  if (pull.merged_at) return { status: "publishing", prUrl: pull.html_url };
  if (pull.state === "open") return { status: "pending_approval", prUrl: pull.html_url };
  if (pull.state === "closed") return { status: "closed", prUrl: pull.html_url };
  throw new Error("Submission pull request state is invalid");
}

async function liveChangePullRequest(token: string, row: RepositoryChangeRow, defaultBranch?: string): Promise<{ status: "pending_approval" | "closed" | "merged"; prUrl: string }> {
  if (!Number.isSafeInteger(row.pr_number) || !row.pr_number || row.pr_number < 1) throw new Error("Change pull request number is invalid");
  const result = await publisherRequest(`/repos/Syrup-Studios/RepoDocs/pulls/${row.pr_number}`, token);
  if (!result.ok) throw new Error("Could not read change pull request");
  const pull = await result.json() as {
    html_url?: string;
    state?: string;
    merged_at?: string | null;
    head?: { ref?: string; repo?: { full_name?: string } };
    base?: { ref?: string; repo?: { full_name?: string } };
  };
  if (!pull.html_url || pull.head?.ref !== row.branch || pull.head.repo?.full_name?.toLowerCase() !== "syrup-studios/repodocs" || pull.base?.repo?.full_name?.toLowerCase() !== "syrup-studios/repodocs" || (defaultBranch && pull.base.ref !== defaultBranch)) {
    throw new Error("Change pull request does not match its stored operation");
  }
  if (pull.merged_at) return { status: "merged", prUrl: pull.html_url };
  if (pull.state === "open") return { status: "pending_approval", prUrl: pull.html_url };
  if (pull.state === "closed") return { status: "closed", prUrl: pull.html_url };
  throw new Error("Change pull request state is invalid");
}

async function createChangePullRequest(token: string, row: RepositoryChangeRow): Promise<{ status: "pending_approval" | "closed" | "merged"; prUrl: string; prNumber: number }> {
  const target = "/repos/Syrup-Studios/RepoDocs";
  const targetResponse = await publisherRequest(target, token);
  if (!targetResponse.ok) throw new Error("Publisher cannot read the target repository");
  const targetRepo = await targetResponse.json() as { default_branch?: string };
  if (!targetRepo.default_branch) throw new Error("Target default branch is unavailable");
  const filePath = `repositories/${row.slug}.yml`;
  let refResponse = await publisherRequest(`${target}/git/ref/heads/${encodeURIComponent(row.branch)}`, token);
  if (refResponse.status === 404) {
    const baseResponse = await publisherRequest(`${target}/git/ref/heads/${encodeURIComponent(targetRepo.default_branch)}`, token);
    if (!baseResponse.ok) throw new Error("Target default branch ref is unavailable");
    const baseRef = await baseResponse.json() as { object?: { sha?: string } };
    if (!baseRef.object?.sha) throw new Error("Target branch commit is unavailable");
    const createRef = await publisherRequest(`${target}/git/refs`, token, "POST", { ref: `refs/heads/${row.branch}`, sha: baseRef.object.sha });
    if (!createRef.ok) {
      refResponse = await publisherRequest(`${target}/git/ref/heads/${encodeURIComponent(row.branch)}`, token);
      if (!refResponse.ok) throw new Error("Could not create change branch");
    }
  } else if (!refResponse.ok) {
    throw new Error("Could not read change branch");
  }

  const filePathOnBranch = `${target}/contents/${filePath}?ref=${encodeURIComponent(row.branch)}`;
  const fileResponse = await publisherRequest(filePathOnBranch, token);
  if (row.operation === "edit") {
    if (!row.config_yaml) throw new Error("Edit content is missing");
    if (!fileResponse.ok) throw new Error("Registration file is missing from the change branch");
    const file = await fileResponse.json() as { content?: string; encoding?: string; sha?: string };
    if (file.encoding !== "base64" || !file.content || !file.sha) throw new Error("Registration file content is unavailable");
    if (decodeBase64Utf8(file.content) !== row.config_yaml) {
      const write = await publisherRequest(`${target}/contents/${filePath}`, token, "PUT", {
        message: `Update repository registration: ${row.slug}`,
        content: base64Utf8(row.config_yaml),
        branch: row.branch,
        sha: file.sha,
      });
      if (!write.ok) throw new Error("Could not update repository registration");
    }
  } else if (fileResponse.ok) {
    const file = await fileResponse.json() as { sha?: string };
    if (!file.sha) throw new Error("Registration file version is unavailable");
    const remove = await publisherRequest(`${target}/contents/${filePath}`, token, "DELETE", {
      message: `Remove repository registration: ${row.slug}`,
      branch: row.branch,
      sha: file.sha,
    });
    if (!remove.ok) throw new Error("Could not remove repository registration from the change branch");
  } else if (fileResponse.status !== 404) {
    throw new Error("Could not inspect repository registration on the change branch");
  }

  const head = `Syrup-Studios:${row.branch}`;
  const pulls = await publisherRequest(`${target}/pulls?state=all&head=${encodeURIComponent(head)}&base=${encodeURIComponent(targetRepo.default_branch)}`, token);
  if (!pulls.ok) throw new Error("Could not check the existing change pull request");
  const existingPulls = await pulls.json() as Array<{ number: number; html_url: string; state: string; head?: { ref?: string }; base?: { ref?: string }; merged_at?: string | null }>;
  const existingPull = existingPulls.find((item) => item.head?.ref === row.branch);
  if (existingPull) {
    const status = existingPull.merged_at ? "merged" : existingPull.state === "open" ? "pending_approval" : "closed";
    return { status, prUrl: existingPull.html_url, prNumber: existingPull.number };
  }
  const isDelete = row.operation === "delete";
  const createdPull = await publisherRequest(`${target}/pulls`, token, "POST", {
    title: `${isDelete ? "Remove" : "Update"} repository registration: ${row.slug}`,
    body: `This pull request ${isDelete ? "removes" : "updates"} only [repositories/${row.slug}.yml](https://github.com/Syrup-Studios/RepoDocs/blob/${targetRepo.default_branch}/${filePath}). Please review the registration change before merging.`,
    head: row.branch,
    base: targetRepo.default_branch,
  });
  if (!createdPull.ok) throw new Error("Could not open registration change pull request");
  const pull = await createdPull.json() as { number?: number; html_url?: string };
  if (!pull.number || !pull.html_url) throw new Error("GitHub returned an invalid pull request");
  return { status: "pending_approval", prUrl: pull.html_url, prNumber: pull.number };
}

async function updateChangeRow(env: Env, row: RepositoryChangeRow, status: RepositoryChangeRow["status"], prUrl: string | null, prNumber: number | null): Promise<void> {
  await env.DB.prepare("UPDATE repository_changes SET status = ?, pr_url = ?, pr_number = ?, updated_at = ? WHERE id = ?")
    .bind(status, prUrl, prNumber, Math.floor(Date.now() / 1000), row.id).run();
}

async function requestRepositoryChange(
  env: Env,
  token: string,
  repository: GitHubRepository,
  requesterId: number,
  slug: string,
  operation: "edit" | "delete",
  configYaml: string | null,
  defaultBranch: string,
): Promise<{ response: Response; statusCode: number }> {
  const payloadHash = await digest(`${operation}\n${configYaml ?? ""}`);
  let row = await env.DB.prepare("SELECT * FROM repository_changes WHERE slug = ? AND status IN ('creating', 'pending_approval') LIMIT 1").bind(slug).first<RepositoryChangeRow>();
  let created = false;
  if (row) {
    if (row.github_repo_id !== repository.id || row.requester_github_id !== requesterId) {
      return { response: json({ error: "change_exists", code: "repository_change_pending" }, 409), statusCode: 409 };
    }
    if (row.status === "pending_approval" && row.pr_number) {
      const live = await liveChangePullRequest(token, row, defaultBranch);
      await updateChangeRow(env, row, live.status, live.prUrl, row.pr_number);
      if (live.status === "pending_approval") {
        if (row.operation !== operation || row.payload_hash !== payloadHash) return { response: json({ error: "change_exists", code: "repository_change_pending" }, 409), statusCode: 409 };
        const autoMergeStatus = await requestAutoMerge(env, token, row.pr_number!);
        return { response: json({ registration: { slug, operation, status: live.status, prUrl: live.prUrl, ...autoMergeFields(autoMergeStatus) } }), statusCode: 200 };
      }
      if (live.status === "merged") {
        await updateChangeRow(env, row, "merged", live.prUrl, row.pr_number);
        return { response: json({ error: "change_merged", code: "reload_registration_before_change" }, 409), statusCode: 409 };
      }
      row = { ...row, status: live.status, pr_url: live.prUrl };
      if (live.status === "closed") await updateChangeRow(env, row, "closed", live.prUrl, row.pr_number);
      row = null;
    } else if (row.operation !== operation || row.payload_hash !== payloadHash) {
      return { response: json({ error: "change_exists", code: "repository_change_pending" }, 409), statusCode: 409 };
    }
  }
  if (!row) {
    const id = randomToken(18);
    const branch = `repodocs-${operation}-${slug}-${id.slice(0, 8)}`;
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT OR IGNORE INTO repository_changes (id, slug, github_repo_id, repo_full_name, requester_github_id, operation, config_yaml, payload_hash, branch, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?)")
      .bind(id, slug, repository.id, repository.full_name, requesterId, operation, configYaml, payloadHash, branch, now, now).run();
    row = await env.DB.prepare("SELECT * FROM repository_changes WHERE slug = ? AND status IN ('creating', 'pending_approval') LIMIT 1").bind(slug).first<RepositoryChangeRow>();
    if (!row || row.github_repo_id !== repository.id || row.requester_github_id !== requesterId || row.operation !== operation || row.payload_hash !== payloadHash) {
      return { response: json({ error: "change_exists", code: "repository_change_pending" }, 409), statusCode: 409 };
    }
    created = row.id === id;
  }
  if (!row) return { response: json({ error: "change_unavailable", code: "repository_change_failed" }, 502), statusCode: 502 };
  if (row.status === "closed" || row.status === "merged") return { response: json({ error: "change_closed", code: "repository_change_closed" }, 409), statusCode: 409 };
  const pull = await createChangePullRequest(token, row);
  await updateChangeRow(env, row, pull.status, pull.prUrl, pull.prNumber);
  if (pull.status !== "pending_approval") return { response: json({ error: "change_closed", code: "repository_change_closed" }, 409), statusCode: 409 };
  const autoMergeStatus = await requestAutoMerge(env, token, pull.prNumber);
  return {
    response: json({ registration: { slug, operation, status: "pending_approval", prUrl: pull.prUrl, ...autoMergeFields(autoMergeStatus) } }),
    statusCode: created ? 201 : 200,
  };
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function normalizedRepository(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.replace(/\/$/, "").replace(/\.git$/i, "").split("/").filter(Boolean);
    if (url.hostname.toLowerCase() !== "github.com" || parts.length !== 2) return null;
    return `${parts[0]}/${parts[1]}`.toLowerCase();
  } catch {
    return null;
  }
}

function samePublicRepository(left: unknown, right: unknown): boolean {
  const parsedLeft = parseRepositoryUrl(left);
  const parsedRight = parseRepositoryUrl(right);
  return !!parsedLeft && !!parsedRight && parsedLeft.url.toLowerCase() === parsedRight.url.toLowerCase();
}

async function ensureRegistrationIsNew(token: string, defaultBranch: string, row: SubmissionRow): Promise<void> {
  const target = "/repos/Syrup-Studios/RepoDocs";
  const treeResponse = await publisherRequest(`${target}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`, token);
  if (!treeResponse.ok) throw new Error("Could not check existing registrations");
  const tree = await treeResponse.json() as { truncated?: boolean; tree?: Array<{ path?: string; type?: string }> };
  if (tree.truncated) throw new Error("Registration file index is truncated");
  const paths = (tree.tree ?? []).filter((item) => item.type === "blob" && /^repositories\/[^/]+\.ya?ml$/i.test(item.path ?? ""));
  const requestedRepository = normalizedRepository(`https://github.com/${row.repo_full_name}`);
  for (const item of paths) {
    const path = item.path!;
    const existingSlug = path.slice("repositories/".length).replace(/\.ya?ml$/i, "");
    if (existingSlug.toLowerCase() === row.slug) throw new Error("slug_already_published");
    const fileResponse = await publisherRequest(`${target}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(defaultBranch)}`, token);
    if (!fileResponse.ok) throw new Error("Could not read existing registration");
    const file = await fileResponse.json() as { content?: string; encoding?: string };
    if (file.encoding !== "base64" || !file.content) throw new Error("Existing registration content is unavailable");
    const content = parseYaml(decodeBase64Utf8(file.content));
    if (content && typeof content === "object" && normalizedRepository((content as Record<string, unknown>).repository) === requestedRepository) {
      throw new Error("repository_already_published");
    }
  }
}

function base64Utf8(value: string): string {
  const bytes = encoder.encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

async function createRegistration(env: Env, row: SubmissionRow, configYaml: string): Promise<{ status: "pending_approval" | "closed"; prUrl: string; prNumber: number; autoMergeStatus?: AutoMergeStatus }> {
  const token = await publisherToken(env);
  const target = "/repos/Syrup-Studios/RepoDocs";
  const targetResponse = await publisherRequest(target, token);
  if (!targetResponse.ok) throw new Error("Publisher cannot read the target repository");
  const targetRepo = await targetResponse.json() as { default_branch?: string };
  if (!targetRepo.default_branch) throw new Error("Target default branch is unavailable");
  await ensureRegistrationIsNew(token, targetRepo.default_branch, row);

  const branch = `repo-registration-${row.slug}-${row.id.slice(0, 8)}`;
  let refResponse = await publisherRequest(`${target}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  if (refResponse.status === 404) {
    const baseResponse = await publisherRequest(`${target}/git/ref/heads/${encodeURIComponent(targetRepo.default_branch)}`, token);
    if (!baseResponse.ok) throw new Error("Target default branch ref is unavailable");
    const baseRef = await baseResponse.json() as { object?: { sha?: string } };
    if (!baseRef.object?.sha) throw new Error("Target branch commit is unavailable");
    const createRef = await publisherRequest(`${target}/git/refs`, token, "POST", { ref: `refs/heads/${branch}`, sha: baseRef.object.sha });
    if (!createRef.ok) {
      refResponse = await publisherRequest(`${target}/git/ref/heads/${encodeURIComponent(branch)}`, token);
      if (!refResponse.ok) throw new Error("Could not create registration branch");
    }
  } else if (!refResponse.ok) {
    throw new Error("Could not read registration branch");
  }

  const filePath = `repositories/${row.slug}.yml`;
  const file = await publisherRequest(`${target}/contents/${filePath}?ref=${encodeURIComponent(branch)}`, token);
  if (file.ok) {
    const existing = await file.json() as { content?: string; encoding?: string };
    if (existing.encoding !== "base64" || !existing.content || decodeBase64Utf8(existing.content) !== configYaml) throw new Error("Registration path already contains different content");
  } else if (file.status === 404) {
    const write = await publisherRequest(`${target}/contents/${filePath}`, token, "PUT", {
      message: `Add repository registration: ${row.slug}`,
      content: base64Utf8(configYaml),
      branch,
    });
    if (!write.ok) throw new Error("Could not create repository registration file");
  } else {
    throw new Error("Could not inspect repository registration path");
  }

  const head = `Syrup-Studios:${branch}`;
  const pulls = await publisherRequest(`${target}/pulls?state=all&head=${encodeURIComponent(head)}&base=${encodeURIComponent(targetRepo.default_branch)}`, token);
  if (!pulls.ok) throw new Error("Could not check existing registration pull request");
  const existingPulls = await pulls.json() as Array<{ number: number; html_url: string; state: string; head?: { ref?: string }; merged_at?: string | null }>;
  const existingPull = existingPulls.find((item) => item.head?.ref === branch);
  if (existingPull) {
    if (existingPull.state !== "open") return { status: "closed", prUrl: existingPull.html_url, prNumber: existingPull.number };
    return { status: "pending_approval", prUrl: existingPull.html_url, prNumber: existingPull.number, autoMergeStatus: await requestAutoMerge(env, token, existingPull.number) };
  }
  const createdPull = await publisherRequest(`${target}/pulls`, token, "POST", {
    title: `Add repository: ${row.repo_full_name}`,
    body: `This pull request adds the RepoDocs registration for [${row.repo_full_name}](https://github.com/${row.repo_full_name}).\n\nPlease review the repository metadata before merging.`,
    head: branch,
    base: targetRepo.default_branch,
  });
  if (!createdPull.ok) throw new Error("Could not open repository registration pull request");
  const pull = await createdPull.json() as { number?: number; html_url?: string };
  if (!pull.number || !pull.html_url) throw new Error("GitHub returned an invalid pull request");
  return { status: "pending_approval", prUrl: pull.html_url, prNumber: pull.number, autoMergeStatus: await requestAutoMerge(env, token, pull.number) };
}

function redirect(uri: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: uri });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return response(null, 302, headers);
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return response(null, 204, { "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token", "Access-Control-Max-Age": "600" });

  if (url.pathname === "/auth/github" && request.method === "GET") {
    const state = randomToken();
    const verifier = randomToken(48);
    const challenge = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(challenge))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const callback = new URL("/auth/github/callback", url.origin).toString();
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: callback, state, code_challenge: codeChallenge, code_challenge_method: "S256", scope: "offline_access" }).toString();
    return redirect(authorize.toString(), [cookieHeader("oauth_state", state, 600), cookieHeader("oauth_verifier", verifier, 600)]);
  }

  if (url.pathname === "/auth/github/callback" && request.method === "GET") {
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const savedState = cookie(request, "oauth_state");
    const verifier = cookie(request, "oauth_verifier");
    const clearOAuth = [clearCookie("oauth_state"), clearCookie("oauth_verifier")];
    if (!state || !savedState || state !== savedState || !verifier || !code) return redirect(env.APP_ORIGIN, clearOAuth);
    let token: TokenResponse;
    let profile: { id?: number; login?: string; avatar_url?: string };
    try {
      token = await githubToken(env, { code, redirect_uri: new URL("/auth/github/callback", url.origin).toString(), code_verifier: verifier });
      if (!token.access_token || !token.refresh_token) return redirect(env.APP_ORIGIN, clearOAuth);
      const profileResponse = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "RepoDocs" } });
      if (!profileResponse.ok) return redirect(env.APP_ORIGIN, clearOAuth);
      profile = await profileResponse.json() as { id?: number; login?: string; avatar_url?: string };
    } catch {
      return redirect(env.APP_ORIGIN, clearOAuth);
    }
    if (!Number.isSafeInteger(profile.id) || !profile.login || !profile.avatar_url) return redirect(env.APP_ORIGIN, clearOAuth);
    const session = randomToken(32);
    const csrf = randomToken();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO sessions (id_hash, github_id, login, avatar_url, access_token, refresh_token, access_expires_at, refresh_expires_at, csrf_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(await digest(session), profile.id, profile.login, profile.avatar_url, await encrypt(env, token.access_token!), await encrypt(env, token.refresh_token!), now + (token.expires_in ?? 28800), now + (token.refresh_token_expires_in ?? 15897600), await digest(csrf), now + SESSION_SECONDS).run();
    return redirect(env.APP_ORIGIN, [...clearOAuth, cookieHeader("session", session, SESSION_SECONDS)]);
  }

  if (url.pathname === "/auth/logout" && request.method === "POST") {
    const auth = await requireCsrf(request, env);
    if (auth instanceof Response) return auth;
    await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(auth.idHash).run();
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie("session") });
  }

  if (url.pathname === "/api/me" && request.method === "GET") {
    const auth = await sessionAccess(request, env);
    if (!auth) return json({ user: null }, 401);
    const csrfToken = randomToken();
    await env.DB.prepare("UPDATE sessions SET csrf_hash = ? WHERE id_hash = ?").bind(await digest(csrfToken), auth.idHash).run();
    return json({ user: { id: auth.row.github_id, login: auth.row.login, avatarUrl: auth.row.avatar_url }, csrfToken });
  }

  const registrationDetail = /^\/api\/repositories\/([a-z0-9][a-z0-9-]{0,62})(?:\/status)?$/.exec(url.pathname);
  if (registrationDetail && request.method === "GET") {
    const auth = await sessionAccess(request, env);
    if (!auth) return json({ error: "unauthorized", code: "session_required" }, 401);
    const slug = registrationDetail[1];
    try {
      const [token, manifest] = await Promise.all([publisherToken(env), readPublicationManifest(env.APP_ORIGIN)]);
      const source = await readRepoDocsRegistrations(token);
      const config = source.configs.find((item) => item.slug === slug);
      if (!config) return json({ error: "registration_not_found", code: "registration_not_found" }, 404);
      const deploymentFailed = manifest.siteSourceRevision !== source.sourceRevision
        && await latestDeployFailed(env, source.sourceRevision, source.defaultBranch);
      const parsed = parseRepositoryUrl(config.repository);
      if (!parsed) return json({ error: "registration_invalid", code: "registration_repository_invalid" }, 409);
      const repository = await currentAdminRepository(auth, parsed);
      if (repository instanceof Response) return repository;
      const change = await env.DB.prepare("SELECT * FROM repository_changes WHERE slug = ? AND requester_github_id = ? ORDER BY updated_at DESC LIMIT 1").bind(slug, auth.row.github_id).first<RepositoryChangeRow>();
      let changeResult: Record<string, unknown> | undefined;
      if (change && change.pr_number && (change.status === "creating" || change.status === "pending_approval")) {
        const live = await liveChangePullRequest(token, change, source.defaultBranch);
        await updateChangeRow(env, change, live.status, live.prUrl, change.pr_number);
        if (live.status === "pending_approval") changeResult = { operation: change.operation, status: live.status, prUrl: live.prUrl };
      }
      const registration = registrationResult(config, repository, manifest, null, source.sourceRevision);
      if (deploymentFailed && registration.status === "publishing") registration.status = "update_failed";
      return json({ registration: { ...registration, config: config.data ?? {} }, ...(changeResult ? { change: changeResult } : {}) });
    } catch {
      return json({ error: "registration_status_unavailable", code: "repository_status_failed" }, 502);
    }
  }

  const registrationAction = /^\/api\/repositories\/([a-z0-9][a-z0-9-]{0,62})$/.exec(url.pathname);
  if (registrationAction && (request.method === "PATCH" || request.method === "DELETE")) {
    const auth = await requireCsrf(request, env);
    if (auth instanceof Response) return auth;
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return json({ error: "invalid_request", code: "json_required" }, 400);
    const body = await limitedBody(request, 4096);
    if (body === null) return json({ error: "request_too_large", code: "body_too_large" }, 413);
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return json({ error: "invalid_request", code: "invalid_json" }, 400);
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid_request", code: "invalid_schema" }, 422);
    const slug = registrationAction[1];
    const operation = request.method === "PATCH" ? "edit" : "delete";
    if (operation === "delete" && (Object.keys(input as Record<string, unknown>).length !== 1 || (input as Record<string, unknown>).confirm !== true)) {
      return json({ error: "confirmation_required", code: "delete_confirmation_required" }, 422);
    }
    try {
      const token = await publisherToken(env);
      const source = await readRepoDocsRegistrations(token);
      const current = source.configs.find((config) => config.slug === slug);
      if (!current) return json({ error: "registration_not_found", code: "registration_not_found" }, 404);
      const parsedCurrent = parseRepositoryUrl(current.repository);
      if (!parsedCurrent) return json({ error: "registration_invalid", code: "registration_repository_invalid" }, 409);
      const repository = await currentAdminRepository(auth, parsedCurrent);
      if (repository instanceof Response) return repository;
      const pendingSubmission = await env.DB.prepare("SELECT * FROM repository_submissions WHERE github_repo_id = ? AND status IN ('creating', 'pending_approval') LIMIT 1").bind(repository.id).first<SubmissionRow>();
      if (pendingSubmission) return json({ error: "registration_change_pending", code: "registration_change_pending" }, 409);
      let configYaml: string | null = null;
      if (operation === "edit") {
        const submitted = input as Record<string, unknown>;
        const submittedUrl = parseRepositoryUrl(submitted.url);
        if (!submittedUrl || !samePublicRepository(submittedUrl.url, current.repository)) return json({ error: "repository_cannot_change", code: "repository_immutable" }, 422);
        const normalizedInput = { ...submitted };
        const clear = new Set<string>();
        for (const field of ["summary", "defaultLocale"] as const) {
          if (normalizedInput[field] === null) {
            delete normalizedInput[field];
            clear.add(field);
          }
        }
        if (normalizedInput.type === null || normalizedInput.category === null) {
          if (normalizedInput.type !== null || normalizedInput.category !== null) return json({ error: "invalid_submission", code: "classification_pair_required" }, 422);
          delete normalizedInput.type;
          delete normalizedInput.category;
          clear.add("type");
          clear.add("category");
        }
        if (normalizedInput.versions && typeof normalizedInput.versions === "object" && !Array.isArray(normalizedInput.versions) && Object.keys(normalizedInput.versions).length === 0) {
          delete normalizedInput.versions;
          clear.add("versions");
        }
        const validation = validateSubmission(normalizedInput, parsedCurrent.url);
        if (validation.error) return json({ error: "invalid_submission", code: validation.error }, 422);
        if (validation.value.slug !== slug) return json({ error: "slug_cannot_change", code: "slug_immutable" }, 422);
        const updated: Record<string, unknown> = { ...(current.data ?? {}), ...validation.value, slug, repository: parsedCurrent.url };
        for (const field of clear) delete updated[field];
        if (JSON.stringify(updated) === JSON.stringify(current.data ?? {})) return json({ error: "no_changes", code: "registration_unchanged" }, 409);
        configYaml = stringifyYaml(updated);
      }
      const result = await requestRepositoryChange(env, token, repository, auth.row.github_id, slug, operation, configYaml, source.defaultBranch);
      return response(await result.response.text(), result.statusCode, result.response.headers);
    } catch {
      return json({ error: "registration_change_unavailable", code: "repository_change_failed" }, 502);
    }
  }

  const refreshRoute = /^\/api\/repositories\/([a-z0-9][a-z0-9-]{0,62})\/refresh$/.exec(url.pathname);
  if (refreshRoute && request.method === "POST") {
    const auth = await requireCsrf(request, env);
    if (auth instanceof Response) return auth;
    const slug = refreshRoute[1];
    let reservedRepoId: number | undefined;
    let reservedAt: number | undefined;
    try {
      const sourceToken = await publisherToken(env);
      const source = await readRepoDocsRegistrations(sourceToken);
      const config = source.configs.find((entry) => entry.slug === slug);
      if (!config) return json({ error: "registration_not_found", code: "registration_not_found" }, 404);
      const parsed = parseRepositoryUrl(config.repository);
      if (!parsed) return json({ error: "registration_invalid", code: "registration_repository_invalid" }, 409);
      const repository = await currentAdminRepository(auth, parsed);
      if (repository instanceof Response) return repository;
      const now = Math.floor(Date.now() / 1000);
      const cutoff = now - 10 * 60;
      const result = await env.DB.prepare("INSERT INTO repository_refreshes (github_repo_id, requester_github_id, requested_at) VALUES (?, ?, ?) ON CONFLICT(github_repo_id) DO UPDATE SET requester_github_id = excluded.requester_github_id, requested_at = excluded.requested_at WHERE repository_refreshes.requested_at <= ?")
        .bind(repository.id, auth.row.github_id, now, cutoff).run() as { meta?: { changes?: number } };
      if (result.meta?.changes === 0) return json({ error: "refresh_rate_limited", code: "refresh_rate_limited" }, 429);
      reservedRepoId = repository.id;
      reservedAt = now;
      const publisherAccessToken = await publisherToken(env, "write");
      const dispatch = await publisherRequest("/repos/Syrup-Studios/RepoDocs/actions/workflows/deploy-pages.yml/dispatches", publisherAccessToken, "POST", { ref: "main" });
      if (dispatch.status !== 200 && dispatch.status !== 204) throw new Error("Workflow dispatch failed");
      return json({ refresh: { status: "requested" } }, 202);
    } catch {
      if (reservedRepoId !== undefined && reservedAt !== undefined) {
        try {
          await env.DB.prepare("DELETE FROM repository_refreshes WHERE github_repo_id = ? AND requested_at = ?").bind(reservedRepoId, reservedAt).run();
        } catch {
          // Keep the dispatch error response stable if cleanup also fails.
        }
      }
      return json({ error: "refresh_unavailable", code: "workflow_dispatch_failed" }, 502);
    }
  }

  if (url.pathname === "/api/github/repositories" && request.method === "GET") {
    const auth = await sessionAccess(request, env);
    if (!auth) return json({ error: "unauthorized", code: "session_required" }, 401);
    try {
      const repos = await installationRepositories(auth.accessToken);
      return json({ repositories: repos.filter((repo) => !repo.private && !repo.archived).map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description,
        admin: repo.permissions?.admin === true,
        private: repo.private,
        archived: repo.archived,
      })) });
    } catch {
      return json({ error: "github_unavailable", code: "repository_list_failed" }, 502);
    }
  }

  if (url.pathname === "/api/repositories" && request.method === "GET") {
    const auth = await sessionAccess(request, env);
    if (!auth) return json({ error: "unauthorized", code: "session_required" }, 401);
    try {
      const [profileResponse, installedRepos, submissions, publisherAccessToken, manifest] = await Promise.all([
        githubGet("/user", auth.accessToken),
        installationRepositories(auth.accessToken),
        env.DB.prepare("SELECT * FROM repository_submissions WHERE requester_github_id = ? ORDER BY updated_at DESC LIMIT 100").bind(auth.row.github_id).all<SubmissionRow>(),
        publisherToken(env),
        readPublicationManifest(env.APP_ORIGIN),
      ]);
      if (!profileResponse.ok) throw new Error("Could not verify the current GitHub user");
      const profile = await profileResponse.json() as { id?: number; login?: string };
      if (profile.id !== auth.row.github_id || !profile.login) throw new Error("GitHub user identity changed");
      const source = await readRepoDocsRegistrations(publisherAccessToken);
      const deploymentFailed = manifest.siteSourceRevision !== source.sourceRevision
        && await latestDeployFailed(env, source.sourceRevision, source.defaultBranch);
      const changes = await env.DB.prepare("SELECT * FROM repository_changes WHERE status IN ('creating', 'pending_approval') ORDER BY updated_at DESC LIMIT 250").all<RepositoryChangeRow>();
      const reposByUrl = new Map<string, GitHubRepository>();
      const reposById = new Map<number, GitHubRepository>();
      for (const repository of installedRepos) {
        const key = normalizedRepository(repository.html_url) ?? normalizedRepository(`https://github.com/${repository.full_name}`);
        if (key) reposByUrl.set(key, repository);
        reposById.set(repository.id, repository);
      }
      const candidateRepos: GitHubRepository[] = [];
      for (const config of source.configs) {
        const key = normalizedRepository(config.repository);
        const repository = key ? reposByUrl.get(key) : undefined;
        if (repository) candidateRepos.push(repository);
      }
      for (const submission of submissions.results) {
        const repository = reposByUrl.get(submission.repo_full_name.toLowerCase());
        if (repository?.id === submission.github_repo_id) candidateRepos.push(repository);
      }
      for (const change of changes.results) {
        const repository = reposByUrl.get(change.repo_full_name.toLowerCase());
        if (repository?.id === change.github_repo_id) candidateRepos.push(repository);
      }
      const verifiedIds = await verifiedAdminRepositories(auth.accessToken, profile.login, candidateRepos);
      const results: Array<Record<string, unknown>> = [];
      const represented = new Set<number>();
      for (const config of source.configs) {
        const key = normalizedRepository(config.repository);
        const repository = key ? reposByUrl.get(key) : undefined;
        if (!repository || !verifiedIds.has(repository.id)) continue;
        const result = registrationResult(config, repository, manifest, null, source.sourceRevision);
        if (deploymentFailed && result.status === "publishing") result.status = "update_failed";
        const change = changes.results.find((item) => item.github_repo_id === repository.id && item.slug === config.slug);
        if (change) {
          if (change.pr_number) {
            const pull = await liveChangePullRequest(publisherAccessToken, change, source.defaultBranch);
            await updateChangeRow(env, change, pull.status, pull.prUrl, change.pr_number);
            if (pull.status === "pending_approval") {
              result.status = change.operation === "delete" ? "removal_pending" : "pending_approval";
              result.prUrl = pull.prUrl;
            } else if (pull.status === "merged") {
              result.status = "publishing";
              result.prUrl = pull.prUrl;
            }
          } else {
            result.status = "creating";
          }
        }
        results.push(result);
        represented.add(repository.id);
      }
      for (const submission of submissions.results) {
        if (represented.has(submission.github_repo_id) || submission.status === "rejected") continue;
        const repository = reposById.get(submission.github_repo_id);
        if (!repository || repository.full_name.toLowerCase() !== submission.repo_full_name.toLowerCase() || !verifiedIds.has(repository.id)) continue;
        const parsedConfig = parseYaml(submission.config_yaml) as Record<string, unknown> | null;
        const config: RegistrationConfig = {
          slug: submission.slug,
          name: submission.name,
          ...(typeof parsedConfig?.summary === "string" ? { summary: parsedConfig.summary } : {}),
          repository: `https://github.com/${submission.repo_full_name}`,
        };
        let status = submission.status;
        let prUrl: string | null = null;
        if (submission.pr_number) {
          const pull = await livePullRequest(publisherAccessToken, submission);
          status = pull.status;
          prUrl = pull.prUrl;
        } else if (submission.status !== "creating") {
          status = "closed";
        }
        const published = manifest.siteSourceRevision === source.sourceRevision
          ? manifest.projects.find((project) => project.slug === config.slug && samePublicRepository(project.repositoryUrl, config.repository))
          : undefined;
        if (status === "publishing" || published) {
          results.push({ ...registrationResult(config, repository, manifest, prUrl, source.sourceRevision), status: published ? "published" : deploymentFailed ? "update_failed" : "publishing" });
        } else {
          results.push({
            slug: submission.slug,
            name: submission.name,
            description: config.summary ?? repository.description,
            repositoryUrl: repository.html_url,
            status,
            documentationUrl: null,
            sourceRevision: null,
            latestPublishedAt: null,
            admin: true,
            prUrl,
            createdAt: submission.created_at,
            updatedAt: submission.updated_at,
          });
        }
        represented.add(repository.id);
      }
      return json({ repositories: results, siteSourceRevision: manifest.siteSourceRevision });
    } catch {
      return json({ error: "registration_status_unavailable", code: "repository_status_failed" }, 502);
    }
  }

  if (url.pathname === "/api/repositories/validate" && request.method === "POST") {
    const auth = await requireCsrf(request, env);
    if (auth instanceof Response) return auth;
    const length = Number(request.headers.get("Content-Length") ?? 0);
    if (length > 4096) return json({ error: "request_too_large", code: "body_too_large" }, 413);
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return json({ error: "invalid_request", code: "json_required" }, 400);
    const body = await limitedBody(request, 4096);
    if (body === null) return json({ error: "request_too_large", code: "body_too_large" }, 413);
    let input: { url?: unknown };
    try {
      const parsedBody: unknown = JSON.parse(body);
      if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) return json({ error: "invalid_request", code: "invalid_json" }, 400);
      input = parsedBody as { url?: unknown };
    } catch {
      return json({ error: "invalid_request", code: "invalid_json" }, 400);
    }
    const parsed = parseRepositoryUrl(input.url);
    if (!parsed) return json({ error: "invalid_repository_url", code: "unsupported_repository_url" }, 400);

    try {
      const preflight = await repositoryPreflight(parsed, auth);
      if (preflight instanceof Response) return preflight;
      const { repository, docs } = preflight;
      return json({
        valid: true,
        repository: { id: repository.id, fullName: repository.full_name, url: repository.html_url, defaultBranch: repository.default_branch },
        admin: true,
        docs,
      });
    } catch {
      return json({ error: "github_unavailable", code: "repository_validation_failed" }, 502);
    }
  }

  if (url.pathname === "/api/repositories" && request.method === "POST") {
    const auth = await requireCsrf(request, env);
    if (auth instanceof Response) return auth;
    if (Number(request.headers.get("Content-Length") ?? 0) > 4096) return json({ error: "request_too_large", code: "body_too_large" }, 413);
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return json({ error: "invalid_request", code: "json_required" }, 400);
    const body = await limitedBody(request, 4096);
    if (body === null) return json({ error: "request_too_large", code: "body_too_large" }, 413);
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return json({ error: "invalid_request", code: "invalid_json" }, 400);
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid_request", code: "invalid_schema" }, 422);
    const source = input as Record<string, unknown>;
    const parsed = parseRepositoryUrl(source.url);
    if (!parsed) return json({ error: "invalid_repository_url", code: "unsupported_repository_url" }, 422);
    const validation = validateSubmission(input, parsed.url);
    if (validation.error) return json({ error: "invalid_submission", code: validation.error }, 422);

    let submissionId: string | undefined;
    try {
      const preflight = await repositoryPreflight(parsed, auth);
      if (preflight instanceof Response) return preflight;
      const { repository } = preflight;
      const yaml = submissionYaml(validation.value);
      const existing = await env.DB.prepare("SELECT * FROM repository_submissions WHERE github_repo_id = ? OR slug = ? LIMIT 1").bind(repository.id, validation.value.slug).first<SubmissionRow>();
      let row = existing;
      if (existing && (existing.github_repo_id !== repository.id || existing.slug !== validation.value.slug || existing.requester_github_id !== auth.row.github_id)) {
        return json({ error: "registration_exists", code: "repository_or_slug_already_registered" }, 409);
      }
      if (existing && existing.config_yaml !== yaml) return json({ error: "registration_exists", code: "submission_payload_changed" }, 409);
      if (existing?.status === "pending_approval") {
        const token = existing.pr_number ? await publisherToken(env) : undefined;
        const autoMergeStatus = token && existing.pr_number ? await requestAutoMerge(env, token, existing.pr_number) : undefined;
        return json({ registration: { slug: existing.slug, status: existing.status, prUrl: existing.pr_url, ...autoMergeFields(autoMergeStatus) } });
      }
      if (existing?.status === "closed" || existing?.status === "rejected") return json({ error: "registration_closed", code: "registration_not_active" }, 409);
      if (!row) {
        const id = randomToken(18);
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare("INSERT OR IGNORE INTO repository_submissions (id, github_repo_id, repo_full_name, requester_github_id, slug, name, config_yaml, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?)")
          .bind(id, repository.id, repository.full_name, auth.row.github_id, validation.value.slug, validation.value.name, yaml, now, now).run();
        row = await env.DB.prepare("SELECT * FROM repository_submissions WHERE github_repo_id = ? OR slug = ? LIMIT 1").bind(repository.id, validation.value.slug).first<SubmissionRow>();
      }
      if (!row || row.github_repo_id !== repository.id || row.slug !== validation.value.slug || row.requester_github_id !== auth.row.github_id) {
        return json({ error: "registration_exists", code: "repository_or_slug_already_registered" }, 409);
      }
      submissionId = row.id;
      if (row.status === "pending_approval") {
        const token = row.pr_number ? await publisherToken(env) : undefined;
        const autoMergeStatus = token && row.pr_number ? await requestAutoMerge(env, token, row.pr_number) : undefined;
        return json({ registration: { slug: row.slug, status: row.status, prUrl: row.pr_url, ...autoMergeFields(autoMergeStatus) } });
      }
      if (row.status === "closed" || row.status === "rejected") return json({ error: "registration_closed", code: "registration_not_active" }, 409);

      const publication = await createRegistration(env, row, row.config_yaml);
      const updatedAt = Math.floor(Date.now() / 1000);
      await env.DB.prepare("UPDATE repository_submissions SET status = ?, pr_url = ?, pr_number = ?, updated_at = ? WHERE id = ?").bind(publication.status, publication.prUrl, publication.prNumber, updatedAt, row.id).run();
      if (publication.status === "closed") return json({ error: "registration_closed", code: "registration_pull_request_closed" }, 409);
      return json({ registration: { slug: row.slug, status: "pending_approval", prUrl: publication.prUrl, ...autoMergeFields(publication.autoMergeStatus) } }, 201);
    } catch (error) {
      if (error instanceof Error && ["slug_already_published", "repository_already_published"].includes(error.message)) {
        if (submissionId) await env.DB.prepare("UPDATE repository_submissions SET status = 'rejected', updated_at = ? WHERE id = ?").bind(Math.floor(Date.now() / 1000), submissionId).run();
        return json({ error: "registration_exists", code: error.message }, 409);
      }
      return json({ error: "registration_unavailable", code: "pull_request_creation_failed" }, 502);
    }
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (origin && origin !== env.APP_ORIGIN) return json({ error: "origin_not_allowed" }, 403);
    const result = await handle(request, env);
    if (origin === env.APP_ORIGIN) {
      result.headers.set("Access-Control-Allow-Origin", env.APP_ORIGIN);
      result.headers.set("Access-Control-Allow-Credentials", "true");
      result.headers.set("Vary", "Origin");
    }
    return result;
  },
};
