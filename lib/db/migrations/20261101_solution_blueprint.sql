-- Additive only. Review/apply in the existing deployment's migration workflow
-- BEFORE deploying a Blueprint-aware API. This file is never run by app startup.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS blueprint jsonb;
COMMIT;
