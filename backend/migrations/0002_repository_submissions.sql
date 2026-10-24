CREATE TABLE repository_submissions (
  id TEXT PRIMARY KEY,
  github_repo_id INTEGER NOT NULL UNIQUE,
  repo_full_name TEXT NOT NULL,
  requester_github_id INTEGER NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  config_yaml TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating', 'pending_approval', 'closed', 'rejected')),
  pr_url TEXT,
  pr_number INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX repository_submissions_requester ON repository_submissions (requester_github_id, updated_at DESC);
