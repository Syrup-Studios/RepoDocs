import { useEffect, useState } from "react";
import { ExternalLink, Github, Plus, RefreshCw } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";

type Session = { user: { id: number; login: string; avatarUrl: string }; csrfToken: string };
type GitHubRepository = {
  id: number;
  fullName: string;
  url: string;
  description: string | null;
  admin?: boolean;
  private?: boolean;
  archived?: boolean;
};
type Registration = {
  slug?: string;
  name?: string;
  repositoryUrl?: string;
  documentationUrl?: string | null;
  status?: string;
  latestPublishedAt?: string | null;
  sourceRevision?: string | null;
  iconUrl?: string | null;
  description?: string | null;
  prUrl?: string | null;
  admin?: boolean;
};
type DashboardData = { github: GitHubRepository[]; registrations: Registration[] };

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const statusLabels: Record<string, string> = {
  draft: "Draft",
  verification_required: "Verification required",
  validation_failed: "Validation failed",
  pending_approval: "Pending approval",
  publishing: "Publishing",
  published: "Published",
  update_failed: "Update failed",
  removal_pending: "Removal pending",
};

function normalizeRepositoryUrl(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { credentials: "include" });
  if (!response.ok) throw Object.assign(new Error(`Request failed: ${response.status}`), { status: response.status });
  return response.json() as Promise<T>;
}

