-- Riders made by a shop. The shop creates the rider's account; a one-time 5-digit code is made for that account; the rider
-- enters the code when signing in and is then a rider linked to that shop. The code works once.
-- Replaces the earlier sign-up-code design (nothing in it was in use).

alter table public.vendor_riders add column email text, add column phone text;
drop function if exists public.vendor_rider_create(uuid, text), public.vendor_rider_code_check(text), public.rider_link_code(uuid, text);
drop function if exists public.vendor_rider_list(uuid), public.vendor_rider_revoke(uuid, uuid), public.my_rider_link();

-- 1. The shop reserves a rider slot (owner only); the app then creates the account and binds it ------------------------
create function public.vendor_rider_reserve(p_vendor uuid, p_name text, p_phone text, p_email text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_code text; v_id uuid; v_try int := 0;
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  if p_name is null or char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 60 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_phone is null or p_phone !~ '^[0-9+() -]{7,20}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if p_email is null or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(p_email) > 254 then raise exception 'invalid_email' using errcode = '22023'; end if;
  if (select count(*) from public.vendor_riders where vendor_id = p_vendor and revoked_at is null) >= 20 then raise exception 'too_many_riders' using errcode = '22023'; end if;
  loop
    v_code := lpad(((get_byte(extensions.gen_random_bytes(3), 0) * 65536 + get_byte(extensions.gen_random_bytes(3), 1) * 256 + get_byte(extensions.gen_random_bytes(3), 2)) % 90000 + 10000)::text, 5, '0');
    begin
      insert into public.vendor_riders (vendor_id, name, code, email, phone) values (p_vendor, btrim(p_name), v_code, lower(btrim(p_email)), btrim(p_phone)) returning id into v_id;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'could not allocate a code'; end if;
    end;
  end loop;
  perform app_private.audit_write(v_actor, 'vendor.rider_added', 'vendor', p_vendor::text, jsonb_build_object('vendor_rider', v_id));
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

-- service role only: bind the created account to the slot, or drop the slot if the account could not be created
create function public.vendor_rider_bind(p_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.vendor_riders set rider_user_id = p_user where id = p_id and rider_user_id is null and revoked_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;
create function public.vendor_rider_discard(p_id uuid) returns void
language sql security definer set search_path = ''
as $$ delete from public.vendor_riders where id = p_id and rider_user_id is null $$;

-- 2. The list the shop sees; removing a rider ------------------------------------------------------------------------------
create function public.vendor_rider_list(p_vendor uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.require_vendor_actor(p_vendor);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'email', x.email, 'phone', x.phone,
            'code', case when x.claimed_at is null then x.code end, 'linked', x.claimed_at is not null,
            'claimed_at', x.claimed_at, 'created_at', x.created_at) order by x.created_at), '[]'::jsonb)
            from (select r.* from public.vendor_riders r where r.vendor_id = p_vendor and r.revoked_at is null order by r.created_at limit 50) x);
end $$;

