-- Automatic "ready", automatic decline of unanswered paid orders, and a shop's own riders (permanent 5-digit codes).
-- ADDITIVE except three functions replaced with the same body plus one rule each (rider offers / accept / vendor_transition_order).

-- 1. Settings -----------------------------------------------------------------------------------------------------------
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
    ('payout_hold_hours', 'int', 1, 720, null),
    ('vendor_response_hours', 'int', 15, 20, null)
  ) as r(key, kind, lo, hi, choices) where r.key = p_key
$$;

insert into public.platform_settings (key, value, note) values
  ('vendor_response_hours', '15'::jsonb, 'Owner-approved: hours a shop has to accept or decline a paid order (15 to 20). After that the order is declined and the customer is refunded automatically.')
on conflict (key) do nothing;

-- 2. Auto-ready choice: on the application (onboarding) and on the shop -----------------------------------------------------
alter table public.vendor_applications
  add column auto_ready_enabled boolean not null default false,
  add column auto_ready_minutes int,
  add constraint vendor_applications_auto_ready check (auto_ready_minutes is null or auto_ready_minutes in (30, 60, 90, 120, 180)),
  add constraint vendor_applications_auto_ready_set check (not auto_ready_enabled or auto_ready_minutes is not null);
alter table public.vendors
  add column auto_ready_enabled boolean not null default false,
  add column auto_ready_minutes int,
  add constraint vendors_auto_ready check (auto_ready_minutes is null or auto_ready_minutes in (30, 60, 90, 120, 180)),
  add constraint vendors_auto_ready_set check (not auto_ready_enabled or auto_ready_minutes is not null);

-- a newly approved shop takes the choice made on its application
create function app_private.vendor_take_auto_ready() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_a public.vendor_applications%rowtype;
begin
  select * into v_a from public.vendor_applications where applicant_id = new.owner_id and auto_ready_enabled order by created_at desc limit 1;
  if found then new.auto_ready_enabled := true; new.auto_ready_minutes := v_a.auto_ready_minutes; end if;
  return new;
end $$;
create trigger vendors_take_auto_ready before insert on public.vendors for each row execute function app_private.vendor_take_auto_ready();

create function public.application_set_auto_ready(p_enabled boolean, p_minutes int) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  if p_enabled and (p_minutes is null or p_minutes not in (30, 60, 90, 120, 180)) then raise exception 'invalid_minutes' using errcode = '22023'; end if;
  select id into v_id from public.vendor_applications where applicant_id = v_actor and status = 'pending' order by created_at desc limit 1;
  if v_id is null then raise exception 'no_pending_application' using errcode = '22023'; end if;
  update public.vendor_applications set auto_ready_enabled = coalesce(p_enabled, false), auto_ready_minutes = case when p_enabled then p_minutes end where id = v_id;
end $$;

create function public.vendor_set_auto_ready(p_vendor uuid, p_enabled boolean, p_minutes int) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  if p_enabled and (p_minutes is null or p_minutes not in (30, 60, 90, 120, 180)) then raise exception 'invalid_minutes' using errcode = '22023'; end if;
  update public.vendors set auto_ready_enabled = coalesce(p_enabled, false), auto_ready_minutes = case when p_enabled then p_minutes end where id = p_vendor;
  perform app_private.audit_write(v_actor, 'vendor.auto_ready', 'vendor', p_vendor::text, jsonb_build_object('enabled', coalesce(p_enabled, false), 'minutes', p_minutes));
end $$;