export function DashboardPage({ siteName }: { siteName: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(Boolean(apiBase));
  const [error, setError] = useState(!apiBase);
  const [githubUnavailable, setGithubUnavailable] = useState(false);
  const [registrationsUnavailable, setRegistrationsUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (!apiBase) {
      setLoading(false);
      setError(true);
      return () => { active = false; };
    }
    setLoading(true);
    setError(false);
    setGithubUnavailable(false);
    setRegistrationsUnavailable(false);
    setData(null);
    getJson<Session>("/api/me")
      .then(async (account) => {
        if (!active) return;
        setSession(account);
        const [githubResult, registrationsResult] = await Promise.allSettled([
          getJson<{ repositories: GitHubRepository[] }>("/api/github/repositories"),
          getJson<{ repositories: Registration[] }>("/api/repositories"),
        ]);
        if (!active) return;
        setData({
          github: githubResult.status === "fulfilled" ? githubResult.value.repositories : [],
          registrations: registrationsResult.status === "fulfilled" ? registrationsResult.value.repositories : [],
        });
        setGithubUnavailable(githubResult.status === "rejected");
        setRegistrationsUnavailable(registrationsResult.status === "rejected");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (typeof cause === "object" && cause !== null && "status" in cause && cause.status === 401) {
          setSession(null);
          setData(null);
          setError(false);
          return;
        }
        setError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const registrations = data?.registrations ?? [];
  const githubRepositories = data?.github ?? [];
  const published = registrations.filter((item) => item.status === "published");
  const inProgress = registrations.filter((item) => item.status !== "published");

  return (
    <div className="dashboard-shell">
      <header className="docs-header dashboard-header">
        <a className="material-brand" href="/"><span>{siteName}</span></a>
        <nav aria-label="Dashboard navigation"><a className="active" href="/dashboard/">My Repositories</a></nav>
        <AccountMenu session={session} loading={loading} onSessionChange={setSession} />
      </header>
      <main className="dashboard-main">
        <div className="dashboard-title-row">
          <div><p className="dashboard-kicker">Account</p><h1>My Repositories</h1></div>
          {apiBase ? <a className="dashboard-add-button" href="/dashboard/add/"><Plus size={17} /> Add Repository</a> : <span className="dashboard-add-disabled" aria-disabled="true">Add Repository unavailable</span>}
        </div>
        {loading ? (
          <p className="dashboard-state" role="status">Loading your repositories…</p>
        ) : error ? (
          <div className="dashboard-state dashboard-error" role="alert">
            <p>{apiBase ? "We could not load your repositories." : "Repository features are unavailable because this site build has no API URL."}</p>
            {apiBase && <button type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15} /> Try again</button>}
          </div>
        ) : !session ? (
          <div className="dashboard-state">
            <p>Sign in with GitHub to view your repositories.</p>
            <a className="dashboard-add-button" href={`${apiBase}/auth/github`}><Github size={16} /> Sign in</a>
          </div>
        ) : (
          <>
            <div className="dashboard-user"><img src={session.user.avatarUrl} alt="" /><span>Signed in as <strong>{session.user.login}</strong></span></div>
            <section className="dashboard-panel">
              <div className="dashboard-section-heading"><div><h2>Published repositories</h2><p>Repositories with published documentation.</p></div><span>{registrationsUnavailable ? "Unavailable" : published.length}</span></div>
              {registrationsUnavailable ? <p className="dashboard-empty">Registration data is unavailable.</p> : published.length ? <div className="dashboard-list">{published.map((item, index) => <RegistrationRow item={item} session={session} key={item.slug ?? item.repositoryUrl ?? index} />)}</div> : <p className="dashboard-empty">No repositories are published yet.</p>}
            </section>
            <section className="dashboard-panel">
              <div className="dashboard-section-heading"><div><h2>Registrations in progress</h2><p>Requests that are still being reviewed or processed.</p></div><span>{registrationsUnavailable ? "Unavailable" : inProgress.length}</span></div>
              {registrationsUnavailable ? <p className="dashboard-empty">Registration data is unavailable.</p> : inProgress.length ? <div className="dashboard-list">{inProgress.map((item, index) => <RegistrationRow item={item} session={session} key={item.slug ?? item.repositoryUrl ?? index} />)}</div> : <p className="dashboard-empty">No registrations are in progress.</p>}
            </section>
            <section className="dashboard-panel">
              <div className="dashboard-section-heading"><div><h2>Connected GitHub repositories</h2><p>Repositories that your GitHub account can access.</p></div><span>{githubUnavailable ? "Unavailable" : githubRepositories.length}</span></div>
              {githubUnavailable ? <p className="dashboard-empty">Connected repositories are unavailable.</p> : githubRepositories.length ? <div className="dashboard-list">{githubRepositories.map((repo) => {
                const registered = registrations.some((item) => normalizeRepositoryUrl(item.repositoryUrl) === normalizeRepositoryUrl(repo.url));
                const eligible = repo.admin && repo.private === false && !repo.archived && !registered && !registrationsUnavailable;
                return (
                  <article className="dashboard-repository" key={repo.id}>
                    <div className="dashboard-repository-icon"><Github size={19} /></div>
                    <div className="dashboard-repository-details"><h3>{repo.fullName}</h3>{repo.description && <p>{repo.description}</p>}<div className="dashboard-meta">{repo.private !== undefined && <span>{repo.private ? "Private" : "Public"}</span>}{repo.archived && <span>Archived</span>}{repo.admin && <span>Admin access</span>}</div></div>
                    <div className="dashboard-repository-actions"><a className="dashboard-repo-link" href={repo.url} target="_blank" rel="noreferrer" aria-label={`Open ${repo.fullName} on GitHub`}><ExternalLink size={16} /></a>{eligible && <a className="dashboard-add-repository-link" href={`/dashboard/add/?url=${encodeURIComponent(repo.url)}`}>Add to RepoDocs</a>}</div>
                  </article>
                );
              })}</div> : <p className="dashboard-empty">No connected repositories were found.</p>}
            <a className="dashboard-add-link" href="/dashboard/add/"><Plus size={16} /> Add Repository</a>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function RegistrationRow({ item, session }: { item: Registration; session: Session }) {
  const [busy, setBusy] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [removeRequested, setRemoveRequested] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const isPublished = item.status === "published";
  const label = item.status ? statusLabels[item.status] ?? "Status unavailable" : "Status unavailable";
  const manageHref = item.slug ? `/dashboard/manage/?slug=${encodeURIComponent(item.slug)}` : null;
  async function requestAction(action: "refresh" | "delete") {
    if (!item.slug) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${apiBase}/api/repositories/${encodeURIComponent(item.slug)}${action === "refresh" ? "/refresh" : ""}`, {
        method: action === "refresh" ? "POST" : "DELETE", credentials: "include",
        headers: { "X-CSRF-Token": session.csrfToken, ...(action === "delete" ? { "Content-Type": "application/json" } : {}) },
        ...(action === "delete" ? { body: JSON.stringify({ confirm: true }) } : {}),
      });
      let body: Record<string, unknown> = {};
      try { const parsed: unknown = await response.json(); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>; } catch { /* The status still gives a useful error. */ }
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status}).`);
      if (action === "refresh") {
        if ((body.refresh as { status?: string } | undefined)?.status !== "requested") throw new Error("The server did not confirm the refresh request.");
        setNotice("Refresh requested.");
      } else {
        const change = body.registration as { operation?: string; status?: string; prUrl?: string } | undefined;
        if (change?.operation !== "delete" || change.status !== "pending_approval") throw new Error("The server returned an incomplete removal request.");
        setNotice(change.prUrl ? `Removal request sent for review. Pull request: ${change.prUrl}` : "Removal request sent for review.");
        setRemoveRequested(true);
        setConfirmRemoval(false);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The request failed."); }
    finally { setBusy(false); }
  }
  return (
    <article className="dashboard-repository">
      <div className="dashboard-repository-icon">{item.iconUrl ? <img src={item.iconUrl} alt="" /> : <Github size={19} />}</div>
      <div className="dashboard-repository-details"><h3>{item.name || item.slug || item.repositoryUrl || "Repository"}</h3>{item.description && <p>{item.description}</p>}<div className="dashboard-meta"><span className={`dashboard-status ${isPublished ? "published" : ""}`}>{label}</span>{item.latestPublishedAt && Number.isFinite(Date.parse(item.latestPublishedAt)) && <span>Updated {new Date(item.latestPublishedAt).toLocaleDateString()}</span>}{item.sourceRevision && <span>{item.sourceRevision.slice(0, 7)}</span>}</div></div>
      <div className="dashboard-registration-actions">
        {item.documentationUrl && <a href={item.documentationUrl} target="_blank" rel="noreferrer">View docs</a>}
        {item.repositoryUrl && <a href={item.repositoryUrl} target="_blank" rel="noreferrer">View source</a>}
        {item.prUrl && <a href={item.prUrl} target="_blank" rel="noreferrer">View request</a>}
        {item.admin && manageHref && <a href={manageHref}>Edit</a>}
        {item.admin && item.slug && <button type="button" disabled={busy} onClick={() => requestAction("refresh")}>Refresh</button>}
        {item.admin && item.slug && !removeRequested && <button type="button" disabled={busy} onClick={() => setConfirmRemoval(true)}>Remove</button>}
      </div>
      {(confirmRemoval || notice || error) && <div className="dashboard-row-feedback">{confirmRemoval && <><span>Send a removal request for this repository?</span><button type="button" disabled={busy} onClick={() => requestAction("delete")}>Confirm</button><button type="button" onClick={() => setConfirmRemoval(false)}>Cancel</button></>}{notice && <span role="status">{notice}</span>}{error && <span role="alert">{error}</span>}</div>}
    </article>
  );
}
