-- Apply before deploying the API change. Legacy conversations remain private and
-- cannot be reopened without a separate owner-approved migration strategy.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS owner_session_hash text;
CREATE INDEX IF NOT EXISTS conversations_owner_session_hash_idx
  ON conversations (owner_session_hash);
