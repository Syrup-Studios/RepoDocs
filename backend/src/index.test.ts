import { afterEach, describe, expect, test } from "bun:test";
import worker from "./index";

const origin = "https://docs.example.com";
const sessionId = "opaque-session-value";
const csrfToken = "csrf-value";
const encryptionSecret = btoa("12345678901234567890123456789012");

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class MockDatabase {
  row: Record<string, unknown> | null;
  submissions: Record<string, unknown>[] = [];
  changes: Record<string, unknown>[] = [];
  refreshes = new Map<number, { requester_github_id: number; requested_at: number }>();
  deleted = false;

  constructor(row: Record<string, unknown> | null = null) {
    this.row = row;
  }

  prepare(query: string) {
    let values: unknown[] = [];
    return {
      bind: (...args: unknown[]) => {
        values = args;
        return this.prepareBound(query, () => values);
      },
      first: async <T>() => null as T | null,
      all: async <T>() => ({ results: (query.includes("repository_changes")
        ? this.changes.filter((change) => ["creating", "pending_approval"].includes(String(change.status)))
        : query.includes("repository_submissions") ? this.submissions : []) as T[] }),
      run: async () => ({}),
    };
  }

  private prepareBound(query: string, params: () => unknown[]) {
    return {
      bind: (...args: unknown[]) => {
        params = () => args;
        return this.prepareBound(query, params);
      },
      first: async <T>() => {
        const values = params();
        if (query.includes("SELECT csrf_hash") && !this.deleted && this.row && (this.row.expires_at as number) > Number(values[1])) {
          return { csrf_hash: this.row.csrf_hash } as T;
        }
        if (query.includes("SELECT * FROM sessions") && !this.deleted && this.row && (this.row.expires_at as number) > Number(values[1])) return this.row as T;
        if (query.includes("SELECT * FROM repository_submissions")) {
          if (query.includes("github_repo_id = ? AND status")) return (this.submissions.find((submission) => submission.github_repo_id === values[0] && ["creating", "pending_approval"].includes(String(submission.status))) ?? null) as T | null;
          return (this.submissions.find((submission) => submission.github_repo_id === values[0] || submission.slug === values[1]) ?? null) as T | null;
        }
        if (query.includes("SELECT * FROM repository_changes")) {
          return (this.changes.find((change) => change.slug === values[0] && (!query.includes("requester_github_id = ?") || change.requester_github_id === values[1]) && (!query.includes("status IN") || ["creating", "pending_approval"].includes(String(change.status)))) ?? null) as T | null;
        }
        return null;
      },
      all: async <T>() => ({ results: (query.includes("repository_changes")
        ? this.changes.filter((change) => ["creating", "pending_approval"].includes(String(change.status)))
        : query.includes("repository_submissions") ? this.submissions.filter((submission) => submission.requester_github_id === params()[0]) : []) as T[] }),
      run: async () => {
        if (query.includes("DELETE FROM sessions") && this.row) this.deleted = true;
        if (query.includes("INSERT OR IGNORE INTO repository_submissions")) {
          const values = params();
          if (!this.submissions.some((submission) => submission.github_repo_id === values[1] || submission.slug === values[4])) this.submissions.push({
            id: values[0], github_repo_id: values[1], repo_full_name: values[2], requester_github_id: values[3], slug: values[4], name: values[5], config_yaml: values[6], status: "creating", pr_url: null, pr_number: null, created_at: values[7], updated_at: values[8],
          });
        }
        if (query.includes("UPDATE repository_submissions")) {
          const values = params();
          const submission = this.submissions.find((item) => item.id === values[4]);
          if (submission && query.includes("SET status = 'rejected'")) Object.assign(submission, { status: "rejected", updated_at: values[0] });
          else if (submission) Object.assign(submission, { status: values[0], pr_url: values[1], pr_number: values[2], updated_at: values[3] });
        }
        if (query.includes("INSERT OR IGNORE INTO repository_changes")) {
          const values = params();
          if (!this.changes.some((change) => change.slug === values[1] && ["creating", "pending_approval"].includes(String(change.status)))) this.changes.push({
            id: values[0], slug: values[1], github_repo_id: values[2], repo_full_name: values[3], requester_github_id: values[4], operation: values[5], config_yaml: values[6], payload_hash: values[7], branch: values[8], status: "creating", pr_url: null, pr_number: null, created_at: values[9], updated_at: values[10],
          });
          return {};
        }
        if (query.includes("UPDATE repository_changes")) {
          const values = params();
          const change = this.changes.find((item) => item.id === values[4]);
          if (change) Object.assign(change, { status: values[0], pr_url: values[1], pr_number: values[2], updated_at: values[3] });
          return {};
        }
        if (query.includes("INSERT INTO repository_refreshes")) {
          const values = params();
          const previous = this.refreshes.get(Number(values[0]));
          if (previous && previous.requested_at > Number(values[3])) return { meta: { changes: 0 } };
          this.refreshes.set(Number(values[0]), { requester_github_id: Number(values[1]), requested_at: Number(values[2]) });
          return { meta: { changes: 1 } };
        }
        if (query.includes("DELETE FROM repository_refreshes")) {
          this.refreshes.delete(Number(params()[0]));
          return {};
        }
        return {};
      },
    };
  }
}

