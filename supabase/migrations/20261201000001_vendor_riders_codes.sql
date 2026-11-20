-- Riders belong to shops. A shop makes a code (good for 10 minutes); a new rider enters it as the last step of signing up and is then
-- linked to that shop. Every rider must be linked: a rider only sees and takes the orders of the shop they are linked to, and the
-- shop can choose which of its riders delivers an order. A shop does not have to have riders; without one, its customers can only
-- choose pickup.

-- 1. Codes
create table public.rider_join_codes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  code text not null unique check (code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index rider_join_codes_vendor_idx on public.rider_join_codes (vendor_id, created_at desc);
alter table public.rider_join_codes enable row level security;
revoke all on public.rider_join_codes from public, anon, authenticated;
grant all on public.rider_join_codes to service_role;

-- linked riders no longer need a permanent code (that belonged to the older "shop makes the account" design)
alter table public.vendor_riders alter column code drop not null;

create function public.vendor_rider_code_generate(p_vendor uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_code text; v_exp timestamptz := now() + interval '10 minutes'; v_try int := 0;
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  if (select count(*) from public.vendor_riders where vendor_id = p_vendor and revoked_at is null and claimed_at is not null) >= 20 then
    raise exception 'too_many_riders' using errcode = '22023';
  end if;
  if (select count(*) from public.rider_join_codes where vendor_id = p_vendor and used_at is null and expires_at > now()) >= 5 then
    raise exception 'too_many_codes' using errcode = '22023';
  end if;
  delete from public.rider_join_codes where expires_at < now() - interval '1 day';
  loop
    v_code := lpad((((get_byte(extensions.gen_random_bytes(3), 0) * 65536 + get_byte(extensions.gen_random_bytes(3), 1) * 256
                      + get_byte(extensions.gen_random_bytes(3), 2)) % 900000) + 100000)::text, 6, '0');
    begin
      insert into public.rider_join_codes (vendor_id, code, expires_at, created_by) values (p_vendor, v_code, v_exp, v_actor);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'could not allocate a code'; end if;
    end;
  end loop;
  perform app_private.audit_write(v_actor, 'vendor.rider_code_made', 'vendor', p_vendor::text, '{}'::jsonb);
  return jsonb_build_object('code', v_code, 'expires_at', v_exp);
end $$;

create function public.vendor_rider_codes_active(p_vendor uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  return coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'expires_at', c.expires_at) order by c.created_at desc)
                     from public.rider_join_codes c where c.vendor_id = p_vendor and c.used_at is null and c.expires_at > now()), '[]'::jsonb);
end $$;