-- 3. "Ready" as one reusable step (shop button and the automatic path) -------------------------------------------------------
create function app_private.ready_order(p_order uuid, p_actor uuid, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_o public.orders%rowtype; v_nonce text;
begin
  select * into v_o from public.orders where id = p_order;
  if v_o.status = 'ACCEPTED' then
    perform app_private.step_order(p_order, 'ACCEPTED', 'PREPARING', p_actor, 'vendor_preparing');
  end if;
  perform app_private.step_order(p_order, 'PREPARING', 'READY', p_actor, p_reason);
  if v_o.fulfilment = 'pickup' then
    v_nonce := encode(extensions.gen_random_bytes(12), 'hex');
    insert into public.pickup_codes (order_id, nonce, code_hash, expires_at) values (p_order, v_nonce, null, now() + interval '48 hours');
    perform app_private.step_order(p_order, 'READY', 'PICKUP_AWAITING_HANDOVER', p_actor, 'pickup_code_issued');
  else
    perform app_private.step_order(p_order, 'READY', 'AWAITING_RIDER', p_actor, 'awaiting_rider');
  end if;
end $$;

create or replace function public.vendor_transition_order(p_order uuid, p_action text, p_reason text default null) returns text
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app_private.require_vendor_actor(v_o.vendor_id);
  select * into v_o from public.orders where id = p_order for update;

  if p_action = 'accept' then
    perform app_private.step_order(p_order, 'PAID', 'ACCEPTED', v_actor, 'vendor_accepted');
    perform app_private.step_order(p_order, 'ACCEPTED', 'PREPARING', v_actor, 'vendor_preparing');
  elsif p_action = 'reject' then
    if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
    perform app_private.step_order(p_order, 'PAID', 'CANCELLED', v_actor, 'vendor_rejected: ' || left(btrim(p_reason), 200));
    perform app_private.release_order_stock(p_order);
  elsif p_action = 'start_preparing' then
    if v_o.status <> 'PREPARING' then
      perform app_private.step_order(p_order, 'ACCEPTED', 'PREPARING', v_actor, 'vendor_preparing');
    end if;
  elsif p_action = 'mark_ready' then
    perform app_private.ready_order(p_order, v_actor, 'vendor_ready');
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  perform app_private.audit_write(v_actor, 'order.' || p_action, 'order', p_order::text, '{}'::jsonb);
  return (select status from public.orders where id = p_order);
end $$;

-- 4. The two timers (service role / the database scheduler) -----------------------------------------------------------------
-- Orders in PREPARING whose shop turned on automatic ready become ready once the chosen time, counted from payment, has passed.
create function public.auto_ready_run() returns int
language plpgsql security definer set search_path = ''
as $$
declare r record; n int := 0;
begin
  for r in
    select o.id from public.orders o join public.vendors v on v.id = o.vendor_id
     where o.status = 'PREPARING' and v.auto_ready_enabled and v.auto_ready_minutes is not null
       and now() >= (select max(h.created_at) from public.order_status_history h where h.order_id = o.id and h.to_status = 'PAID')
                    + make_interval(mins => v.auto_ready_minutes)
     order by o.updated_at limit 100
     for update of o skip locked
  loop
    perform app_private.ready_order(r.id, null, 'auto_ready');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Paid orders the shop never answered within the allowed hours are declined; the server then refunds them automatically.
create function public.auto_decline_unanswered() returns int
language plpgsql security definer set search_path = ''
as $$
declare r record; n int := 0; v_hours int := least(greatest(app_private.setting_int('vendor_response_hours', 15)::int, 15), 20);
begin
  for r in
    select o.id from public.orders o
     where o.status = 'PAID'
       and now() >= (select max(h.created_at) from public.order_status_history h where h.order_id = o.id and h.to_status = 'PAID') + make_interval(hours => v_hours)
     order by o.updated_at limit 100
     for update of o skip locked
  loop
    perform app_private.step_order(r.id, 'PAID', 'CANCELLED', null, 'vendor_rejected: The shop did not answer in time');
    perform app_private.release_order_stock(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- an automatic decline has no shop user behind it: the refund then records the system as the requester
create or replace function public.refund_auto_start(p_order uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_o public.orders%rowtype; v_r public.refunds%rowtype; v_actor uuid; v_balance bigint; v_txn uuid; v_ref text; v_found boolean;
begin
  if p_mode not in ('paystack_test', 'paystack_live') then raise exception 'invalid mode' using errcode = '22023'; end if;
  perform app_private.lock_order_row(p_order);
  select * into v_o from public.orders where id = p_order;
  if not found or v_o.status <> 'CANCELLED' then raise exception 'order_not_declined' using errcode = '22023'; end if;
  select true, coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid) into v_found, v_actor from public.order_status_history
   where order_id = p_order and to_status = 'CANCELLED' and reason like 'vendor_rejected%' order by id desc limit 1;
  if v_found is not true then raise exception 'order_not_declined' using errcode = '22023'; end if;

  select * into v_r from public.refunds where order_id = p_order and source = 'auto' and status in ('processing', 'succeeded', 'reconciliation_required') order by created_at limit 1;
  if not found then
    v_balance := app_private.order_received(p_order) - app_private.refund_active_total(p_order);
    if v_balance <= 0 then return null; end if;
    select id, reference into v_txn, v_ref from public.payment_transactions where order_id = p_order and status = 'succeeded' order by created_at limit 1;
    if v_txn is null then return null; end if;
    insert into public.refunds (order_id, transaction_id, amount_kobo, reason, requested_by, source, status, decided_at, decision_reason, provider_mode, executed_at)
      values (p_order, v_txn, v_balance, 'The shop declined the order', v_actor, 'auto', 'requested', null, null, 'none', null)
      returning * into v_r;
    update public.refunds set status = 'approved', decided_at = now(), decision_reason = 'Automatic: the shop declined the order' where id = v_r.id;
    update public.refunds set status = 'processing', provider_mode = p_mode, executed_at = now() where id = v_r.id returning * into v_r;
    perform app_private.refund_log(v_r.id, null, 'auto_started', 'requested', 'processing', 'shop declined the order');
    perform app_private.audit_write(null, 'refund.auto_started', 'order', p_order::text, jsonb_build_object('refund', v_r.id, 'amount_kobo', v_r.amount_kobo));
  end if;
  select reference into v_ref from public.payment_transactions where id = v_r.transaction_id;
  return jsonb_build_object('id', v_r.id, 'status', v_r.status, 'amount_kobo', v_r.amount_kobo, 'reference', v_ref,
                            'provider_ref', v_r.provider_refund_ref, 'mode', v_r.provider_mode);
end $$;

revoke all on function app_private.ready_order(uuid, uuid, text), app_private.vendor_take_auto_ready() from public, anon, authenticated;
revoke all on function public.auto_ready_run(), public.auto_decline_unanswered() from public, anon, authenticated;
grant execute on function public.auto_ready_run(), public.auto_decline_unanswered() to service_role;

-- 5. A shop's own riders: a permanent 5-digit code per rider -------------------------------------------------------------------
create table public.vendor_riders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  code text not null unique check (code ~ '^[0-9]{5}$'),
  rider_user_id uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index vendor_riders_one_link on public.vendor_riders (rider_user_id) where rider_user_id is not null and revoked_at is null;
create index vendor_riders_vendor_idx on public.vendor_riders (vendor_id);
alter table public.vendor_riders enable row level security;
revoke all on public.vendor_riders from public, anon, authenticated;
grant all on public.vendor_riders to service_role;

create function public.vendor_rider_create(p_vendor uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_code text; v_id uuid; v_try int := 0;
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  if p_name is null or char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 60 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if (select count(*) from public.vendor_riders where vendor_id = p_vendor and revoked_at is null) >= 20 then raise exception 'too_many_riders' using errcode = '22023'; end if;
  loop
    v_code := lpad(((get_byte(extensions.gen_random_bytes(3), 0) * 65536 + get_byte(extensions.gen_random_bytes(3), 1) * 256 + get_byte(extensions.gen_random_bytes(3), 2)) % 90000 + 10000)::text, 5, '0');
    begin
      insert into public.vendor_riders (vendor_id, name, code) values (p_vendor, btrim(p_name), v_code) returning id into v_id;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'could not allocate a code'; end if;
    end;
  end loop;
  perform app_private.audit_write(v_actor, 'vendor.rider_added', 'vendor', p_vendor::text, jsonb_build_object('vendor_rider', v_id));
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

create function public.vendor_rider_list(p_vendor uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.require_vendor_actor(p_vendor);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'code', x.code, 'linked', x.rider_user_id is not null,
            'rider_name', x.full_name, 'rider_status', x.status, 'claimed_at', x.claimed_at, 'created_at', x.created_at) order by x.created_at), '[]'::jsonb)
            from (select r.*, rp.full_name, rp.status from public.vendor_riders r left join public.rider_profiles rp on rp.user_id = r.rider_user_id
                   where r.vendor_id = p_vendor and r.revoked_at is null order by r.created_at limit 50) x);
