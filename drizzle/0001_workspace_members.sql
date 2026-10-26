CREATE TABLE IF NOT EXISTS workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_members_workspace_user_unique UNIQUE (workspace_id, clerk_user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (clerk_user_id);
