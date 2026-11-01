-- Development schema / reviewed deployment diff. No startup or build-time DDL.
CREATE TABLE IF NOT EXISTS ai_usage_windows (
  key text PRIMARY KEY,
  used integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_windows_expiry_idx ON ai_usage_windows (expires_at);