end $$;

create function public.vendor_rider_revoke(p_vendor uuid, p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  update public.vendor_riders set revoked_at = now() where id = p_id and vendor_id = p_vendor and revoked_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app_private.audit_write(v_actor, 'vendor.rider_removed', 'vendor', p_vendor::text, jsonb_build_object('vendor_rider', p_id));
end $$;

-- service role only: check a code before sign-up, and claim it once the rider's account exists
create function public.vendor_rider_code_check(p_code text) returns jsonb
language sql security definer set search_path = ''
as $$
  select jsonb_build_object('vendor_id', v.id, 'vendor_name', v.name) from public.vendor_riders r join public.vendors v on v.id = r.vendor_id
   where r.code = p_code and r.rider_user_id is null and r.revoked_at is null and v.status = 'approved'
$$;
create function public.rider_link_code(p_user uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_r public.vendor_riders%rowtype; v_name text;
begin
  if exists (select 1 from public.vendor_riders where rider_user_id = p_user and revoked_at is null) then raise exception 'already_linked' using errcode = '22023'; end if;
  select * into v_r from public.vendor_riders where code = p_code and rider_user_id is null and revoked_at is null for update;
  if not found then raise exception 'code_not_found' using errcode = 'P0002'; end if;
  update public.vendor_riders set rider_user_id = p_user, claimed_at = now() where id = v_r.id;
  select name into v_name from public.vendors where id = v_r.vendor_id;
  return jsonb_build_object('vendor_id', v_r.vendor_id, 'vendor_name', v_name);
end $$;
-- the signed-in rider sees which shop they are linked to (their own link only)
create function public.my_rider_link() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  return (select jsonb_build_object('vendor_id', v.id, 'vendor_name', v.name) from public.vendor_riders r join public.vendors v on v.id = r.vendor_id
           where r.rider_user_id = v_actor and r.revoked_at is null);
end $$;

revoke all on function public.application_set_auto_ready(boolean, int), public.vendor_set_auto_ready(uuid, boolean, int),
  public.vendor_rider_create(uuid, text), public.vendor_rider_list(uuid), public.vendor_rider_revoke(uuid, uuid),
  public.vendor_rider_code_check(text), public.rider_link_code(uuid, text), public.my_rider_link() from public, anon, authenticated;
grant execute on function public.application_set_auto_ready(boolean, int), public.vendor_set_auto_ready(uuid, boolean, int),
  public.vendor_rider_create(uuid, text), public.vendor_rider_list(uuid), public.vendor_rider_revoke(uuid, uuid), public.my_rider_link() to authenticated;
grant execute on function public.vendor_rider_code_check(text), public.rider_link_code(uuid, text) to service_role;

-- 6. Riders linked to a shop only see and take that shop's orders -------------------------------------------------------------
create or replace function public.list_delivery_offers() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_rider();
begin
  if not exists (select 1 from public.rider_shifts where rider_id = v_actor and ended_at is null) then
    raise exception 'not_active' using errcode = '22023';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number,
            'vendor_name', o.vendor_name, 'pickup', o.pickup_location_snapshot, 'deliver_to', o.delivery_point_label,
            'offered_at', o.updated_at) order by o.updated_at), '[]'::jsonb)
          from (select * from public.orders where fulfilment = 'delivery' and status = 'AWAITING_RIDER'
                 and not exists (select 1 from public.delivery_assignments d where d.order_id = orders.id
                                  and d.status in ('accepted', 'picked_up', 'en_route'))
                 and (not exists (select 1 from public.vendor_riders vr where vr.rider_user_id = v_actor and vr.revoked_at is null)
                      or exists (select 1 from public.vendor_riders vr where vr.rider_user_id = v_actor and vr.revoked_at is null
                                  and vr.vendor_id = orders.vendor_id))
                 order by updated_at limit 20) o);
