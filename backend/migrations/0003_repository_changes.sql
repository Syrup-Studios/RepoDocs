CREATE TABLE repository_changes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  github_repo_id INTEGER NOT NULL,
  repo_full_name TEXT NOT NULL,
  requester_github_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('edit', 'delete')),
  config_yaml TEXT,
  payload_hash TEXT NOT NULL,
  branch TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('creating', 'pending_approval', 'closed', 'merged')),
  pr_url TEXT,
  pr_number INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX repository_changes_active_slug ON repository_changes (slug) WHERE status IN ('creating', 'pending_approval');
CREATE INDEX repository_changes_requester ON repository_changes (requester_github_id, updated_at DESC);

CREATE TABLE repository_refreshes (
  github_repo_id INTEGER PRIMARY KEY,
  requester_github_id INTEGER NOT NULL,
  requested_at INTEGER NOT NULL
);
