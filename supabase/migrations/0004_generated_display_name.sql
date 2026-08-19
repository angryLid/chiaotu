-- Generated artifacts may have an optional, duplicated user-facing name.
-- This is intentionally separate from upstream user subscriptions.
alter table public.generated
    add column if not exists display_name text;
