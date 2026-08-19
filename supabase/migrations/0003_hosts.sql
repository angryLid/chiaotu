-- Hosts profiles and entries. Deletes are soft and profile deletion cascades in the API.
create table if not exists public.hosts_profiles (
    id bigint generated always as identity primary key,
    name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create table if not exists public.hosts_entries (
    id bigint generated always as identity primary key,
    profile_id bigint not null references public.hosts_profiles(id),
    domain text not null,
    ip text not null default '',
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create unique index if not exists hosts_profiles_name_active_key
    on public.hosts_profiles (name) where deleted_at is null;
create unique index if not exists hosts_entries_profile_domain_active_key
    on public.hosts_entries (profile_id, domain) where deleted_at is null;
create index if not exists hosts_entries_profile_active_key
    on public.hosts_entries (profile_id) where deleted_at is null;

drop trigger if exists hosts_profiles_set_updated_at on public.hosts_profiles;
create trigger hosts_profiles_set_updated_at before update on public.hosts_profiles
for each row execute function public.set_updated_at();
drop trigger if exists hosts_entries_set_updated_at on public.hosts_entries;
create trigger hosts_entries_set_updated_at before update on public.hosts_entries
for each row execute function public.set_updated_at();

alter table public.hosts_profiles enable row level security;
alter table public.hosts_entries enable row level security;

-- Atomically soft-delete a profile and all of its active entries. The API uses
-- this RPC instead of issuing two independent updates.
create or replace function public.soft_delete_hosts_profile(p_profile_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted_at timestamptz := now();
begin
    perform 1
    from public.hosts_profiles
    where id = p_profile_id
      and deleted_at is null
    for update;

    if not found then
        return false;
    end if;

    update public.hosts_entries
    set deleted_at = v_deleted_at,
        updated_at = v_deleted_at
    where profile_id = p_profile_id
      and deleted_at is null;

    update public.hosts_profiles
    set deleted_at = v_deleted_at,
        updated_at = v_deleted_at
    where id = p_profile_id
      and deleted_at is null;

    return true;
end;
$$;

revoke execute on function public.soft_delete_hosts_profile(bigint) from public;
grant execute on function public.soft_delete_hosts_profile(bigint) to service_role;
