import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Github, LoaderCircle, RefreshCw, Save, Trash2 } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { firstClassDirectories } from "@/lib/classification";

type Session = { user: { id: number; login: string; avatarUrl: string }; csrfToken: string };
type Config = { name: string; summary: string; type: string; category: string; defaultLocale: string; rootREADME: boolean; versions: Record<string, string> };
type Registration = { slug: string; name: string; summary?: string; repositoryUrl: string; documentationUrl: string | null; sourceRevision: string | null; status: string; admin: boolean; prUrl?: string | null; config: Partial<Config> };
type Change = { operation: "edit" | "delete"; status: "pending_approval"; prUrl: string };

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const unavailableText = "Repository management is unavailable because this site build has no API URL.";
const statusLabels: Record<string, string> = { draft: "Draft", verification_required: "Verification required", validation_failed: "Validation failed", pending_approval: "Pending approval", publishing: "Publishing", published: "Published", update_failed: "Update failed", removal_pending: "Removal pending" };

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function message(body: Record<string, unknown>, status: number): string {
  const code = typeof body.code === "string" ? body.code : "";
  if (code === "session_required" || code === "csrf_required" || code === "csrf_invalid") return "Your session has expired. Sign in again.";
  if (code === "repository_admin_required") return "Your GitHub account no longer has admin access to this repository.";
  if (code === "repository_not_found") return "This repository registration could not be found.";
  if (code === "repository_change_pending") return "A repository change is already waiting for review.";
  if (code === "refresh_rate_limited") return "A refresh was requested recently. Try again later.";
  if (typeof body.error === "string") return body.error;
  return `The request failed (${status}).`;
}

function mapConfig(registration: Registration): Config {
  const config = registration.config ?? {};
  return {
    name: config.name ?? registration.name ?? "",
    summary: config.summary ?? registration.summary ?? "",
    type: config.type ?? "",
    category: config.category ?? "",
    defaultLocale: config.defaultLocale ?? "en",
    rootREADME: config.rootREADME ?? false,
    versions: config.versions ?? {},
  };
}

