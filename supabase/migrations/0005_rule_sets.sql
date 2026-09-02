-- Rule sets: named collections of mihomo routing matchers, each distributed as
-- its own standalone `classical` rule-provider payload.
--
-- Distribution model (mirrors `generated`): `slug` is the public capability —
-- GET /api/rulesets/payload/{slug} is unauthenticated because the link itself is
-- the secret. Generated configs reference that URL from `rule-providers`, so the
-- payload is a live reference, not a snapshot.
--
-- `key` (the YAML key the generated config declares under `rule-providers`) is
-- deliberately NOT stored: it is a pure function of the id (`chiaotu_rs_<id>`)
-- computed by the API (see api/_lib/rule-sets.ts ruleSetKey). Deriving it in one
-- place keeps it collision-free against the base template's own provider names
-- (ai_non_ip, lan_ip, global_non_ip, …) without a DB expression — the untyped
-- `||` operator against a bigint is only STABLE, so a generated column would
-- need an explicit `id::text` cast; not worth the deploy-time risk for derived
-- data the API already owns.
--
-- `policy` is symbolic, not a literal proxy-group name: the generated config's
-- group names depend on which projection rules were selected at generation time,
-- so storing a literal name here would dangle. DIRECT / REJECT map to the
-- built-ins, PROXY resolves to the always-present "🌐 手动选择" group, and NODE
-- resolves to the single node named by `policy_node`.
create table if not exists public.rule_sets (
    id          bigint generated always as identity primary key,
    name        text        not null,
    slug        text        not null,
    policy      text        not null default 'PROXY',
    policy_node text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    deleted_at  timestamptz,
    constraint rule_sets_policy_check
        check (policy in ('DIRECT', 'REJECT', 'PROXY', 'NODE')),
    -- A NODE policy is meaningless without the node it points at, and a
    -- non-NODE policy must not carry a stale node name.
    constraint rule_sets_policy_node_check check (
        (policy = 'NODE' and policy_node is not null and policy_node <> '')
        or (policy <> 'NODE' and policy_node is null)
    )
);

-- One matcher of a rule set: `type,payload` renders verbatim as one line of the
-- classical payload. `enabled` false keeps the row but omits the line.
create table if not exists public.rule_set_items (
    id          bigint generated always as identity primary key,
    rule_set_id bigint      not null references public.rule_sets(id),
    type        text        not null,
    payload     text        not null,
    enabled     boolean     not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    deleted_at  timestamptz,
    -- Whitelist enforced in the DB as well as the API: an unknown rule type makes
    -- mihomo reject the whole config, not just the offending line.
    constraint rule_set_items_type_check check (
        type in (
            'DOMAIN',
            'DOMAIN-SUFFIX',
            'DOMAIN-KEYWORD',
            'DOMAIN-WILDCARD',
            'IP-CIDR'
        )
    ),
    -- A comma / whitespace / newline in the payload would break the one-matcher-
    -- per-line text format the provider is served as.
    constraint rule_set_items_payload_check check (
        payload <> '' and payload !~ '[,[:space:]]'
    )
);

-- Names are unique among active rule sets only, so a soft-deleted name is reusable.
create unique index if not exists rule_sets_name_active_key
    on public.rule_sets (name) where deleted_at is null;
-- The slug is the capability, so it must resolve to at most one row. Kept global
-- (not scoped to active rows) so a rotated / deleted slug is never re-issued.
create unique index if not exists rule_sets_slug_key
    on public.rule_sets (slug);
create unique index if not exists rule_set_items_set_matcher_active_key
    on public.rule_set_items (rule_set_id, type, payload) where deleted_at is null;
create index if not exists rule_set_items_set_active_key
    on public.rule_set_items (rule_set_id) where deleted_at is null;

drop trigger if exists rule_sets_set_updated_at on public.rule_sets;
create trigger rule_sets_set_updated_at before update on public.rule_sets
for each row execute function public.set_updated_at();
drop trigger if exists rule_set_items_set_updated_at on public.rule_set_items;
create trigger rule_set_items_set_updated_at before update on public.rule_set_items
for each row execute function public.set_updated_at();

alter table public.rule_sets      enable row level security;
alter table public.rule_set_items enable row level security;

-- Atomically soft-delete a rule set and all of its active items. Mirrors
-- soft_delete_hosts_profile: the API uses this RPC instead of issuing two
-- independent updates.
create or replace function public.soft_delete_rule_set(p_rule_set_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted_at timestamptz := now();
begin
    perform 1
    from public.rule_sets
    where id = p_rule_set_id
      and deleted_at is null
    for update;

    if not found then
        return false;
    end if;

    update public.rule_set_items
    set deleted_at = v_deleted_at,
        updated_at = v_deleted_at
    where rule_set_id = p_rule_set_id
      and deleted_at is null;

    update public.rule_sets
    set deleted_at = v_deleted_at,
        updated_at = v_deleted_at
    where id = p_rule_set_id
      and deleted_at is null;

    return true;
end;
$$;

revoke execute on function public.soft_delete_rule_set(bigint) from public;
grant execute on function public.soft_delete_rule_set(bigint) to service_role;
