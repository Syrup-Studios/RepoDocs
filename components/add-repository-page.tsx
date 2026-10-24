import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Github, LoaderCircle, Plus } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { firstClassDirectories } from "@/lib/classification";

type Session = { user: { id: number; login: string; avatarUrl: string }; csrfToken: string };
type GitHubRepository = { id: number; fullName: string; url: string; description: string | null; admin: boolean; private: boolean; archived: boolean };
type RepositoryMetadata = { name?: string; summary?: string; type?: string; category?: string; rootREADME?: boolean; defaultLocale?: string; versions?: Record<string, string> };
type Validation = { valid: true; repository: { id: number; fullName: string; url: string; defaultBranch: string }; admin: true; docs: { exists: boolean; pageFound?: boolean; metadata?: RepositoryMetadata } };
type RegistrationStatus = "draft" | "verification_required" | "validation_failed" | "pending_approval" | "publishing" | "published" | "update_failed" | "removal_pending";
type RegistrationResult = { registration: { slug: string; status: RegistrationStatus; prUrl?: string | null } };
type RepositoryForm = { name: string; summary: string; slug: string; type: string; category: string; defaultLocale: string; rootREADME: boolean };
type VersionBranch = { id: string; branch: string };

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const validationMessages: Record<string, string> = {
  unsupported_repository_url: "Enter a GitHub repository URL, such as https://github.com/owner/repository.",
  repository_not_found: "GitHub could not find this repository or your account cannot access it.",
  repository_not_installed: "The RepoDocs GitHub App is not installed for this repository.",
  repository_not_publishable: "The repository must be public and active.",
  repository_admin_required: "Your GitHub account needs admin access to this repository.",
  repository_validation_failed: "GitHub could not verify this repository. Try again.",
  docs_directory_missing: "Add a docs/ directory to the repository before you submit it.",
  docs_page_missing: "Add a Markdown page under docs/ before you submit this repository.",
  root_readme_missing: "The repository does not have the root README required by docs/repodocs.yml.",
  invalid_documentation_config: "The repository's docs/repodocs.yml is invalid or contains unsupported metadata. Correct it and try again.",
  invalid_name: "Enter a project name with 1 to 100 characters on one line.",
  invalid_slug: "Use a slug with lowercase letters, numbers, and hyphens. It must start with a letter or number.",
  invalid_summary: "Keep the summary to one line with 1 to 240 characters.",
  classification_pair_required: "Select both a type and a category, or leave both blank.",
  invalid_classification: "Select a supported type and category.",
  invalid_locale: "Enter a valid language code, such as en or pt-br.",
  invalid_root_readme: "Choose whether to use the root README as the front page.",
  invalid_versions: "The version map is invalid.",
  repository_or_slug_already_registered: "This repository or URL slug already has a registration.",
  slug_already_published: "This URL slug is already in use by a published repository. Choose a different slug.",
  repository_already_published: "This repository already has published documentation.",
  submission_payload_changed: "A request for this repository already exists with different details. Contact the site owner before you submit another request.",
  registration_pull_request_closed: "The registration pull request is closed. Contact the site owner for help.",
  pull_request_creation_failed: "The registration request could not create a pull request. Try again later.",
  invalid_schema: "The registration details are incomplete.",
  unknown_field: "The request contains a field the server does not support.",
  body_too_large: "The request is too large.",
  json_required: "The server could not read the request. Try again.",
  session_required: "Your session has expired. Sign in again.",
  csrf_required: "Your session has expired. Sign in again.",
  csrf_invalid: "Your session has expired. Sign in again.",
};
const statusLabels: Record<RegistrationStatus, string> = {
  draft: "Draft",
  verification_required: "Verification required",
  validation_failed: "Validation failed",
  pending_approval: "Pending approval",
  publishing: "Publishing",
  published: "Published",
  update_failed: "Update failed",
  removal_pending: "Removal pending",
};

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function errorMessage(body: Record<string, unknown>, status: number): string {
  const code = typeof body.code === "string" ? body.code : "";
  return validationMessages[code] ?? (typeof body.error === "string" ? body.error : `Request failed (${status}).`);
}