function env(db: MockDatabase, overrides: Record<string, string> = {}) {
  return { DB: db, GITHUB_CLIENT_ID: "client", GITHUB_CLIENT_SECRET: "secret", APP_ORIGIN: origin, SESSION_ENCRYPTION_KEY: encryptionSecret, ...overrides } as never;
}

async function encrypt(value: string): Promise<string> {
  const raw = Uint8Array.from(atob(encryptionSecret), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  const bytes = new Uint8Array(iv.length + ciphertext.length);
  bytes.set(iv);
  bytes.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...bytes));
}

async function publisherSecrets(): Promise<Record<string, string>> {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const key = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return {
    PUBLISHER_APP_ID: "12345",
    PUBLISHER_INSTALLATION_ID: "67890",
    PUBLISHER_PRIVATE_KEY_PKCS8: btoa(String.fromCharCode(...key)),
  };
}

async function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id_hash: "session-hash",
    github_id: 123,
    login: "octocat",
    avatar_url: "https://avatars.example.com/1",
    access_token: await encrypt("access-token"),
    refresh_token: await encrypt("refresh-token"),
    access_expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_expires_at: Math.floor(Date.now() / 1000) + 7200,
    csrf_hash: "",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("auth security", () => {
  test("rejects an OAuth callback with invalid state before contacting GitHub", async () => {
    globalThis.fetch = (() => { throw new Error("unexpected GitHub request"); }) as typeof fetch;
    const request = new Request("https://api.example.com/auth/github/callback?state=wrong&code=code", {
      headers: { Cookie: "oauth_state=expected; oauth_verifier=verifier" },
    });
    const response = await worker.fetch(request, env(new MockDatabase()));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(origin);
    expect(response.headers.get("Set-Cookie")).toContain("oauth_state=;");
  });

  test("clears OAuth cookies when GitHub returns a token error", async () => {
    globalThis.fetch = (async () => Response.json({ error: "bad_verification_code" })) as typeof fetch;
    const request = new Request("https://api.example.com/auth/github/callback?state=expected&code=code", {
      headers: { Cookie: "oauth_state=expected; oauth_verifier=verifier" },
    });
    const response = await worker.fetch(request, env(new MockDatabase()));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(origin);
    expect(response.headers.get("Set-Cookie")).toContain("oauth_verifier=;");
  });

  test("rejects logout without the exact Origin", async () => {
    const db = new MockDatabase(await sessionRow());
    const response = await worker.fetch(new Request("https://api.example.com/auth/logout", { method: "POST" }), env(db));
    expect(response.status).toBe(403);
    expect(db.deleted).toBe(false);
  });

  test("rejects logout with a missing or invalid CSRF token", async () => {
    const row = await sessionRow({ csrf_hash: await sha256(csrfToken) });
    for (const csrf of [null, "wrong-token"]) {
      const db = new MockDatabase(row);
      const headers = new Headers({ Origin: origin, Cookie: `session=${sessionId}` });
      if (csrf) headers.set("X-CSRF-Token", csrf);
      const response = await worker.fetch(new Request("https://api.example.com/auth/logout", { method: "POST", headers }), env(db));
      expect(response.status).toBe(403);
      expect(db.deleted).toBe(false);
    }
  });

  test("rejects an expired session", async () => {
    const db = new MockDatabase(await sessionRow({ expires_at: Math.floor(Date.now() / 1000) - 1 }));
    const response = await worker.fetch(new Request("https://api.example.com/api/me", { headers: { Cookie: `session=${sessionId}` } }), env(db));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ user: null });
  });

  test("revokes a session after valid logout", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    const logout = await worker.fetch(new Request("https://api.example.com/auth/logout", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken },
    }), env(db));
    expect(logout.status).toBe(200);
    expect(logout.headers.get("Set-Cookie")).toContain("session=;");
    expect(db.deleted).toBe(true);
    const me = await worker.fetch(new Request("https://api.example.com/api/me", { headers: { Cookie: `session=${sessionId}` } }), env(db));
    expect(me.status).toBe(401);
  });

  test("rejects non-GitHub and non-root repository URLs before GitHub requests", async () => {
    globalThis.fetch = (() => { throw new Error("untrusted URL reached network"); }) as typeof fetch;
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    for (const url of ["http://github.com/octocat/repo", "https://github.com.evil.test/octocat/repo", "https://127.0.0.1/octocat/repo", "https://github.com/octocat/repo/tree/main"]) {
      const response = await worker.fetch(new Request("https://api.example.com/api/repositories/validate", {
        method: "POST",
        headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }), env(db));
      expect(response.status).toBe(400);
      expect((await response.json() as { code: string }).code).toBe("unsupported_repository_url");
    }
  });

  test("requires CSRF before validating a repository URL", async () => {
    globalThis.fetch = (() => { throw new Error("CSRF rejected request reached GitHub"); }) as typeof fetch;
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories/validate", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo" }),
    }), env(db));
    expect(response.status).toBe(403);
    expect((await response.json() as { code: string }).code).toBe("csrf_required");
  });

  test("rejects a request body above the size limit before GitHub requests", async () => {
    globalThis.fetch = (() => { throw new Error("oversized request reached GitHub"); }) as typeof fetch;
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories/validate", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo", extra: "x".repeat(5000) }),
    }), env(db));
    expect(response.status).toBe(413);
    expect((await response.json() as { code: string }).code).toBe("body_too_large");
  });

  test("validates only a public repository installed for the app and reports docs preflight", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/user/installations") return Response.json({ total_count: 1, installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ total_count: 1, repositories: [{ id: 44 }] });
      if (url.pathname === "/repos/octocat/repo/contents/docs/") return Response.json([{ name: "index.md", type: "file" }]);
      if (url.pathname === "/repos/octocat/repo/contents/docs/repodocs.yml") return Response.json({ encoding: "base64", size: 54, content: btoa("name: Example Project\nsummary: Example summary\ndefaultLocale: de\nversions:\n  v2: release/v2\n") });
      throw new Error(`unexpected GitHub URL: ${url}`);
    }) as typeof fetch;
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories/validate", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo/" }),
    }), env(db));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      valid: true,
      repository: { id: 44, fullName: "octocat/repo", url: "https://github.com/octocat/repo", defaultBranch: "main" },
      admin: true,
      docs: { exists: true, pageFound: true, metadata: { name: "Example Project", summary: "Example summary", defaultLocale: "de", versions: { v2: "release/v2" } } },
    });
  });

  test("rejects a repository without docs/ during validation preflight", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [{ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", description: null, private: false, archived: false, permissions: { admin: true } }] });
      if (url.pathname === "/repos/octocat/repo/contents/docs/") return new Response(null, { status: 404 });
      throw new Error(`unexpected GitHub URL: ${url}`);
    }) as typeof fetch;
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories/validate", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo" }),
    }), env(db));
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe("docs_directory_missing");
  });

  test("rejects malformed documentation YAML with a clear validation error", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [{ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, permissions: { admin: true } }] });
      if (url.pathname === "/repos/octocat/repo/contents/docs/") return Response.json([{ name: "index.md", type: "file" }]);
      if (url.pathname === "/repos/octocat/repo/contents/docs/repodocs.yml") return Response.json({ encoding: "base64", size: 12, content: btoa("schema: \"1\"\n") });
      throw new Error(`unexpected GitHub URL: ${url}`);
    }) as typeof fetch;
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories/validate", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo" }),
    }), env(db));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "documentation_config_invalid", code: "invalid_documentation_config", message: "docs/repodocs.yml must use numeric schema: 1." });
  });

  test("rejects a docs directory without a supported Markdown page", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [{ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, permissions: { admin: true } }] });
      if (url.pathname === "/repos/octocat/repo/contents/docs/") return Response.json([{ name: "repodocs.yml", type: "file" }, { name: "assets", type: "dir" }]);
      if (url.pathname === "/repos/octocat/repo/contents/docs/repodocs.yml") return new Response(null, { status: 404 });
      if (url.pathname === "/repos/octocat/repo/contents/docs/assets") return Response.json([{ name: "image.png", type: "file" }]);
      if (url.pathname === "/repos/octocat/repo/contents/docs/docs") return new Response(null, { status: 404 });
      throw new Error(`unexpected GitHub URL: ${url}`);
    }) as typeof fetch;
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories/validate", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo" }),
    }), env(db));
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe("docs_page_missing");
  });

  test("rejects a repository that is not in any accessible app installation", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [] });
      throw new Error(`unexpected GitHub URL: ${url}`);
    }) as typeof fetch;
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories/validate", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo" }),
    }), env(db));
    expect(response.status).toBe(403);
    expect((await response.json() as { code: string }).code).toBe("repository_not_installed");
  });

  test("rejects a repository when the authenticated user is not an admin", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "write" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [{ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", description: null, private: false, archived: false, permissions: { admin: true } }] });
      throw new Error(`unexpected GitHub URL: ${url}`);
    }) as typeof fetch;
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories/validate", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo" }),
    }), env(db));
    expect(response.status).toBe(403);
    expect((await response.json() as { code: string }).code).toBe("repository_admin_required");
  });

  test("opens one pending registration pull request through the fixed publisher target", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    const secrets = await publisherSecrets();
    let publisherTokens = 0;
    let contentWrites = 0;
    let pullRequests = 0;
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      if (url.hostname === "docs.example.com" && url.pathname === "/publication.json") return Response.json({ siteSourceRevision: "site-commit", projects: [] });
      if (url.pathname === "/user") return Response.json({ id: 123, login: "octocat" });
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [{ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", description: null, private: false, archived: false, permissions: { admin: true } }] });
      if (url.pathname === "/repos/octocat/repo/contents/docs/") return Response.json([{ name: "index.md", type: "file" }]);
      if (url.pathname === "/repos/octocat/repo/contents/docs/repodocs.yml") return new Response(null, { status: 404 });
      if (url.pathname === "/app/installations/67890/access_tokens") {
        publisherTokens += 1;
        const body = JSON.parse(String(init?.body)) as { repositories: string[]; permissions: Record<string, string> };
        expect(body).toEqual({ repositories: ["RepoDocs"], permissions: { contents: "write", pull_requests: "write" } });
        return Response.json({ token: "publisher-token" }, { status: 201 });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs") return Response.json({ default_branch: "main" });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/trees/main") return Response.json({ tree: [] });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/ref/heads/main") return Response.json({ object: { sha: "base-sha" } });
      if (url.pathname.startsWith("/repos/Syrup-Studios/RepoDocs/git/ref/heads/")) {
        if (method === "GET") return new Response(null, { status: 404 });
        return Response.json({ ref: "refs/heads/repo-registration-widget-" }, { status: 201 });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/refs" && method === "POST") return Response.json({ ref: "refs/heads/repo-registration-widget" }, { status: 201 });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/contents/repositories/widget.yml") {
        if (method === "GET") return new Response(null, { status: 404 });
        contentWrites += 1;
        return Response.json({ content: { path: "repositories/widget.yml" } }, { status: 201 });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/pulls" && method === "GET") return Response.json([]);
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/pulls" && method === "POST") {
        pullRequests += 1;
        const body = JSON.parse(String(init?.body)) as { head: string; base: string };
        expect(body.head).toContain("repo-registration-widget-");
        expect(body.base).toBe("main");
        return Response.json({ number: 91, html_url: "https://github.com/Syrup-Studios/RepoDocs/pull/91" }, { status: 201 });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/pulls/91") {
        const row = db.submissions[0];
        return Response.json({
          number: 91,
          html_url: "https://github.com/Syrup-Studios/RepoDocs/pull/91",
          state: "open",
          head: { ref: `repo-registration-widget-${String(row?.id).slice(0, 8)}`, repo: { full_name: "Syrup-Studios/RepoDocs" } },
          base: { ref: "main", repo: { full_name: "Syrup-Studios/RepoDocs" } },
        });
      }
      throw new Error(`unexpected GitHub URL: ${method} ${url}`);
    }) as typeof fetch;

    const request = (name = "Widget") => new Request("https://api.example.com/api/repositories", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo", name, slug: "widget", summary: "A widget" }),
    });
    const first = await worker.fetch(request(), env(db, secrets));
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ registration: { slug: "widget", status: "pending_approval", prUrl: "https://github.com/Syrup-Studios/RepoDocs/pull/91" } });
    const second = await worker.fetch(request(), env(db, secrets));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ registration: { slug: "widget", status: "pending_approval", prUrl: "https://github.com/Syrup-Studios/RepoDocs/pull/91" } });
    const changed = await worker.fetch(request("Changed name"), env(db, secrets));
    expect(changed.status).toBe(409);
    expect((await changed.json() as { code: string }).code).toBe("submission_payload_changed");
    expect(publisherTokens).toBe(2);
    expect(contentWrites).toBe(1);
    expect(pullRequests).toBe(1);
    expect(db.submissions[0]?.status).toBe("pending_approval");
    expect(db.submissions[0]?.config_yaml).toContain("repository: \"https://github.com/octocat/repo\"");
    const listing = await worker.fetch(new Request("https://api.example.com/api/repositories", { headers: { Cookie: `session=${sessionId}` } }), env(db, secrets));
    expect(listing.status).toBe(200);
    expect(await listing.json()).toEqual({
      repositories: [{ slug: "widget", name: "Widget", description: "A widget", repositoryUrl: "https://github.com/octocat/repo", status: "pending_approval", documentationUrl: null, sourceRevision: null, latestPublishedAt: null, admin: true, prUrl: "https://github.com/Syrup-Studios/RepoDocs/pull/91", createdAt: db.submissions[0]?.created_at, updatedAt: db.submissions[0]?.updated_at }],
      siteSourceRevision: "site-commit",
    });
  });

  test("reports failed updates only for a completed deploy run on the current main SHA", async () => {
    const db = new MockDatabase(await sessionRow());
    const secrets = await publisherSecrets();
    let siteSourceRevision = "site-commit";
    let failedDeploy = false;
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "docs.example.com" && url.pathname === "/publication.json") return Response.json({
        siteSourceRevision,
        publishedAt: "2026-10-24T12:00:00.000Z",
        projects: [
          { slug: "matching", repositoryUrl: "https://github.com/octocat/repo", sourceRevision: "repo-commit", documentationUrl: "https://docs.example.com/matching/", iconUrl: "/repository-favicons/matching.png" },
          { slug: "wrong-url", repositoryUrl: "https://github.com/different/repo", sourceRevision: "repo-commit", documentationUrl: "https://docs.example.com/wrong-url/" },
        ],
      });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/actions/workflows/deploy-pages.yml/runs") {
        expect(url.searchParams.get("branch")).toBe("main");
        expect(url.searchParams.get("head_sha")).toBe("site-commit");
        return Response.json({ workflow_runs: failedDeploy ? [{ head_sha: "site-commit", status: "completed", conclusion: "failure", run_number: 4 }] : [] });
      }
      if (url.pathname === "/user") return Response.json({ id: 123, login: "octocat" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [
        { id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", description: null, private: false, archived: false, permissions: { admin: true } },
        { id: 45, full_name: "other/repo", html_url: "https://github.com/other/repo", description: "Other", private: false, archived: false, permissions: { admin: true } },
      ] });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission" || url.pathname === "/repos/other/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/app/installations/67890/access_tokens") return Response.json({ token: "publisher-token" }, { status: 201 });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs") return Response.json({ default_branch: "main" });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/ref/heads/main") return Response.json({ object: { sha: "site-commit" } });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/trees/main") return Response.json({ tree: [
        { type: "blob", path: "repositories/matching.yml" },
        { type: "blob", path: "repositories/wrong-url.yml" },
      ] });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/contents/repositories/matching.yml") return Response.json({ encoding: "base64", content: btoa("name: Matching\nslug: matching\nrepository: https://github.com/octocat/repo\n") });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/contents/repositories/wrong-url.yml") return Response.json({ encoding: "base64", content: btoa("name: Other\nslug: wrong-url\nrepository: https://github.com/other/repo\n") });
      throw new Error(`unexpected GitHub request: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(new Request("https://api.example.com/api/repositories", { headers: { Cookie: `session=${sessionId}` } }), env(db, secrets));
    expect(response.status).toBe(200);
    const body = await response.json() as { repositories: Array<Record<string, unknown>> };
    expect(body.repositories).toEqual([
      { slug: "matching", name: "Matching", description: null, repositoryUrl: "https://github.com/octocat/repo", status: "published", documentationUrl: "https://docs.example.com/matching/", sourceRevision: "repo-commit", latestPublishedAt: "2026-10-24T12:00:00.000Z", iconUrl: "/repository-favicons/matching.png", admin: true, prUrl: null },
      { slug: "wrong-url", name: "Other", description: "Other", repositoryUrl: "https://github.com/other/repo", status: "publishing", documentationUrl: null, sourceRevision: null, latestPublishedAt: null, admin: true, prUrl: null },
    ]);
    expect(body.repositories.some((entry) => entry.slug === "wrong-url" && entry.status === "published")).toBe(false);
    siteSourceRevision = "older-site-commit";
    const stale = await worker.fetch(new Request("https://api.example.com/api/repositories", { headers: { Cookie: `session=${sessionId}` } }), env(db, secrets));
    const staleBody = await stale.json() as { repositories: Array<{ slug: string; status: string; documentationUrl?: string | null }> };
    expect(staleBody.repositories.find((entry) => entry.slug === "matching")?.status).toBe("publishing");
    expect(staleBody.repositories.find((entry) => entry.slug === "matching")?.documentationUrl).toBe("https://docs.example.com/matching/");
    failedDeploy = true;
    const failed = await worker.fetch(new Request("https://api.example.com/api/repositories", { headers: { Cookie: `session=${sessionId}` } }), env(db, secrets));
    const failedBody = await failed.json() as { repositories: Array<{ slug: string; status: string }> };
    expect(failedBody.repositories.find((entry) => entry.slug === "matching")?.status).toBe("update_failed");
    expect(failedBody.repositories.find((entry) => entry.slug === "wrong-url")?.status).toBe("update_failed");
  });

  test("opens an idempotent edit pull request for only the existing registration file", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    const secrets = await publisherSecrets();
    const oldYaml = "name: Sample\nslug: sample\nsummary: Old summary\nrepository: https://github.com/octocat/repo\nextraField: keep\n";
    let writes = 0;
    let pullRequests = 0;
    let branch = "";
    let autoMergeEnabled = false;
    let autoMergeMutations = 0;
    let removals = 0;
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      if (url.hostname === "docs.example.com" && url.pathname === "/publication.json") return Response.json({ siteSourceRevision: "base-sha", projects: [] });
      if (url.pathname === "/graphql") {
        const body = JSON.parse(String(init?.body)) as { query: string };
        if (body.query.startsWith("mutation")) {
          autoMergeMutations += 1;
          if (autoMergeMutations === 1) return Response.json({ errors: [{ message: "auto-merge is disabled" }] });
          autoMergeEnabled = true;
          return Response.json({ data: { enablePullRequestAutoMerge: { pullRequest: { autoMergeRequest: { id: "auto-merge-id" } } } } });
        }
        return Response.json({ data: { repository: { pullRequest: { id: "pull-node-id", autoMergeRequest: autoMergeEnabled ? { id: "auto-merge-id" } : null } } } });
      }
      if (url.pathname === "/app/installations/67890/access_tokens") return Response.json({ token: "publisher-token" }, { status: 201 });
      if (url.pathname === "/user") return Response.json({ id: 123, login: "octocat" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [{ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, permissions: { admin: true } }] });
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs") return Response.json({ default_branch: "main" });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/ref/heads/main") return Response.json({ object: { sha: "site-commit" } });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/trees/main") return Response.json({ tree: [{ type: "blob", path: "repositories/sample.yml" }] });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/contents/repositories/sample.yml" && method === "GET") {
        if (url.searchParams.get("ref") === "main") return Response.json({ encoding: "base64", content: btoa(oldYaml), sha: "main-file-sha" });
        return Response.json({ encoding: "base64", content: btoa(oldYaml), sha: "branch-file-sha" });
      }
      if (url.pathname.startsWith("/repos/Syrup-Studios/RepoDocs/git/ref/heads/")) {
        if (url.pathname.endsWith("/main")) return Response.json({ object: { sha: "base-sha" } });
        if (method === "GET") {
          branch = url.pathname.split("/").at(-1) ?? "";
          return new Response(null, { status: 404 });
        }
        return Response.json({ ref: "refs/heads/branch" }, { status: 201 });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/refs" && method === "POST") {
        branch = (JSON.parse(String(init?.body)) as { ref: string }).ref.split("/").at(-1) ?? "";
        return Response.json({ ref: `refs/heads/${branch}` }, { status: 201 });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/contents/repositories/sample.yml" && method === "PUT") {
        writes += 1;
        const body = JSON.parse(String(init?.body)) as { content: string; branch: string; sha: string };
        expect(body.branch).toBe(branch);
        expect(body.sha).toBe("branch-file-sha");
        const decoded = new TextDecoder().decode(Uint8Array.from(atob(body.content), (char) => char.charCodeAt(0)));
        expect(decoded).toContain("extraField: keep");
        expect(decoded).toContain("name: Updated");
        expect(decoded.includes("Old summary")).toBe(false);
        return Response.json({ content: { path: "repositories/sample.yml" } }, { status: 200 });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/contents/repositories/sample.yml" && method === "DELETE") {
        removals += 1;
        const body = JSON.parse(String(init?.body)) as { branch: string; sha: string };
        expect(body.branch).toBe(branch);
        expect(body.sha).toBe("branch-file-sha");
        return Response.json({ commit: { sha: "delete-commit" } });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/pulls" && method === "GET") return Response.json([]);
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/pulls" && method === "POST") {
        pullRequests += 1;
        const body = JSON.parse(String(init?.body)) as { head: string; base: string };
        expect(body.head).toBe(branch);
        expect(body.base).toBe("main");
        return Response.json({ number: 301, html_url: "https://github.com/Syrup-Studios/RepoDocs/pull/301" }, { status: 201 });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/pulls/301") return Response.json({
        html_url: "https://github.com/Syrup-Studios/RepoDocs/pull/301",
        state: "open",
        head: { ref: branch, repo: { full_name: "Syrup-Studios/RepoDocs" } },
        base: { ref: "main", repo: { full_name: "Syrup-Studios/RepoDocs" } },
      });
      throw new Error(`unexpected GitHub request: ${method} ${url}`);
    }) as typeof fetch;
    const request = () => new Request("https://api.example.com/api/repositories/sample", {
      method: "PATCH",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo", name: "Updated", slug: "sample", summary: null }),
    });

    const first = await worker.fetch(request(), env(db, { ...secrets, AUTO_APPROVE_VERIFIED_REPOSITORIES: "true" }));
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ registration: { slug: "sample", operation: "edit", status: "pending_approval", prUrl: "https://github.com/Syrup-Studios/RepoDocs/pull/301", autoMergeStatus: "unavailable", autoMergeMessage: "The pull request remains open because GitHub could not enable auto-merge." } });
    const retry = await worker.fetch(request(), env(db, { ...secrets, AUTO_APPROVE_VERIFIED_REPOSITORIES: "true" }));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ registration: { slug: "sample", operation: "edit", status: "pending_approval", prUrl: "https://github.com/Syrup-Studios/RepoDocs/pull/301", autoMergeStatus: "requested" } });
    expect(writes).toBe(1);
    expect(pullRequests).toBe(1);
    expect(autoMergeMutations).toBe(2);
    expect(db.changes.length).toBe(1);
    const listing = await worker.fetch(new Request("https://api.example.com/api/repositories", { headers: { Cookie: `session=${sessionId}` } }), env(db, secrets));
    expect(listing.status).toBe(200);
    const listingBody = await listing.json() as { repositories: Array<{ slug: string; status: string; prUrl: string }> };
    expect(listingBody.repositories[0]?.status).toBe("pending_approval");
    expect(listingBody.repositories[0]?.prUrl).toBe("https://github.com/Syrup-Studios/RepoDocs/pull/301");
    db.changes[0]!.status = "closed";
    const removal = await worker.fetch(new Request("https://api.example.com/api/repositories/sample", {
      method: "DELETE",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    }), env(db, secrets));
    expect(removal.status).toBe(201);
    expect(await removal.json()).toEqual({ registration: { slug: "sample", operation: "delete", status: "pending_approval", prUrl: "https://github.com/Syrup-Studios/RepoDocs/pull/301" } });
    expect(removals).toBe(1);
    const removalListing = await worker.fetch(new Request("https://api.example.com/api/repositories", { headers: { Cookie: `session=${sessionId}` } }), env(db, secrets));
    const removalBody = await removalListing.json() as { repositories: Array<{ status: string }> };
    expect(removalBody.repositories[0]?.status).toBe("removal_pending");
  });

  test("requires explicit delete confirmation before any GitHub request", async () => {
    globalThis.fetch = (() => { throw new Error("unconfirmed delete reached GitHub"); }) as typeof fetch;
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories/sample", {
      method: "DELETE",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: false }),
    }), env(db));
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe("delete_confirmation_required");
  });

  test("dispatches a rate-limited site refresh only for a published admin registration", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    const secrets = await publisherSecrets();
    const config = "name: Sample\nslug: sample\nrepository: https://github.com/octocat/repo\n";
    let dispatches = 0;
    let actionsTokens = 0;
    let dispatchStatus = 204;
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "docs.example.com" && url.pathname === "/publication.json") return Response.json({ siteSourceRevision: "site-commit", projects: [{ slug: "sample", repositoryUrl: "https://github.com/octocat/repo", sourceRevision: "repo-commit", documentationUrl: "https://docs.example.com/sample/" }] });
      if (url.pathname === "/user") return Response.json({ id: 123, login: "octocat" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [{ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, permissions: { admin: true } }] });
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/app/installations/67890/access_tokens") {
        const body = JSON.parse(String(init?.body)) as { permissions: Record<string, string> };
        if (body.permissions.actions === "write") actionsTokens += 1;
        return Response.json({ token: "publisher-token" }, { status: 201 });
      }
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs") return Response.json({ default_branch: "main" });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/ref/heads/main") return Response.json({ object: { sha: "site-commit" } });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/trees/main") return Response.json({ tree: [{ type: "blob", path: "repositories/sample.yml" }] });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/contents/repositories/sample.yml") return Response.json({ encoding: "base64", content: btoa(config) });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/actions/workflows/deploy-pages.yml/dispatches") {
        dispatches += 1;
        expect(JSON.parse(String(init?.body))).toEqual({ ref: "main" });
        return new Response(null, { status: dispatchStatus });
      }
      throw new Error(`unexpected GitHub request: ${url}`);
    }) as typeof fetch;
    const request = () => new Request("https://api.example.com/api/repositories/sample/refresh", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken },
    });

    const first = await worker.fetch(request(), env(db, secrets));
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ refresh: { status: "requested" } });
    const second = await worker.fetch(request(), env(db, secrets));
    expect(second.status).toBe(429);
    expect((await second.json() as { code: string }).code).toBe("refresh_rate_limited");
    expect(actionsTokens).toBe(1);
    expect(dispatches).toBe(1);
    db.refreshes.clear();
    dispatchStatus = 500;
    const failed = await worker.fetch(request(), env(db, secrets));
    expect(failed.status).toBe(502);
    expect(db.refreshes.has(44)).toBe(false);
  });

  test("blocks a repository that is already registered in the target repository", async () => {
    const db = new MockDatabase(await sessionRow({ csrf_hash: await sha256(csrfToken) }));
    const secrets = await publisherSecrets();
    let branchCreated = false;
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/octocat/repo") return Response.json({ id: 44, full_name: "octocat/repo", html_url: "https://github.com/octocat/repo", private: false, archived: false, default_branch: "main" });
      if (url.pathname === "/repos/octocat/repo/collaborators/octocat/permission") return Response.json({ permission: "admin" });
      if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 7 }] });
      if (url.pathname === "/user/installations/7/repositories") return Response.json({ repositories: [{ id: 44 }] });
      if (url.pathname === "/repos/octocat/repo/contents/docs/") return Response.json([{ name: "index.md", type: "file" }]);
      if (url.pathname === "/repos/octocat/repo/contents/docs/repodocs.yml") return new Response(null, { status: 404 });
      if (url.pathname === "/app/installations/67890/access_tokens") return Response.json({ token: "publisher-token" }, { status: 201 });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs") return Response.json({ default_branch: "main" });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/git/trees/main") return Response.json({ tree: [{ type: "blob", path: "repositories/already.yml" }] });
      if (url.pathname === "/repos/Syrup-Studios/RepoDocs/contents/repositories/already.yml") return Response.json({ encoding: "base64", content: btoa("name: Existing\nslug: already\nrepository: https://github.com/octocat/repo\n") });
      if (url.pathname.includes("/git/refs") || url.pathname.includes("/pulls")) branchCreated = true;
      throw new Error(`unexpected GitHub request: ${init?.method ?? "GET"} ${url}`);
    }) as typeof fetch;
    const response = await worker.fetch(new Request("https://api.example.com/api/repositories", {
      method: "POST",
      headers: { Origin: origin, Cookie: `session=${sessionId}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/repo", name: "New name", slug: "new-name" }),
    }), env(db, secrets));
    expect(response.status).toBe(409);
    expect((await response.json() as { code: string }).code).toBe("repository_already_published");
    expect(branchCreated).toBe(false);
  });
});