export function ManageRepositoryPage({ siteName, search = "" }: { siteName: string; search?: string }) {
  const slug = useMemo(() => new URLSearchParams(search).get("slug")?.trim() ?? "", [search]);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(!apiBase);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [form, setForm] = useState<Config | null>(null);
  const [loading, setLoading] = useState(Boolean(apiBase));
  const [error, setError] = useState(!apiBase ? unavailableText : "");
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [change, setChange] = useState<Change | null>(null);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [versionRows, setVersionRows] = useState<Array<{ id: string; branch: string }>>([]);

  useEffect(() => {
    let active = true;
    if (!apiBase) { setLoading(false); return () => { active = false; }; }
    if (!slug) { setSessionReady(true); setLoading(false); setError("Choose a repository from My Repositories to manage it."); return () => { active = false; }; }
    setLoading(true);
    setError("");
    fetch(`${apiBase}/api/me`, { credentials: "include" })
      .then(async (response) => {
        const body = await readBody(response);
        if (response.status === 401) throw new Error("Sign in with GitHub to manage this repository.");
        if (!response.ok) throw new Error(message(body, response.status));
        return body as unknown as Session;
      })
      .then(async (account) => {
        if (!active) return;
        setSession(account);
        setSessionReady(true);
        const response = await fetch(`${apiBase}/api/repositories/${encodeURIComponent(slug)}`, { credentials: "include" });
        const body = await readBody(response);
        if (!response.ok) throw new Error(message(body, response.status));
        const item = body.registration as Registration | undefined;
        if (!item || typeof item.slug !== "string" || !item.config || typeof item.config !== "object") throw new Error("The server returned incomplete repository details.");
        if (!active) return;
        setRegistration(item);
        const pendingChange = body.change as Change | undefined;
        if (pendingChange?.status === "pending_approval" && typeof pendingChange.prUrl === "string") setChange(pendingChange);
        const config = mapConfig(item);
        setForm(config);
        setVersionRows(Object.entries(config.versions).map(([id, branch]) => ({ id, branch })));
      })
      .catch((cause: unknown) => { if (active) { setSessionReady(true); setError(cause instanceof Error ? cause.message : "Could not load this repository."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const update = (field: keyof Config, value: string | boolean) => setForm((current) => current ? { ...current, [field]: value } : current);
  const currentType = firstClassDirectories().find((item) => item.type === form?.type);

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!session || !form || !registration) return;
    setBusy(true); setError(""); setActionMessage("");
    const versions: Record<string, string> = {};
    for (const row of versionRows) {
      const id = row.id.trim(); const branch = row.branch.trim();
      if (!id || !branch || id === "latest" || !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(id) || Object.hasOwn(versions, id)) {
        setError("Enter valid, unique version IDs and Git branches. The ID latest is reserved."); setBusy(false); return;
      }
      versions[id] = branch;
    }
    const payload = {
      slug: registration?.slug,
      url: registration?.repositoryUrl,
      name: form.name.trim(), summary: form.summary.trim() || null,
      type: form.type && form.category ? form.type : null,
      category: form.type && form.category ? form.category : null,
      defaultLocale: form.defaultLocale.trim().toLowerCase().replaceAll("_", "-"), rootREADME: form.rootREADME,
      versions,
    };
    try {
      const response = await fetch(`${apiBase}/api/repositories/${encodeURIComponent(slug)}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify(payload) });
      const body = await readBody(response);
      if (!response.ok) throw new Error(message(body, response.status));
      const pending = body.registration as Change | undefined;
      if (!pending || pending.operation !== "edit" || pending.status !== "pending_approval") throw new Error("The server returned an incomplete change request.");
      setChange(pending); setActionMessage("Edit request sent for review. The published documentation has not changed yet.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request this edit."); }
    finally { setBusy(false); }
  }

  async function refreshRepository() {
    if (!session) return;
    setBusy(true); setError(""); setActionMessage("");
    try {
      const response = await fetch(`${apiBase}/api/repositories/${encodeURIComponent(slug)}/refresh`, { method: "POST", credentials: "include", headers: { "X-CSRF-Token": session.csrfToken } });
      const body = await readBody(response);
      if (!response.ok) throw new Error(message(body, response.status));
      if ((body.refresh as { status?: string } | undefined)?.status !== "requested") throw new Error("The server did not confirm the refresh request.");
      setActionMessage("Refresh requested. The documentation will update after the source is processed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request a refresh."); }
    finally { setBusy(false); }
  }

  async function removeRepository() {
    if (!session) return;
    setBusy(true); setError(""); setActionMessage("");
    try {
      const response = await fetch(`${apiBase}/api/repositories/${encodeURIComponent(slug)}`, { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify({ confirm: true }) });
      const body = await readBody(response);
      if (!response.ok) throw new Error(message(body, response.status));
      const pending = body.registration as Change | undefined;
      if (!pending || pending.operation !== "delete" || pending.status !== "pending_approval") throw new Error("The server returned an incomplete removal request.");
      setChange(pending); setConfirmRemoval(false); setActionMessage("Removal request sent for review. The documentation remains published until the request is approved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request removal."); }
    finally { setBusy(false); }
  }

  return <div className="dashboard-shell">
    <header className="docs-header dashboard-header"><a className="material-brand" href="/"><span>{siteName}</span></a><nav aria-label="Dashboard navigation"><a href="/dashboard/">My Repositories</a></nav><AccountMenu session={session} loading={!sessionReady} onSessionChange={setSession} /></header>
    <main className="dashboard-main add-repository-main">
      <a className="dashboard-back-link" href="/dashboard/"><ArrowLeft size={15} /> My Repositories</a>
      <div className="dashboard-title-row"><div><p className="dashboard-kicker">Repository settings</p><h1>Manage repository</h1></div></div>
      {loading ? <p className="dashboard-state" role="status">Loading repository settings…</p>
        : error && !registration ? <div className="dashboard-state dashboard-error" role="alert"><p>{error}</p>{error.includes("Sign in") && apiBase && <a className="dashboard-add-button" href={`${apiBase}/auth/github`}><Github size={16} /> Sign in</a>}</div>
        : registration && form ? <>
          <section className="dashboard-panel registration-panel">
            <div className="registration-identity"><Github size={19} /><div><strong>{registration.name}</strong><small>{registration.repositoryUrl}</small></div><span>{registration.admin ? "Admin access" : "Read only"}</span></div>
            <div className="dashboard-meta"><span className="dashboard-status">{statusLabels[registration.status] ?? "Status unavailable"}</span>{registration.documentationUrl && <a href={registration.documentationUrl} target="_blank" rel="noreferrer">View docs <ExternalLink size={12} /></a>}{registration.repositoryUrl && <a href={registration.repositoryUrl} target="_blank" rel="noreferrer">View source <ExternalLink size={12} /></a>}{registration.prUrl && <a href={registration.prUrl} target="_blank" rel="noreferrer">View pending request <ExternalLink size={12} /></a>}</div>
            {change?.prUrl && <p className="registration-hint">This change is waiting for review. <a href={change.prUrl} target="_blank" rel="noreferrer">View pull request <ExternalLink size={12} /></a></p>}
          </section>
          {!registration.admin ? <section className="dashboard-panel"><p className="dashboard-empty">Your GitHub account no longer has admin access. You can view this repository, but you cannot change it.</p></section> : <>
            <form className="dashboard-panel registration-panel" onSubmit={submitEdit}>
              <div className="dashboard-section-heading"><div><h2>Documentation settings</h2><p>Changes are sent as a pull request for review.</p></div></div>
              {error && <p className="registration-inline-error" role="alert">{error}</p>}
              {actionMessage && <p className="registration-hint" role="status">{actionMessage}</p>}
              <div className="registration-form-grid">
                <label className="registration-field"><span>Name</span><input required maxLength={100} value={form.name} onChange={(event) => update("name", event.target.value)} /></label>
                <label className="registration-field"><span>URL slug</span><input value={registration.slug} disabled aria-describedby="managed-slug-help" /><small id="managed-slug-help">The URL slug cannot be changed here.</small></label>
                <label className="registration-field registration-field-wide"><span>Summary <small>(optional)</small></span><textarea maxLength={240} value={form.summary} onChange={(event) => update("summary", event.target.value)} /></label>
                <label className="registration-field"><span>Type <small>(optional)</small></span><select value={form.type} onChange={(event) => setForm((current) => current ? { ...current, type: event.target.value, category: "" } : current)}><option value="">No type</option>{firstClassDirectories().map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select></label>
                <label className="registration-field"><span>Category <small>(optional)</small></span><select value={form.category} onChange={(event) => update("category", event.target.value)} disabled={!currentType}><option value="">No category</option>{currentType?.categories.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select></label>
                <label className="registration-field"><span>Default language</span><input required maxLength={16} value={form.defaultLocale} onChange={(event) => update("defaultLocale", event.target.value)} /></label>
                <label className="registration-checkbox"><input type="checkbox" checked={form.rootREADME} onChange={(event) => update("rootREADME", event.target.checked)} /><span>Use the repository README as the front page</span></label>
              </div>
              <div className="registration-version-editor"><div className="registration-version-heading"><div><h3>Additional versions</h3><p>Map each version ID to a Git branch.</p></div><button type="button" className="registration-version-add" onClick={() => setVersionRows((rows) => [...rows, { id: "", branch: "" }])}>Add version</button></div>
                {versionRows.map((row, index) => <div className="registration-version-row" key={index}><label className="registration-field"><span>Version ID</span><input value={row.id} onChange={(event) => setVersionRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, id: event.target.value } : item))} /></label><label className="registration-field"><span>Git branch</span><input value={row.branch} onChange={(event) => setVersionRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, branch: event.target.value } : item))} /></label><button className="registration-version-remove" type="button" onClick={() => setVersionRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></div>)}
              </div>
              <div className="registration-actions"><button className="dashboard-add-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="registration-spinner" size={16} /> : <Save size={16} />} Request edit</button></div>
            </form>
            <section className="dashboard-panel registration-panel"><div className="dashboard-section-heading"><div><h2>Repository actions</h2><p>Requests need approval. They do not publish changes at once.</p></div></div>
              {error && <p className="registration-inline-error" role="alert">{error}</p>}{actionMessage && <p className="registration-hint" role="status">{actionMessage}</p>}
              <div className="registration-actions"><button type="button" className="registration-secondary-button" onClick={refreshRepository} disabled={busy}><RefreshCw size={14} /> Request refresh</button><button type="button" className="registration-secondary-button" onClick={() => setConfirmRemoval(true)} disabled={busy}><Trash2 size={14} /> Request removal</button></div>
              {confirmRemoval && <div className="registration-confirm"><p>Request removal of {registration.name}? The request will be reviewed before documentation is removed.</p><div className="registration-actions"><button type="button" className="registration-secondary-button" onClick={() => setConfirmRemoval(false)} disabled={busy}>Cancel</button><button type="button" className="registration-danger-button" onClick={removeRepository} disabled={busy}>Confirm removal request</button></div></div>}
            </section>
          </>}
        </> : null}
    </main>
  </div>;
}
