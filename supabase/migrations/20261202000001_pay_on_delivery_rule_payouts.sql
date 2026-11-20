-- Pay when received is the rule for every shop that does not sell food; food is paid before it arrives.
-- The money for a delivery must arrive before the customer confirms (signature or QR code).
create or replace function app_private.door_ok(p_vendor uuid, p_total bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}') = 'true' from public.platform_settings s where s.key = 'pay_on_delivery_enabled'), false)
     and not app_private.vendor_sells_food(p_vendor)
$$;
revoke all on function app_private.door_ok(uuid, bigint) from public, anon, authenticated;

create or replace function public.cart_quote_multi(p_choices jsonb, p_point uuid, p_pod boolean default false) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := app_private.require_customer(); v record; q jsonb; v_f text; v_door boolean;
  v_groups jsonb := '[]'::jsonb; v_problems jsonb := '[]'::jsonb; v_now bigint := 0; v_doortot bigint := 0; v_charge bigint;
begin
  for v in
    select p.vendor_id, min(ci.created_at) as first_at, max(vn.name) as vendor_name
      from public.carts c join public.cart_items ci on ci.cart_id = c.id
      join public.products p on p.id = ci.product_id join public.vendors vn on vn.id = p.vendor_id
     where c.user_id = v_actor group by p.vendor_id order by max(vn.name), p.vendor_id
  loop
    v_f := coalesce(p_choices ->> v.vendor_id::text, 'pickup');
    if v_f not in ('pickup', 'delivery') then v_f := 'pickup'; end if;
    q := app_private.quote_v(v_actor, v.vendor_id, v_f, p_point);
    v_door := app_private.door_ok(v.vendor_id, (q ->> 'total_kobo')::bigint);
    if v_door then v_doortot := v_doortot + (q ->> 'total_kobo')::bigint; else v_now := v_now + (q ->> 'total_kobo')::bigint; end if;
    v_problems := v_problems || coalesce((select jsonb_agg(pr || jsonb_build_object('vendor_id', v.vendor_id)) from jsonb_array_elements(q -> 'problems') pr), '[]'::jsonb);
    v_groups := v_groups || (q || jsonb_build_object('fulfilment', v_f, 'pay_timing', case when v_door then 'door' else 'now' end,
      'door_charge_kobo', case when v_door then app_private.paystack_charge((q ->> 'total_kobo')::bigint) else 0 end));
  end loop;
  v_charge := app_private.paystack_charge(v_now);
  return jsonb_build_object('empty', jsonb_array_length(v_groups) = 0, 'groups', v_groups, 'problems', v_problems,
    'pay_now_items_kobo', v_now, 'pay_now_charge_kobo', v_charge, 'pay_now_total_kobo', v_now + v_charge,
    'door_items_kobo', v_doortot,
    'door_enabled', coalesce((select (s.value #>> '{}') = 'true' from public.platform_settings s where s.key = 'pay_on_delivery_enabled'), false),
    'door_max_kobo', app_private.setting_int('pay_on_delivery_max_kobo', 2000000));
end $$;
revoke all on function public.cart_quote_multi(jsonb, uuid, boolean) from public, anon;
grant execute on function public.cart_quote_multi(jsonb, uuid, boolean) to authenticated;

create or replace function public.create_orders(p_choices jsonb, p_point uuid, p_key text, p_pod boolean default false, p_clothing text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid()); v_cart public.carts%rowtype; v_checkout uuid := gen_random_uuid(); v record; v_q jsonb; v_f text;
  v_quotes jsonb := '[]'::jsonb; v_problems jsonb := '[]'::jsonb; e jsonb; v_order uuid; v_vendor public.vendors%rowtype; v_line jsonb;
  v_expiry int := app_private.setting_int('unpaid_order_expiry_minutes', 30)::int; v_n int := 0; v_out jsonb := '[]'::jsonb;
  v_pod boolean; v_no text; v_tot bigint; v_prev jsonb; v_open int;
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
    -- Pay when received is the rule for every shop that does not sell food (unless the setting is switched off).
    -- Food is always paid before it arrives. A customer may have a few unpaid orders at a time.
    v_pod := app_private.door_ok(v_vendor.id, v_tot);
    if v_pod then
      select count(*) into v_open from public.orders x
       where x.customer_id = v_actor and x.payment_timing = 'on_delivery' and x.id <> v_order
         and x.status not in ('COMPLETED', 'CANCELLED', 'PENDING_PAYMENT')
         and not exists (select 1 from public.payment_transactions t where t.order_id = x.id and t.status = 'succeeded');
      if v_open >= 5 then raise exception 'too_many_unpaid' using errcode = '22023'; end if;
      update public.orders set payment_timing = 'on_delivery' where id = v_order;
      perform app_private.step_order(v_order, 'PENDING_PAYMENT', 'PAID', v_actor, 'pay_on_delivery');
      perform app_private.audit_write(v_actor, 'order.pay_on_delivery', 'order', v_order::text, jsonb_build_object('total_kobo', v_tot, 'rule', 'required'));
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

-- A rider who was suspended cannot come back by typing a shop code.
create or replace function public.rider_join_with_code(p_user uuid, p_code text, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_c public.rider_join_codes%rowtype; v_owner uuid; v_vname text;
begin
  if exists (select 1 from public.vendor_riders where rider_user_id = p_user and revoked_at is null and claimed_at is not null) then
    raise exception 'already_linked' using errcode = '22023';
  end if;
  if exists (select 1 from public.rider_profiles where user_id = p_user and status = 'suspended') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_c from public.rider_join_codes where code = p_code and used_at is null and expires_at > now() for update;
  if not found then raise exception 'code_not_found' using errcode = 'P0002'; end if;
  select v.owner_id, v.name into v_owner, v_vname from public.vendors v where v.id = v_c.vendor_id and v.status = 'approved';
  if v_owner is null then raise exception 'code_not_found' using errcode = 'P0002'; end if;
  insert into public.rider_profiles (user_id, full_name, contact_phone, approved_by, status)
    values (p_user, btrim(p_name), btrim(p_phone), v_owner, 'approved')
    on conflict (user_id) do update set status = 'approved' where rider_profiles.status <> 'suspended';
  insert into public.role_assignments (user_id, role, granted_by) values (p_user, 'rider', v_owner)
    on conflict (user_id, role) where status = 'active' do nothing;
  insert into public.vendor_riders (vendor_id, name, phone, rider_user_id, claimed_at) values (v_c.vendor_id, btrim(p_name), btrim(p_phone), p_user, now());
  update public.rider_join_codes set used_by = p_user, used_at = now() where id = v_c.id;
  perform app_private.audit_write(p_user, 'rider.joined_shop', 'vendor', v_c.vendor_id::text, jsonb_build_object('code_id', v_c.id));
  return jsonb_build_object('vendor_id', v_c.vendor_id, 'vendor_name', v_vname);
end $$;



-- Payouts. A transfer that fails because of the Paystack business account itself (for example "starter business") is tried
-- again later instead of being given up after five tries, and a shop that saves its bank account gets its waiting payouts tried at once.
create or replace function public.payout_claim_due(p_limit int default 20)
returns table (o_id uuid, o_vendor uuid, o_amount bigint, o_reference text, o_attempts int, o_resume boolean)
language plpgsql security definer set search_path = ''
as $$
declare r public.vendor_payouts%rowtype; v_amount bigint; v_ref text; v_att int;
begin
  for r in
    select p.* from public.vendor_payouts p
     where p.eligible_at <= now()
       and (p.status in ('scheduled', 'held')
            or (p.status = 'failed' and p.attempts < 12 and (p.last_attempt_at is null or p.last_attempt_at < now() - interval '6 hours'))
            or (p.status = 'processing' and p.last_attempt_at < now() - interval '30 minutes'))
     order by p.eligible_at, p.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
     for update skip locked
  loop
    if exists (select 1 from public.support_cases c where c.order_id = r.order_id and c.status in ('open', 'under_review'))
       or exists (select 1 from public.refunds f where f.order_id = r.order_id
                   and f.status in ('requested', 'under_review', 'approved', 'processing', 'reconciliation_required')) then
      if r.status <> 'held' then
        update public.vendor_payouts set status = 'held', updated_at = now() where id = r.id;
      end if;
      continue;
    end if;
    select l.base_kobo - l.commission_kobo
           - coalesce((select sum(j.base_reversed_kobo) from public.order_settlement_adjustments j where j.line_id = l.id), 0)
           + coalesce((select sum(j.commission_reversed_kobo) from public.order_settlement_adjustments j where j.line_id = l.id), 0)
      into v_amount from public.order_settlement_lines l where l.id = r.line_id;
    if coalesce(v_amount, 0) <= 0 then
      update public.vendor_payouts set status = 'skipped', amount_kobo = 0, updated_at = now() where id = r.id;
      continue;
    end if;
    if r.status = 'processing' then
      -- a run that stopped half way: ask Paystack about the SAME reference instead of starting a second transfer
      update public.vendor_payouts set amount_kobo = v_amount, last_attempt_at = now(), updated_at = now() where id = r.id;
      return query select r.id, r.vendor_id, v_amount, r.reference, r.attempts, true;
    else
      v_att := r.attempts + 1;
      v_ref := 'afitpo-' || replace(r.id::text, '-', '') || '-' || v_att::text;
      update public.vendor_payouts set status = 'processing', amount_kobo = v_amount, attempts = v_att, reference = v_ref,
             last_attempt_at = now(), last_error = null, updated_at = now() where id = r.id;
      return query select r.id, r.vendor_id, v_amount, v_ref, v_att, false;
    end if;
  end loop;
end $$;
revoke all on function public.payout_claim_due(int) from public, anon, authenticated;
grant execute on function public.payout_claim_due(int) to service_role;

create function app_private.bank_saved_requeue_payouts() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.vendor_payouts set last_attempt_at = null, updated_at = now()
   where vendor_id = new.vendor_id and status = 'failed';
  return new;
end $$;
revoke all on function app_private.bank_saved_requeue_payouts() from public, anon, authenticated;
create trigger vendor_bank_accounts_requeue after insert on public.vendor_bank_accounts
  for each row execute function app_private.bank_saved_requeue_payouts();

-- Every payout that failed so far gets another go on the next run.
update public.vendor_payouts set last_attempt_at = null, updated_at = now() where status = 'failed';