function slugFromRepository(fullName: string): string {
  return fullName.split("/").at(-1)?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63) || "repository";
}

export function AddRepositoryPage({ siteName }: { siteName: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(!apiBase);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [loading, setLoading] = useState(Boolean(apiBase));
  const [repositoryError, setRepositoryError] = useState("");
  const [sessionError, setSessionError] = useState(apiBase ? "" : "Repository features are unavailable because this site build has no API URL.");
  const [selectedRepository, setSelectedRepository] = useState("");
  const [url, setUrl] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [validationError, setValidationError] = useState("");
  const [form, setForm] = useState<RepositoryForm>({ name: "", summary: "", slug: "", type: "", category: "", defaultLocale: "en", rootREADME: false });
  const [touchedFields, setTouchedFields] = useState<Set<keyof RepositoryForm>>(() => new Set());
  const [versions, setVersions] = useState<VersionBranch[]>([]);
  const [versionsTouched, setVersionsTouched] = useState(false);
  const [versionError, setVersionError] = useState("");
  const [step, setStep] = useState<1 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<RegistrationResult["registration"] | null>(null);

  useEffect(() => {
    let active = true;
    if (!apiBase) {
      setSessionReady(true);
      setSessionError("Repository features are unavailable because this site build has no API URL.");
      setLoading(false);
      return () => { active = false; };
    }
    fetch(`${apiBase}/api/me`, { credentials: "include" })
      .then(async (response) => {
        const body = await responseJson(response);
        if (response.status === 401) return null;
        if (!response.ok) throw new Error(errorMessage(body, response.status));
        return body as unknown as Session;
      })
      .then(async (account) => {
        if (!active) return;
        setSession(account);
        setSessionReady(true);
        if (!account) return;
        try {
          const response = await fetch(`${apiBase}/api/github/repositories`, { credentials: "include" });
          const body = await responseJson(response);
          if (!response.ok) {
            setRepositoryError(errorMessage(body, response.status));
            return;
          }
          const list = body.repositories;
          if (!Array.isArray(list)) {
            setRepositoryError("GitHub returned an invalid repository list.");
            return;
          }
          setRepositories(list as GitHubRepository[]);
        } catch {
          setRepositoryError("Connected repositories are unavailable. You can enter a GitHub URL below.");
          return;
        }
      })
      .catch((error: unknown) => { if (active) { setSessionReady(true); setSessionError(error instanceof Error ? error.message : "Could not load your account."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function validateRepository(event: FormEvent) {
    event.preventDefault();
    setValidation(null);
    setValidationError("");
    setSubmitError("");
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/repositories/validate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session!.csrfToken },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(errorMessage(body, response.status));
      const checked = body as unknown as Validation;
      if (checked.valid !== true || !checked.repository?.fullName || !checked.repository.url || !checked.repository.defaultBranch || checked.docs?.exists !== true) {
        throw new Error("GitHub returned an incomplete repository check.");
      }
      setValidation(checked);
      setUrl(checked.repository.url);
      const metadata = checked.docs.metadata ?? {};
      const metadataType = firstClassDirectories().find((item) => item.type === metadata.type);
      const metadataCategory = metadataType?.categories.some((item) => item.name === metadata.category) ? metadata.category! : "";
      setForm((current) => ({
        ...current,
        name: touchedFields.has("name") ? current.name : metadata.name || checked.repository.fullName.split("/").at(-1) || "",
        summary: touchedFields.has("summary") ? current.summary : metadata.summary ?? "",
        slug: touchedFields.has("slug") ? current.slug : slugFromRepository(checked.repository.fullName),
        type: touchedFields.has("type") ? current.type : metadataCategory ? metadataType!.type : "",
        category: touchedFields.has("category") ? current.category : metadataCategory,
        defaultLocale: touchedFields.has("defaultLocale") ? current.defaultLocale : metadata.defaultLocale ?? "en",
        rootREADME: touchedFields.has("rootREADME") ? current.rootREADME : metadata.rootREADME ?? false,
      }));
      if (!versionsTouched) setVersions(Object.entries(metadata.versions ?? {}).map(([id, branch]) => ({ id, branch })));
      setStep(3);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Could not validate this repository.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRepository(event: FormEvent) {
    event.preventDefault();
    setSubmitError("");
    setBusy(true);
    const payload = {
      url: validation!.repository.url,
      name: form.name.trim(),
      summary: form.summary.trim() || undefined,
      slug: form.slug.trim(),
      ...(form.type && form.category ? { type: form.type, category: form.category } : {}),
      defaultLocale: form.defaultLocale.trim().toLowerCase().replaceAll("_", "-"),
      rootREADME: form.rootREADME,
      ...(versions.length ? { versions: Object.fromEntries(versions.map(({ id, branch }) => [id.trim(), branch.trim()])) } : {}),
    };
    try {
      const response = await fetch(`${apiBase}/api/repositories`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session!.csrfToken },
        body: JSON.stringify(payload),
      });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(errorMessage(body, response.status));
      const registration = body.registration as RegistrationResult["registration"] | undefined;
      if (!registration || typeof registration.slug !== "string" || typeof registration.status !== "string") {
        throw new Error("The server returned an incomplete registration response.");
      }
      setResult(registration);
      setStep(4);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not submit this repository.");
    } finally {
      setBusy(false);
    }
  }

  const eligibleRepositories = repositories.filter((repo) => repo.admin && !repo.private && !repo.archived);
  const currentType = firstClassDirectories().find((item) => item.type === form.type);
  const defaultLocale = form.defaultLocale.trim().toLowerCase().replaceAll("_", "-");
  const updateForm = (field: keyof RepositoryForm, value: string | boolean) => {
    setTouchedFields((current) => new Set(current).add(field));
    setForm((current) => ({ ...current, [field]: value }));
  };
  const updateClassification = (type: string) => {
    setTouchedFields((current) => new Set(current).add("type").add("category"));
    setForm((current) => ({ ...current, type, category: "" }));
  };
  function reviewDetails(event: FormEvent) {
    event.preventDefault();
    const entries = versions.map(({ id, branch }) => ({ id: id.trim(), branch: branch.trim() }));
    const ids = new Set<string>();
    for (const { id, branch } of entries) {
      if (!id || !branch) return setVersionError("Enter both a version ID and a Git branch for each row.");
      if (id === "latest" || !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(id)) return setVersionError("Use a valid version ID. The reserved ID latest cannot be used.");
      if (ids.has(id)) return setVersionError(`The version ID ${id} appears more than once.`);
      if (branch.length > 255 || /[\r\n\0]/.test(branch)) return setVersionError(`The Git branch for ${id} is invalid.`);
      ids.add(id);
    }
    setVersionError("");
    setSubmitError("");
    setStep(4);
  }

  return (
    <div className="dashboard-shell">
      <header className="docs-header dashboard-header">
        <a className="material-brand" href="/"><span>{siteName}</span></a>
        <nav aria-label="Dashboard navigation"><a href="/dashboard/">My Repositories</a><a className="active" href="/dashboard/add/">Add Repository</a></nav>
        <AccountMenu session={sessionReady ? session : null} loading={!sessionReady} onSessionChange={setSession} />
      </header>
      <main className="dashboard-main add-repository-main">
        <div className="dashboard-title-row"><div><p className="dashboard-kicker">Repository registration</p><h1>Add Repository</h1></div><a className="dashboard-back-link" href="/dashboard/"><ArrowLeft size={16} /> My Repositories</a></div>
        <ol className="registration-steps" aria-label="Registration steps">
          <li className={step >= 1 ? "active" : ""}><span>1</span> Repository</li><li className={step >= 3 ? "active" : ""}><span>2</span> Details</li><li className={step >= 4 ? "active" : ""}><span>3</span> Review</li>
        </ol>
        {loading ? <p className="dashboard-state" role="status">Loading your account…</p> : sessionError ? <div className="dashboard-state" role="alert"><p>{sessionError}</p><a href="/">Return home</a></div> : !session ? (
          <div className="dashboard-state"><p>Sign in with GitHub to add a repository.</p><a className="dashboard-add-button" href={`${apiBase}/auth/github`}><Github size={16} /> Sign in</a></div>
        ) : result ? (
          <section className="dashboard-panel registration-result" aria-live="polite">
            <span className="registration-result-icon"><Check size={22} /></span><h2>Registration request received</h2>
            <p>Status: <strong>{statusLabels[result.status] ?? "Status unavailable"}</strong></p>
            <p>This is a request status. It does not mean the documentation is published.</p>
            {result.prUrl && <a href={result.prUrl} target="_blank" rel="noreferrer">Open pull request <ExternalLink size={15} /></a>}
            <a href="/dashboard/">Return to My Repositories</a>
          </section>
        ) : (
          <>
            <form className="dashboard-panel registration-panel" onSubmit={validateRepository}>
              <div className="dashboard-section-heading"><div><h2>1. Choose a repository</h2><p>Select a public repository where you have admin access, or paste its GitHub URL.</p></div></div>
              {repositoryError && <p className="registration-inline-error" role="status">Connected repositories could not load: {repositoryError}</p>}
              <label className="registration-field"><span>Connected repositories</span><select value={selectedRepository} onChange={(event) => { setSelectedRepository(event.target.value); setUrl(event.target.value); setValidation(null); }}><option value="">Choose a connected repository</option>{eligibleRepositories.map((repo) => <option value={repo.url} key={repo.id}>{repo.fullName}</option>)}</select></label>
              {session && !repositoryError && eligibleRepositories.length === 0 && !loading && <p className="registration-hint">No eligible connected repositories were found. You can enter a URL below.</p>}
              <label className="registration-field"><span>GitHub repository URL</span><input type="text" inputMode="url" required value={url} onChange={(event) => { setUrl(event.target.value); setSelectedRepository(""); setValidation(null); }} placeholder="https://github.com/owner/repository" /></label>
              {validationError && <p className="registration-inline-error" role="alert">{validationError}</p>}
              <button className="dashboard-add-button" type="submit" disabled={busy || !url.trim()}>{busy ? <LoaderCircle className="registration-spinner" size={16} /> : <Check size={16} />} Verify repository</button>
            </form>
            {validation && step === 3 && (
              <form className="dashboard-panel registration-panel" onSubmit={reviewDetails}>
                <div className="dashboard-section-heading"><div><h2>2. Configure documentation</h2><p>Set the name and options for this repository.</p></div></div>
                <div className="registration-identity"><Github size={18} /><div><strong>{validation.repository.fullName}</strong><small>Default branch: {validation.repository.defaultBranch}</small></div><span><Check size={14} /> Verified</span></div>
                <p className="registration-hint">The docs/ directory was found.</p>
                <div className="registration-form-grid">
                  <label className="registration-field"><span>Project name</span><input required maxLength={100} value={form.name} onChange={(event) => updateForm("name", event.target.value)} /></label>
                  <label className="registration-field"><span>URL slug</span><input required maxLength={63} pattern="[a-z0-9][a-z0-9-]{0,62}" value={form.slug} onChange={(event) => updateForm("slug", event.target.value)} /><small>Lowercase letters, numbers, and hyphens.</small></label>
                  <label className="registration-field registration-field-wide"><span>Summary <small>(optional)</small></span><textarea maxLength={240} rows={2} value={form.summary} onChange={(event) => updateForm("summary", event.target.value)} /></label>
                  <label className="registration-field"><span>Type <small>(optional)</small></span><select value={form.type} onChange={(event) => updateClassification(event.target.value)}><option value="">No type</option>{firstClassDirectories().map((item) => <option value={item.type} key={item.type}>{item.label}</option>)}</select></label>
                  <label className="registration-field"><span>Category <small>(optional)</small></span><select value={form.category} onChange={(event) => updateForm("category", event.target.value)} disabled={!currentType}><option value="">No category</option>{currentType?.categories.map((category) => <option value={category.name} key={category.name}>{category.label}</option>)}</select></label>
                  <label className="registration-field"><span>Default language</span><input required maxLength={16} pattern="[A-Za-z]{2}([_-][A-Za-z0-9]{2,8})?" value={form.defaultLocale} onChange={(event) => updateForm("defaultLocale", event.target.value)} /></label>
                  <label className="registration-checkbox"><input type="checkbox" checked={form.rootREADME} onChange={(event) => updateForm("rootREADME", event.target.checked)} /><span>Use the repository README as the front page</span></label>
                </div>
                <div className="registration-version-editor">
                  <div className="registration-version-heading"><div><h3>Additional versions</h3><p>Map a version ID to a Git branch. The latest version is added automatically.</p></div><button type="button" className="registration-version-add" onClick={() => { setVersionsTouched(true); setVersions((items) => [...items, { id: "", branch: "" }]); setVersionError(""); }}><Plus size={14} /> Add version</button></div>
                  {versions.map((version, index) => <div className="registration-version-row" key={index}>
                    <label className="registration-field"><span>Version ID</span><input required maxLength={32} pattern="[a-z0-9][a-z0-9._-]{0,31}" value={version.id} onChange={(event) => { setVersionsTouched(true); setVersionError(""); setVersions((items) => items.map((item, row) => row === index ? { ...item, id: event.target.value } : item)); }} placeholder="2.0" /></label>
                    <label className="registration-field"><span>Git branch</span><input required maxLength={255} value={version.branch} onChange={(event) => { setVersionsTouched(true); setVersionError(""); setVersions((items) => items.map((item, row) => row === index ? { ...item, branch: event.target.value } : item)); }} placeholder="release/2.0" /></label>
                    <button type="button" className="registration-version-remove" aria-label={`Remove version ${version.id || index + 1}`} onClick={() => { setVersionsTouched(true); setVersionError(""); setVersions((items) => items.filter((_, row) => row !== index)); }}>Remove</button>
                  </div>)}
                  {versionError && <p className="registration-inline-error" role="alert">{versionError}</p>}
                </div>
                <div className="registration-actions"><button className="dashboard-add-button" type="submit">Review request <ArrowRight size={16} /></button></div>
              </form>
            )}
            {validation && step === 4 && (
              <form className="dashboard-panel registration-panel" onSubmit={submitRepository}>
                <div className="dashboard-section-heading"><div><h2>3. Review and submit</h2><p>Check the repository and documentation details.</p></div></div>
                <dl className="registration-review"><div><dt>Repository</dt><dd><a href={validation.repository.url} target="_blank" rel="noreferrer">{validation.repository.fullName} <ExternalLink size={13} /></a></dd></div><div><dt>Name</dt><dd>{form.name.trim()}</dd></div><div><dt>Slug</dt><dd>{form.slug.trim()}</dd></div><div><dt>Summary</dt><dd>{form.summary.trim() || "None"}</dd></div><div><dt>Type and category</dt><dd>{form.type && form.category ? `${form.type} / ${form.category}` : "None"}</dd></div><div><dt>Default language</dt><dd>{defaultLocale}</dd></div><div><dt>README front page</dt><dd>{form.rootREADME ? "Yes" : "No"}</dd></div><div><dt>Additional versions</dt><dd>{versions.length ? versions.map(({ id, branch }) => `${id.trim()} → ${branch.trim()}`).join(", ") : "None"}</dd></div><div><dt>Expected documentation URL</dt><dd><code>/{defaultLocale}/project/{form.slug.trim()}/latest/</code></dd></div></dl>
                {submitError && <p className="registration-inline-error" role="alert">{submitError}</p>}
                <div className="registration-actions"><button type="button" className="registration-secondary-button" onClick={() => setStep(3)}>Edit details</button><button className="dashboard-add-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="registration-spinner" size={16} /> : <Plus size={16} />} Submit request</button></div>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
