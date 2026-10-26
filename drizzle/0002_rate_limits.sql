CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0)
);
