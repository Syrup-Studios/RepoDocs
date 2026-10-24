import { useEffect, useState } from "react";
import { Github, LogOut } from "lucide-react";

type Session = { user: { id: number; login: string; avatarUrl: string }; csrfToken: string };
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");

export function AccountMenu({ session: providedSession, loading: providedLoading, onSessionChange }: {
  session?: Session | null;
  loading?: boolean;
  onSessionChange?: (session: Session | null) => void;
} = {}) {
  const [internalSession, setInternalSession] = useState<Session | null>(null);
  const [internalLoading, setInternalLoading] = useState(Boolean(apiBase));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (providedSession !== undefined || providedLoading !== undefined) return;
    if (!apiBase) {
      setInternalLoading(false);
      return;
    }
    fetch(`${apiBase}/api/me`, { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Session request failed");
        return response.json() as Promise<Session>;
      })
      .then(setInternalSession)
      .catch(() => setError(true))
      .finally(() => setInternalLoading(false));
  }, [providedSession, providedLoading]);

  const session = providedSession === undefined ? internalSession : providedSession;
  const isLoading = providedLoading ?? internalLoading;

  async function signOut() {
    try {
      const response = await fetch(`${apiBase}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": session!.csrfToken },
      });
      if (!response.ok) throw new Error("Sign out failed");
      if (providedSession !== undefined) onSessionChange?.(null);
      else setInternalSession(null);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="account-menu">
      {!apiBase ? <span className="account-status" role="status">Account service unavailable</span> : isLoading ? <span className="account-status" role="status">Loading account…</span> : error && !session ? <span className="account-status" role="status">Account service unavailable</span> : session ? (
        <details>
          <summary aria-label={`Account menu for ${session.user.login}`}>
            <img src={session.user.avatarUrl} alt="" width="28" height="28" />
            <span>{session.user.login}</span>
          </summary>
          <div className="account-dropdown">
            <a href="/dashboard/">My Repositories</a>
            <button type="button" onClick={signOut}><LogOut size={15} /> Sign out</button>
          </div>
        </details>
      ) : (
        <a className="account-sign-in" href={`${apiBase}/auth/github`}><Github size={16} /> Sign in</a>
      )}
      {error && session && <span className="account-error" role="status">Account service unavailable</span>}
    </div>
  );
}
