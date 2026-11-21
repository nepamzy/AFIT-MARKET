-- 1. Accounts that exist today can still order while ordering is closed to newcomers. New accounts fill a cart and wait.
create table public.ordering_early_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.ordering_early_access enable row level security;
revoke all on public.ordering_early_access from public, anon, authenticated;
grant all on public.ordering_early_access to service_role;
insert into public.ordering_early_access (user_id) select id from auth.users on conflict do nothing;

do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.create_orders(jsonb, uuid, text, boolean, text)'::regprocedure) into d;
  n := replace(d, 'and not app_private.has_role(''platform_admin'') then',
                  'and not app_private.has_role(''platform_admin'')' || E'\n' || '     and not exists (select 1 from public.ordering_early_access e where e.user_id = v_actor) then');
  if n = d then raise exception 'ordering gate text not found'; end if;
  execute n;
end $$;

-- 2. Shop sign-up is by invitation during the beta: one link per shop, each usable once.
create or replace function app_private.setting_rule(p_key text) returns table (kind text, lo bigint, hi bigint, choices text[])
language sql immutable set search_path = ''
as $$
  select r.kind, r.lo, r.hi, r.choices from (values
    ('delivery_fee_kobo', 'int', 0::bigint, 1000000::bigint, null::text[]),
    ('platform_fee_bps', 'int', 0, 0, null),
    ('vendor_commission_bps', 'int', 0, 2000, null),
    ('commission_afit_bps', 'int', 0, 2000, null),
    ('unpaid_order_expiry_minutes', 'int', 5, 1440, null),
    ('max_cart_item_quantity', 'int', 1, 100, null),
    ('handover_token_ttl_minutes', 'int', 5, 720, null),
    ('location_max_accuracy_m', 'int', 5, 500, null),
    ('location_max_age_seconds', 'int', 5, 600, null),
    ('location_min_interval_seconds', 'int', 1, 60, null),
    ('location_stale_after_seconds', 'int', 10, 600, null),
    ('arrival_max_accuracy_m', 'int', 5, 200, null),
    ('arrival_max_age_seconds', 'int', 5, 120, null),
    ('default_geofence_radius_m', 'int', 10, 500, null),
    ('location_history_retention_hours', 'int', 1, 720, null),
    ('delivery_proof_ttl_minutes', 'int', 5, 120, null),
    ('refund_support_approval_limit_kobo', 'int', 0, 100000000, null),
    ('typed_signature_enabled', 'bool', null, null, null),
    ('refund_fee_policy', 'enum', null, null, array['none', 'proportional_service_fee']),
    ('return_policy', 'return_policy', null, null, null),
    ('settlement_policy', 'locked', null, null, null),
    ('mock_payments_enabled', 'locked', null, null, null),
    ('rider_terms_current_version', 'locked', null, null, null),
    ('delivery_fee_collection_mode', 'enum', null, null, array['paystack', 'direct_to_rider']),
    ('location_send_interval_seconds', 'int', 5, 300, null),
    ('payout_hold_hours', 'int', 1, 720, null),
    ('vendor_response_hours', 'int', 15, 20, null),
    ('pay_on_delivery_enabled', 'bool', null, null, null),
    ('pay_on_delivery_max_kobo', 'int', 100000, 20000000, null),
    ('ordering_open', 'bool', null, null, null),
    ('payment_split_enabled', 'bool', null, null, null),
    ('vendor_invite_only', 'bool', null, null, null)
  ) as r(key, kind, lo, hi, choices) where r.key = p_key
$$;

insert into public.platform_settings (key, value, note) values
  ('vendor_invite_only', 'true'::jsonb, 'Shop sign-up is by personal invitation link only (each link works once). Switch off to open shop sign-up to everyone.')
on conflict (key) do nothing;

