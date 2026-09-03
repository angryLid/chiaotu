-- Rule-set policies: four symbolic targets collapse into three, and `policy_node` is dropped.
--
-- Before: DIRECT / REJECT (mihomo built-ins), PROXY (the always-present
-- "🌐 手动选择" group), NODE (the single node named by `policy_node`).
-- After: DIRECT / REJECT unchanged, plus GROUP — the generated config declares a
-- dedicated select group per rule set holding DIRECT, "🌐 手动选择" and every
-- projected node, and the RULE-SET line points at that group. It subsumes both
-- PROXY (pick 🌐 手动选择 in the client) and NODE (pick that node in the client),
-- which is why `policy_node` no longer has anything to express.
--
-- Data migration: PROXY and NODE both become GROUP. A NODE rule set therefore
-- loses its pinned node — the group's effective member is whatever the client
-- selects — so those users have to pick the node once in the client. Already
-- generated configs are static text and are unaffected until regenerated.
--
-- `policy_node` is dropped rather than kept as a permanently-NULL column: under
-- the new model the value is meaningless, and keeping it would leave a dead field
-- in the wire representation and the OpenAPI contract forever.
alter table public.rule_sets
    drop constraint if exists rule_sets_policy_node_check;
alter table public.rule_sets
    drop constraint if exists rule_sets_policy_check;
alter table public.rule_sets
    drop constraint if exists rule_sets_name_check;

update public.rule_sets
set policy = 'GROUP'
where policy in ('PROXY', 'NODE');

alter table public.rule_sets
    drop column if exists policy_node;

alter table public.rule_sets
    alter column policy set default 'GROUP';

alter table public.rule_sets
    add constraint rule_sets_policy_check
        check (policy in ('DIRECT', 'REJECT', 'GROUP'));

-- With the GROUP policy the name is emitted inside the comma-separated
-- `RULE-SET,<key>,<target>` line of a generated config, so a comma would split
-- that line into a malformed rule and make mihomo reject the whole config. Control
-- characters are rejected for the same reason. Enforced in the DB as well as the
-- API, mirroring the item payload check. The API's mirror (`/[,\p{Cc}]/u`) is
-- marginally stricter — it also covers the C1 range — and the API is the only
-- writer, so the two can never disagree on what actually gets stored.
--
-- Names predate that constraint, so offending ones are rewritten before it is
-- added: the offending characters become spaces and the id is appended, which
-- keeps the result unique (ids are unique) without depending on what the other
-- names happen to be. The rewrite is visible in the UI, so it can be renamed.
update public.rule_sets
set name = btrim(left(regexp_replace(name, '[,[:cntrl:]]', ' ', 'g'), 90)) || ' #' || id
where name ~ '[,[:cntrl:]]'
   or btrim(name) = '';

alter table public.rule_sets
    add constraint rule_sets_name_check
        check (name <> '' and name !~ '[,[:cntrl:]]');
