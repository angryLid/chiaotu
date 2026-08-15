-- friend-cats -> Supabase migration
-- The Go/SQLite backend is replaced by Vercel Edge Functions (chiaotu/api/) that
-- talk to this Supabase Postgres database. The Edge Functions are the ONLY data
-- access path and authenticate the shared API_TOKEN themselves; they talk to
-- Supabase with the service_role key (bypasses RLS).
--
-- Security model:
--   * RLS is enabled on every table but NO permissive policy is granted, so
--     direct anon-key / client access is blocked. Only the service_role key
--     (used by the Edge Functions) can read/write. The real auth boundary is the
--     API_TOKEN check inside the Edge Functions.
--   * To use Supabase Auth later, add policies and switch the functions to the
--     user's JWT — out of scope for now.
--
-- Behavioural notes vs the old Go backend:
--   * HTTP envelope {status, result} is preserved by the Edge Functions (they
--     speak the same REST contract), so the frontend does not change.
--   * Timestamps are native timestamptz (RFC3339 on the wire) instead of Unix
--     seconds.
--   * rule.filter is jsonb instead of raw JSON text.
--   * url fetching lives in the fetch-subscription Edge Function.
--   * Business rules (10-subscription cap, rule filter shape) live in the Edge
--     Functions (TS), not as DB triggers — single source of truth.

-- ===========================================================================
-- schema
-- ===========================================================================
create table if not exists public.subscriptions (
    id         bigint generated always as identity primary key,
    name       text        not null default '',
    url        text        not null default '',
    content    text        not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz                 -- soft-delete tombstone (NULL = active)
);

create table if not exists public.rules (
    id          bigint generated always as identity primary key,
    name        text        not null unique,
    filter      jsonb       not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists public.generated (
    id         bigint generated always as identity primary key,
    name       text        not null default '',
    content    text        not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

-- keep updated_at fresh on writes
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
    before update on public.subscriptions
    for each row execute function public.set_updated_at();

drop trigger if exists rules_set_updated_at on public.rules;
create trigger rules_set_updated_at
    before update on public.rules
    for each row execute function public.set_updated_at();

drop trigger if exists generated_set_updated_at on public.generated;
create trigger generated_set_updated_at
    before update on public.generated
    for each row execute function public.set_updated_at();

-- ===========================================================================
-- Row Level Security: enabled, but grant nothing -> only service_role (Edge
-- Functions) can access. Direct anon-key access is denied at the DB layer.
-- ===========================================================================
alter table public.subscriptions enable row level security;
alter table public.rules          enable row level security;
alter table public.generated      enable row level security;