create table public.vendor_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[0-9a-f]{24}$'),
  label text check (label is null or char_length(label) <= 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index vendor_invites_created_idx on public.vendor_invites (created_at desc);
alter table public.vendor_invites enable row level security;
revoke all on public.vendor_invites from public, anon, authenticated;
grant all on public.vendor_invites to service_role;

create function public.admin_create_vendor_invites(p_count int, p_label text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_platform_admin(); v_label text := nullif(btrim(coalesce(p_label, '')), ''); v_out jsonb := '[]'::jsonb; i int; v_tok text; v_id uuid;
begin
  if p_count is null or p_count < 1 or p_count > 200 then raise exception 'invalid count' using errcode = '22023'; end if;
  if v_label is not null and char_length(v_label) > 60 then raise exception 'label too long' using errcode = '22023'; end if;
  for i in 1..p_count loop
    v_tok := encode(extensions.gen_random_bytes(12), 'hex');
    insert into public.vendor_invites (token, label, created_by)
      values (v_tok, case when v_label is null then null when p_count = 1 then v_label else v_label || ' #' || i end, v_actor)
      returning id into v_id;
    v_out := v_out || jsonb_build_object('id', v_id, 'token', v_tok);
  end loop;
  perform app_private.audit_write(v_actor, 'vendor_invites.created', 'vendor_invite', 'batch', jsonb_build_object('count', p_count));
  return v_out;
end $$;

create function public.admin_list_vendor_invites() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_platform_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token, 'label', t.label, 'created_at', t.created_at,
            'used_at', t.used_at, 'revoked_at', t.revoked_at, 'used_by_name', t.nm) order by t.created_at desc, t.id)
          from (select i.*, d.full_name as nm from public.vendor_invites i left join public.profile_details d on d.user_id = i.used_by
                 order by i.created_at desc limit 500) t), '[]'::jsonb);
end $$;

create function public.admin_revoke_vendor_invite(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_platform_admin();
begin
  update public.vendor_invites set revoked_at = now() where id = p_id and used_at is null and revoked_at is null;
  perform app_private.audit_write(v_actor, 'vendor_invite.revoked', 'vendor_invite', p_id::text, '{}'::jsonb);
end $$;

-- the sign-up page and the join page ask whether a link is still good (server side only)
create function public.vendor_invite_check(p_token text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('label', i.label) from public.vendor_invites i
   where i.token = p_token and i.used_at is null and i.revoked_at is null
$$;

-- uses a link for a person, once. True when this person now holds the invitation (also when they already did).
create function public.vendor_invite_consume(p_token text, p_user uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if exists (select 1 from public.vendor_invites where used_by = p_user) then return true; end if;
  update public.vendor_invites set used_by = p_user, used_at = now()
   where token = p_token and used_at is null and revoked_at is null returning id into v_id;
  if v_id is null then return false; end if;
  perform app_private.audit_write(p_user, 'vendor_invite.used', 'vendor_invite', v_id::text, '{}'::jsonb);
  return true;
end $$;

revoke all on function public.admin_create_vendor_invites(int, text), public.admin_list_vendor_invites(), public.admin_revoke_vendor_invite(uuid),
  public.vendor_invite_check(text), public.vendor_invite_consume(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_vendor_invites(int, text), public.admin_list_vendor_invites(), public.admin_revoke_vendor_invite(uuid) to authenticated;
grant execute on function public.vendor_invite_check(text), public.vendor_invite_consume(text, uuid) to service_role;

-- A shop application needs an invitation while invitations are required (administrators are exempt).
create function app_private.vendor_apply_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce((select (s.value #>> '{}') = 'true' from public.platform_settings s where s.key = 'vendor_invite_only'), true)
     and not exists (select 1 from public.vendor_invites i where i.used_by = new.applicant_id)
     and not exists (select 1 from public.role_assignments r where r.user_id = new.applicant_id and r.role = 'platform_admin' and r.status = 'active') then
    raise exception 'invite_required' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app_private.vendor_apply_guard() from public, anon, authenticated;
create trigger vendor_applications_invite_guard before insert on public.vendor_applications
  for each row execute function app_private.vendor_apply_guard();