end $$;

create or replace function public.rider_accept_order(p_order uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rider uuid := app_private.require_rider(); v_shift uuid; v_o public.orders%rowtype;
  v_existing public.delivery_assignments%rowtype; v_count int; v_slot int; v_no int; v_dp public.approved_delivery_points%rowtype;
  v_a uuid;
begin
  perform app_private.lock_rider(v_rider);
  perform app_private.require_terms_ack(v_rider);
  select id into v_shift from public.rider_shifts where rider_id = v_rider and ended_at is null;
  if v_shift is null then raise exception 'not_active' using errcode = '22023'; end if;

  perform app_private.lock_order_row(p_order);
  select * into v_o from public.orders where id = p_order;
  if not found then raise exception 'order_unavailable' using errcode = '22023'; end if;
  -- a rider linked to a shop only delivers that shop's orders
  if exists (select 1 from public.vendor_riders vr where vr.rider_user_id = v_rider and vr.revoked_at is null and vr.vendor_id <> v_o.vendor_id) then
    raise exception 'order_unavailable' using errcode = '22023';
  end if;
  select * into v_existing from public.delivery_assignments where order_id = p_order and status in ('accepted', 'picked_up', 'en_route');
  if found then
    if v_existing.rider_id = v_rider then
      return jsonb_build_object('assignment_id', v_existing.id, 'already_assigned', true);
    end if;
    raise exception 'order_unavailable' using errcode = '22023';
  end if;
  if v_o.fulfilment <> 'delivery' or v_o.status <> 'AWAITING_RIDER' then
    raise exception 'order_unavailable' using errcode = '22023';
  end if;
  perform app_private.test_seam('after_order_check');

  select count(*) into v_count from public.delivery_assignments d where d.rider_id = v_rider and d.status in ('accepted', 'picked_up', 'en_route');
  if v_count >= 5 then raise exception 'capacity_reached' using errcode = '22023'; end if;
  perform app_private.test_seam('after_capacity_check');

  select min(s) into v_slot from generate_series(1, 5) s
   where not exists (select 1 from public.delivery_assignments d where d.rider_id = v_rider and d.slot = s
                      and d.status in ('accepted', 'picked_up', 'en_route'));
  if v_slot is null then raise exception 'capacity_reached' using errcode = '22023'; end if;
  select coalesce(max(assignment_no), 0) + 1 into v_no from public.delivery_assignments where order_id = p_order;
  select * into v_dp from public.approved_delivery_points where id = v_o.delivery_point_id;

  begin
    insert into public.delivery_assignments (order_id, rider_id, shift_id, slot, assignment_no, dest_lat, dest_lng, dest_radius_m)
    values (p_order, v_rider, v_shift, v_slot, v_no, v_dp.lat, v_dp.lng,
            case when v_dp.lat is null then null else coalesce(v_dp.geofence_radius_m, app_private.setting_int('default_geofence_radius_m', 60)::int) end)
    returning id into v_a;
  exception when unique_violation then
    if exists (select 1 from public.delivery_assignments d where d.order_id = p_order and d.status in ('accepted', 'picked_up', 'en_route')) then
      raise exception 'order_unavailable' using errcode = '22023';
    end if;
    raise exception 'capacity_reached' using errcode = '22023';
  end;
  perform app_private.step_order(p_order, 'AWAITING_RIDER', 'RIDER_ASSIGNED', v_rider, 'rider_accepted');
  perform app_private.audit_write(v_rider, 'rider.accepted_order', 'order', p_order::text, jsonb_build_object('assignment', v_a, 'slot', v_slot));
  return jsonb_build_object('assignment_id', v_a, 'slot', v_slot, 'already_assigned', false);
end $$;

-- 7. The database scheduler (one minute) where it is available; the daily job calls the same two functions as a fallback ----------
do $cron$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('afit-auto-ready', '* * * * *', 'select public.auto_ready_run()');
exception when others then
  raise notice 'pg_cron not available here (%): the daily job runs auto ready instead', sqlerrm;
end $cron$;