-- service role only: is this code good right now, and which shop is it for?
create function public.rider_code_check(p_code text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('vendor_id', v.id, 'vendor_name', v.name)
    from public.rider_join_codes c join public.vendors v on v.id = c.vendor_id
   where c.code = p_code and c.used_at is null and c.expires_at > now() and v.status = 'approved'
$$;

-- service role only: the new account joins the shop. The shop vouches for the rider: no separate administrator approval.
create function public.rider_join_with_code(p_user uuid, p_code text, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_c public.rider_join_codes%rowtype; v_owner uuid; v_vname text;
begin
  if exists (select 1 from public.vendor_riders where rider_user_id = p_user and revoked_at is null and claimed_at is not null) then
    raise exception 'already_linked' using errcode = '22023';
  end if;
  select * into v_c from public.rider_join_codes where code = p_code and used_at is null and expires_at > now() for update;
  if not found then raise exception 'code_not_found' using errcode = 'P0002'; end if;
  select v.owner_id, v.name into v_owner, v_vname from public.vendors v where v.id = v_c.vendor_id and v.status = 'approved';
  if v_owner is null then raise exception 'code_not_found' using errcode = 'P0002'; end if;
  insert into public.rider_profiles (user_id, full_name, contact_phone, approved_by, status)
    values (p_user, btrim(p_name), btrim(p_phone), v_owner, 'approved')
    on conflict (user_id) do update set status = 'approved';
  insert into public.role_assignments (user_id, role, granted_by) values (p_user, 'rider', v_owner)
    on conflict (user_id, role) where status = 'active' do nothing;
  insert into public.vendor_riders (vendor_id, name, phone, rider_user_id, claimed_at) values (v_c.vendor_id, btrim(p_name), btrim(p_phone), p_user, now());
  update public.rider_join_codes set used_by = p_user, used_at = now() where id = v_c.id;
  perform app_private.audit_write(p_user, 'rider.joined_shop', 'vendor', v_c.vendor_id::text, jsonb_build_object('code_id', v_c.id));
  return jsonb_build_object('vendor_id', v_c.vendor_id, 'vendor_name', v_vname);
end $$;

revoke all on function public.vendor_rider_code_generate(uuid), public.vendor_rider_codes_active(uuid), public.rider_code_check(text),
  public.rider_join_with_code(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.vendor_rider_code_generate(uuid), public.vendor_rider_codes_active(uuid) to authenticated;
grant execute on function public.rider_code_check(text), public.rider_join_with_code(uuid, text, text, text) to service_role;

-- 2. The shop chooses which of its riders delivers an order (optional: without a choice, any of the shop's riders may take it)
alter table public.orders add column assigned_rider_id uuid references auth.users (id) on delete set null;

create function public.vendor_assign_rider(p_order uuid, p_rider uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype;
begin
  select * into v_o from public.orders where id = p_order;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app_private.require_vendor_actor(v_o.vendor_id);
  if v_o.fulfilment <> 'delivery' or v_o.status not in ('READY', 'AWAITING_RIDER') then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if exists (select 1 from public.delivery_assignments d where d.order_id = p_order and d.status in ('accepted', 'picked_up', 'en_route')) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if p_rider is not null and not exists (select 1 from public.vendor_riders vr join public.rider_profiles rp on rp.user_id = vr.rider_user_id
                                          where vr.vendor_id = v_o.vendor_id and vr.rider_user_id = p_rider and vr.claimed_at is not null
                                            and vr.revoked_at is null and rp.status = 'approved') then
    raise exception 'not_your_rider' using errcode = '22023';
  end if;
  update public.orders set assigned_rider_id = p_rider where id = p_order;
  perform app_private.audit_write(v_actor, 'order.rider_assigned', 'order', p_order::text, jsonb_build_object('rider', p_rider));
  if p_rider is not null then
    begin
      perform app_private.notify(p_rider, 'order', 'Delivery for you', 'Your shop chose you to deliver order ' || v_o.order_number || '. Open Jobs to take it.',
                                 '/rider/jobs', 'assign:' || p_order::text || ':' || p_rider::text);
    exception when others then null;
    end;
  end if;
end $$;
revoke all on function public.vendor_assign_rider(uuid, uuid) from public, anon;
grant execute on function public.vendor_assign_rider(uuid, uuid) to authenticated;

-- 3. The shop can find its riders: who is on shift and where they last were
create function public.vendor_rider_locations(p_vendor uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_vendor_actor(p_vendor);
  return coalesce((select jsonb_agg(jsonb_build_object('id', vr.id, 'rider_id', vr.rider_user_id, 'name', rp.full_name, 'phone', rp.contact_phone,
            'on_shift', exists (select 1 from public.rider_shifts s where s.rider_id = vr.rider_user_id and s.ended_at is null),
            'lat', l.lat, 'lng', l.lng, 'age_seconds', case when l.observed_at is null then null else round(extract(epoch from (now() - l.observed_at))) end)
            order by rp.full_name)
          from public.vendor_riders vr join public.rider_profiles rp on rp.user_id = vr.rider_user_id
          left join public.rider_location_current l on l.rider_id = vr.rider_user_id
         where vr.vendor_id = p_vendor and vr.claimed_at is not null and vr.revoked_at is null), '[]'::jsonb);
end $$;
revoke all on function public.vendor_rider_locations(uuid) from public, anon;
grant execute on function public.vendor_rider_locations(uuid) to authenticated;

-- 4. Only a shop's own riders see and take its orders
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
                 and exists (select 1 from public.vendor_riders vr where vr.rider_user_id = v_actor and vr.revoked_at is null and vr.claimed_at is not null
                              and vr.vendor_id = orders.vendor_id)
                 and (orders.assigned_rider_id is null or orders.assigned_rider_id = v_actor)
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
  if not exists (select 1 from public.vendor_riders vr where vr.rider_user_id = v_rider and vr.revoked_at is null and vr.claimed_at is not null and vr.vendor_id = v_o.vendor_id)
     or (v_o.assigned_rider_id is not null and v_o.assigned_rider_id <> v_rider) then
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


-- 5. Delivery is offered at checkout only for shops that have a rider
create or replace function app_private.quote_v(p_user uuid, p_vendor uuid, p_fulfilment text, p_point uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare q jsonb := app_private.price_cart_v(p_user, p_vendor, p_fulfilment, p_point); v_fee bigint; v_mode text := 'paystack';
begin
  if coalesce((q ->> 'empty')::boolean, false) then return q; end if;
  v_fee := coalesce((q ->> 'delivery_fee_kobo')::bigint, 0);
  if p_fulfilment = 'delivery' and v_fee > 0
     and (select s.value #>> '{}' from public.platform_settings s where s.key = 'delivery_fee_collection_mode') = 'direct_to_rider' then
    v_mode := 'direct_to_rider';
  end if;
  if v_mode = 'direct_to_rider' then
    q := q || jsonb_build_object('total_kobo', (q ->> 'total_kobo')::bigint - v_fee, 'delivery_fee_to_rider_kobo', v_fee);
  else
    q := q || jsonb_build_object('delivery_fee_to_rider_kobo', 0);
  end if;
  return q || jsonb_build_object('delivery_fee_collection', v_mode, 'is_food', app_private.vendor_sells_food(p_vendor),
    'rider_available', exists (select 1 from public.vendor_riders vr join public.rider_profiles rp on rp.user_id = vr.rider_user_id
                                where vr.vendor_id = p_vendor and vr.claimed_at is not null and vr.revoked_at is null and rp.status = 'approved'));
end $$;
revoke all on function app_private.quote_v(uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.create_orders(p_choices jsonb, p_point uuid, p_key text, p_pod boolean default false, p_clothing text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid()); v_cart public.carts%rowtype; v_checkout uuid := gen_random_uuid(); v record; v_q jsonb; v_f text;
  v_quotes jsonb := '[]'::jsonb; v_problems jsonb := '[]'::jsonb; e jsonb; v_order uuid; v_vendor public.vendors%rowtype; v_line jsonb;
  v_expiry int := app_private.setting_int('unpaid_order_expiry_minutes', 30)::int; v_n int := 0; v_out jsonb := '[]'::jsonb;
  v_pod boolean; v_no text; v_tot bigint; v_prev jsonb;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  if not app_private.has_role('customer') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is null or char_length(p_key) not between 8 and 80 then raise exception 'invalid idempotency key' using errcode = '22023'; end if;
  -- Ordering opens when the AFIT board approves. Until then only a platform administrator (testing) can place orders.
  if coalesce((select s.value #>> '{}' from public.platform_settings s where s.key = 'ordering_open'), 'false') <> 'true'
     and not app_private.has_role('platform_admin') then
    raise exception 'ordering_closed' using errcode = '22023';
  end if;
  if p_clothing is not null and char_length(btrim(p_clothing)) > 120 then raise exception 'clothing_too_long' using errcode = '22023'; end if;

  -- a repeated submit returns the orders already made
  select jsonb_build_object('checkout_id', min(o.checkout_id::text), 'orders', jsonb_agg(jsonb_build_object('id', o.id, 'order_number', o.order_number,
           'vendor_name', o.vendor_name, 'total_kobo', o.total_kobo, 'pay_on_delivery', o.payment_timing = 'on_delivery') order by o.created_at, o.id))
    into v_prev from public.orders o where o.customer_id = v_actor and o.idempotency_key like p_key || ':%';
  if v_prev is not null and jsonb_typeof(v_prev -> 'orders') = 'array' then return v_prev; end if;

  select * into v_cart from public.carts where user_id = v_actor for update;
  if not found or not exists (select 1 from public.cart_items where cart_id = v_cart.id) then raise exception 'cart_empty' using errcode = '22023'; end if;
  perform 1 from public.products where id in (select product_id from public.cart_items where cart_id = v_cart.id) order by id for update;

  for v in
    select p.vendor_id, max(vn.name) as vendor_name from public.cart_items ci join public.products p on p.id = ci.product_id
      join public.vendors vn on vn.id = p.vendor_id where ci.cart_id = v_cart.id group by p.vendor_id order by max(vn.name), p.vendor_id
  loop
    v_f := coalesce(p_choices ->> v.vendor_id::text, 'pickup');
    if v_f not in ('pickup', 'delivery') then v_f := 'pickup'; end if;
    v_q := app_private.quote_v(v_actor, v.vendor_id, v_f, p_point);
    -- delivery needs one of the shop's own riders
    if v_f = 'delivery' and not coalesce((v_q ->> 'rider_available')::boolean, false) then
      v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'no_rider', 'vendor_id', v.vendor_id));
    end if;
    v_problems := v_problems || coalesce((select jsonb_agg(pr || jsonb_build_object('vendor_id', v.vendor_id)) from jsonb_array_elements(v_q -> 'problems') pr), '[]'::jsonb);
    v_quotes := v_quotes || jsonb_build_object('vendor_id', v.vendor_id, 'fulfilment', v_f, 'quote', v_q);
  end loop;
  if jsonb_array_length(v_problems) > 0 then
    raise exception 'checkout_blocked' using detail = v_problems::text, errcode = 'P0001';
  end if;

  for e in select * from jsonb_array_elements(v_quotes) loop
    v_n := v_n + 1;
    v_q := e -> 'quote';
    v_f := e ->> 'fulfilment';
    select * into v_vendor from public.vendors where id = (e ->> 'vendor_id')::uuid;
    v_no := 'AFM-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
    insert into public.orders (order_number, customer_id, vendor_id, vendor_name, fulfilment, delivery_point_id, delivery_point_label,
      pickup_location_snapshot, prep_minutes_snapshot, items_total_kobo, delivery_fee_kobo, platform_fee_kobo, discount_kobo, total_kobo,
      delivery_fee_collection, idempotency_key, expires_at, checkout_id, clothing_note)
    values (v_no, v_actor, v_vendor.id, v_vendor.name, v_f, case when v_f = 'delivery' then p_point end, v_q ->> 'delivery_point_label',
      v_vendor.pickup_location_text, v_vendor.prep_minutes, (v_q ->> 'items_total_kobo')::bigint, (v_q ->> 'delivery_fee_kobo')::bigint,
      (v_q ->> 'platform_fee_kobo')::bigint, (v_q ->> 'discount_kobo')::bigint, (v_q ->> 'total_kobo')::bigint,
      v_q ->> 'delivery_fee_collection', p_key || ':' || v_n::text, now() + make_interval(mins => v_expiry), v_checkout,
      case when v_f = 'delivery' then nullif(btrim(p_clothing), '') end)
    returning id, total_kobo into v_order, v_tot;
    for v_line in select * from jsonb_array_elements(v_q -> 'lines') loop
      insert into public.order_items (order_id, product_id, product_name, options, base_price_kobo, unit_price_kobo, quantity, line_total_kobo)
      values (v_order, (v_line ->> 'product_id')::uuid, v_line ->> 'name', v_line -> 'options', (v_line ->> 'base_price_kobo')::bigint,
              (v_line ->> 'unit_price_kobo')::bigint, (v_line ->> 'quantity')::int, (v_line ->> 'line_total_kobo')::bigint);
    end loop;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, reason) values (v_order, null, 'PENDING_PAYMENT', v_actor, 'order_created');
    perform app_private.audit_write(v_actor, 'order.created', 'order', v_order::text,
      jsonb_build_object('vendor_id', v_vendor.id, 'total_kobo', v_tot, 'delivery_fee_collection', v_q ->> 'delivery_fee_collection',
                         'decided_by', 'platform_setting', 'checkout_id', v_checkout));
    v_pod := false;
    if coalesce(p_pod, false) and app_private.door_ok(v_vendor.id, v_tot) then
      begin
        perform public.customer_choose_pay_on_delivery(v_order);
        v_pod := true;
      exception when others then
        v_pod := false; -- not allowed right now (for example too many unpaid): this order is paid now instead
      end;
    end if;
    v_out := v_out || jsonb_build_object('id', v_order, 'order_number', v_no, 'vendor_name', v_vendor.name, 'total_kobo', v_tot, 'pay_on_delivery', v_pod);
  end loop;

  update public.products p set stock_quantity = p.stock_quantity - s.q
    from (select product_id, sum(quantity)::int as q from public.cart_items where cart_id = v_cart.id group by product_id) s
   where p.id = s.product_id and p.stock_quantity is not null;
  delete from public.cart_items where cart_id = v_cart.id;
  update public.carts set vendor_id = null, updated_at = now() where id = v_cart.id;
  return jsonb_build_object('checkout_id', v_checkout, 'orders', v_out);
end $$;
revoke all on function public.create_orders(jsonb, uuid, text, boolean, text) from public, anon;
grant execute on function public.create_orders(jsonb, uuid, text, boolean, text) to authenticated;
