-- 1. Ordering can be closed until the AFIT board approves. Shops and riders can apply, customers can fill a cart, but nobody can
-- place an order until the setting `ordering_open` is switched on in Administration, Settings. Platform administrators are
-- exempt so the team can test. It starts CLOSED.
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
    ('ordering_open', 'bool', null, null, null)
  ) as r(key, kind, lo, hi, choices) where r.key = p_key
$$;

insert into public.platform_settings (key, value, note) values
  ('ordering_open', 'false'::jsonb, 'Customers can place orders only when this is on. Switch it on when the AFIT board has approved the launch. Platform administrators can always place test orders.')
on conflict (key) do nothing;

-- 2. What the customer is wearing, for the rider at the door (delivery orders only, optional).
alter table public.orders add column clothing_note text check (clothing_note is null or char_length(clothing_note) <= 120);

drop function public.create_orders(jsonb, uuid, text, boolean);
create function public.create_orders(p_choices jsonb, p_point uuid, p_key text, p_pod boolean default false, p_clothing text default null) returns jsonb
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

-- 3. The rider on a live delivery can see how to reach the customer: the phone number (encrypted at rest; the server decrypts it
-- for the assigned rider only) and what the customer is wearing. Nobody else, and not after the delivery has ended.
create function public.rider_customer_contact(p_assignment uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_a public.delivery_assignments%rowtype; v_o public.orders%rowtype; v_cipher text; v_name text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_a from public.delivery_assignments where id = p_assignment;
  if not found or v_a.rider_id <> v_actor or v_a.status not in ('accepted', 'picked_up', 'en_route') then return null; end if;
  select * into v_o from public.orders where id = v_a.order_id;
  select d.phone_cipher, d.full_name into v_cipher, v_name from public.profile_details d where d.user_id = v_o.customer_id;
  return jsonb_build_object('phone_cipher', v_cipher, 'name', v_name, 'clothing_note', v_o.clothing_note);
end $$;
revoke all on function public.rider_customer_contact(uuid) from public, anon;
grant execute on function public.rider_customer_contact(uuid) to authenticated;
