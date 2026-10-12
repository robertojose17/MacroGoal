-- Review-only SQL proposal. No migration has been created or applied.
-- Nullable preserves the existing device-locale fallback for unsynced users.
-- No backfill, deletes, grants, policies, functions, or auth changes.
ALTER TABLE public.users ADD COLUMN preferred_language text
  CHECK (preferred_language IN ('en', 'es'));
