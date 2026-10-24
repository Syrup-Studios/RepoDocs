CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL,
  login TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  csrf_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_expiration ON sessions (expires_at);
