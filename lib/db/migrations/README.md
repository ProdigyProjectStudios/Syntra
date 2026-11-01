# Reviewed additive database changes

`20261101_solution_blueprint.sql` adds one nullable JSONB column to existing
consultations. It does not change the brief, messages, ownership, or turn receipts.
The application stores the Blueprint document and bounded idempotency receipts in
this column. Existing null values read as an empty version-0 document. The first Update from
brief action, brief edit or completed consultation turn populates it from the
current eight-field brief. Reading a session does not silently write a new
version; no backfill or destructive migration is needed.

Apply the SQL through the existing authenticated deployment's migration process
before deploying a Blueprint-aware API. The application never runs it on startup.
A five-second lock timeout prevents waiting indefinitely for production traffic;
retry the migration through that process if the lock cannot be obtained. Verify
that the column exists before promoting the new API. The previous application can
run with the extra nullable column; do not drop it to roll back application code.
Dropping it would destroy saved Blueprints.

No production database or migration was accessed during this engineering run.