create function public.vendor_rider_revoke(p_vendor uuid, p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_r public.vendor_riders%rowtype; r record;
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  select * into v_r from public.vendor_riders where id = p_id and vendor_id = p_vendor and revoked_at is null for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.vendor_riders set revoked_at = now() where id = p_id;
  -- a rider the shop made stops being a rider when the shop removes them
  if v_r.claimed_at is not null and v_r.rider_user_id is not null then
    perform app_private.lock_rider(v_r.rider_user_id);
    update public.rider_profiles set status = 'suspended' where user_id = v_r.rider_user_id;
    update public.role_assignments set status = 'revoked', revoked_by = v_actor, revoked_at = now()
     where user_id = v_r.rider_user_id and role = 'rider' and status = 'active';
    for r in select id from public.delivery_assignments where rider_id = v_r.rider_user_id and status = 'accepted' loop
      perform app_private.release_assignment(r.id, 'rider_suspended', v_actor);
    end loop;
    for r in select id, order_id from public.delivery_assignments where rider_id = v_r.rider_user_id and status in ('picked_up', 'en_route') loop
      insert into public.rider_issues (assignment_id, order_id, rider_id, reason, note)
        values (r.id, r.order_id, v_r.rider_user_id, 'ops_flag', 'rider removed by the shop while delivery in progress');
    end loop;
    update public.rider_shifts set ended_at = now(), end_reason = 'suspended' where rider_id = v_r.rider_user_id and ended_at is null;
    delete from public.rider_location_current where rider_id = v_r.rider_user_id;
  end if;
  perform app_private.audit_write(v_actor, 'vendor.rider_removed', 'vendor', p_vendor::text, jsonb_build_object('vendor_rider', p_id));
end $$;

-- 3. Sign-in with the code (service role only) -------------------------------------------------------------------------------
-- Does this code belong to the account with this e-mail, and is it still unused?
create function public.rider_code_matches(p_email text, p_code text) returns boolean
language sql security definer set search_path = ''
as $$
  select exists (select 1 from public.vendor_riders r join auth.users u on u.id = r.rider_user_id
                  where r.code = p_code and r.claimed_at is null and r.revoked_at is null and lower(u.email) = lower(btrim(p_email)))
$$;
-- Using the code makes the account a rider (approved by the shop) linked to that shop. Once only.
create function public.rider_claim_code(p_user uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_r public.vendor_riders%rowtype; v_owner uuid; v_name text;
begin
  select * into v_r from public.vendor_riders where code = p_code and rider_user_id = p_user and claimed_at is null and revoked_at is null for update;
  if not found then raise exception 'code_not_found' using errcode = 'P0002'; end if;
  select v.owner_id, v.name into v_owner, v_name from public.vendors v where v.id = v_r.vendor_id and v.status = 'approved';
  if v_owner is null then raise exception 'code_not_found' using errcode = 'P0002'; end if;
  insert into public.rider_profiles (user_id, full_name, contact_phone, approved_by, status)
    values (p_user, v_r.name, v_r.phone, v_owner, 'approved')
    on conflict (user_id) do update set status = 'approved';
  insert into public.role_assignments (user_id, role, granted_by) values (p_user, 'rider', v_owner)
    on conflict (user_id, role) where status = 'active' do nothing;
  update public.vendor_riders set claimed_at = now() where id = v_r.id;
  perform app_private.audit_write(p_user, 'rider.joined_shop', 'vendor', v_r.vendor_id::text, jsonb_build_object('vendor_rider', v_r.id));
  return jsonb_build_object('vendor_id', v_r.vendor_id, 'vendor_name', v_name);
end $$;

create function public.my_rider_link() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  return (select jsonb_build_object('vendor_id', v.id, 'vendor_name', v.name) from public.vendor_riders r join public.vendors v on v.id = r.vendor_id
           where r.rider_user_id = v_actor and r.claimed_at is not null and r.revoked_at is null);
end $$;

revoke all on function public.vendor_rider_reserve(uuid, text, text, text), public.vendor_rider_bind(uuid, uuid), public.vendor_rider_discard(uuid),
  public.vendor_rider_list(uuid), public.vendor_rider_revoke(uuid, uuid), public.rider_code_matches(text, text),
  public.rider_claim_code(uuid, text), public.my_rider_link() from public, anon, authenticated;
grant execute on function public.vendor_rider_reserve(uuid, text, text, text), public.vendor_rider_list(uuid), public.vendor_rider_revoke(uuid, uuid),
  public.my_rider_link() to authenticated;
grant execute on function public.vendor_rider_bind(uuid, uuid), public.vendor_rider_discard(uuid), public.rider_code_matches(text, text),
  public.rider_claim_code(uuid, text) to service_role;

-- 4. A rider made by a shop sees and takes only that shop's orders --------------------------------------------------------------
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
                 and (not exists (select 1 from public.vendor_riders vr where vr.rider_user_id = v_actor and vr.revoked_at is null and vr.claimed_at is not null)
                      or exists (select 1 from public.vendor_riders vr where vr.rider_user_id = v_actor and vr.revoked_at is null and vr.claimed_at is not null
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
  if exists (select 1 from public.vendor_riders vr where vr.rider_user_id = v_rider and vr.revoked_at is null and vr.claimed_at is not null and vr.vendor_id <> v_o.vendor_id) then
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

