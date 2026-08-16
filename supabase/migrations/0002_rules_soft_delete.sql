-- rules: add soft-delete tombstone, mirroring subscriptions / generated.
-- Deletes are soft (deleted_at set by the API); active rows are excluded from
-- all reads via `.is("deleted_at", null)`.

alter table public.rules
    add column if not exists deleted_at timestamptz;

-- The original inline `unique` on rules.name created an unnamed constraint
-- (rules_name_key). Under soft-delete a plain unique constraint would reserve a
-- deleted rule's name forever. Replace it with a partial unique index scoped to
-- active rows so a name can be reused after soft-delete.
alter table public.rules drop constraint if exists rules_name_key;
create unique index if not exists rules_name_active_key
    on public.rules (name) where deleted_at is null;