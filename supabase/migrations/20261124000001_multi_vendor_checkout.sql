-- Many shops in one cart, one order per shop, and the customer's payment shown with Paystack's charge before they pay.
--
--  * The cart may hold items from several shops. Checkout makes one order per shop (each shop is paid for its own order only).
--  * Everything payable online now can be paid in ONE Paystack payment (a "payment group"); the payment is split back into the
--    individual orders when it succeeds, so refunds, payouts and every other per-order rule keep working unchanged.
--  * Food, drinks and bakery orders (categories flagged is_food) are always paid now. Other orders may be paid on delivery.
--  * Online payments show the item total plus Paystack's charge. The charge is worked out so that, after Paystack takes its own fee
--    (1.5% + 100 naira from 2,500 naira, at most 2,000 naira, local cards), the shop side keeps exactly the item total.
--    This only balances when the Paystack account is set so that the MERCHANT bears the fee (the charge is already in our total).

alter table public.categories add column is_food boolean not null default false;
update public.categories set is_food = true where slug in ('food', 'drinks', 'bakery', 'fruits-vegetables');

alter table public.orders add column checkout_id uuid;
create index orders_checkout_idx on public.orders (checkout_id) where checkout_id is not null;

create function app_private.vendor_sells_food(p_vendor uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.vendors v join public.categories c on c.id = v.category_id where v.id = p_vendor and c.is_food)
      or exists (select 1 from public.vendor_categories vc join public.categories c on c.id = vc.category_id where vc.vendor_id = p_vendor and c.is_food)
$$;
revoke all on function app_private.vendor_sells_food(uuid) from public, anon, authenticated;

-- Paystack's own fee on a charge of p_total kobo (local cards).
create function app_private.paystack_fee(p_total bigint) returns bigint
language sql immutable set search_path = ''
as $$ select least(200000::bigint, ceil(p_total * 0.015)::bigint + case when p_total >= 250000 then 10000 else 0 end) $$;
revoke all on function app_private.paystack_fee(bigint) from public, anon, authenticated;

-- What to add on top of p_items so that, after Paystack's fee on the whole charge, the items are covered exactly.
create function app_private.paystack_charge(p_items bigint) returns bigint
language plpgsql immutable set search_path = ''
as $$
declare t bigint := p_items; nt bigint; n int := 0;
begin
  if p_items is null or p_items <= 0 then return 0; end if;
  while n < 12 loop
    nt := p_items + app_private.paystack_fee(t);
    exit when nt = t;
    t := nt;
    n := n + 1;
  end loop;
  while t - app_private.paystack_fee(t) < p_items loop t := t + 1; end loop;
  return t - p_items;
end $$;
revoke all on function app_private.paystack_charge(bigint) from public, anon, authenticated;

-- One Paystack payment that can cover several orders.
create table public.payment_groups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete restrict,
  reference text not null unique check (char_length(reference) between 8 and 100),
  items_kobo bigint not null check (items_kobo > 0),
  fee_kobo bigint not null check (fee_kobo >= 0),
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'initialized' check (status in ('initialized', 'succeeded', 'failed', 'mismatch')),
  access_code text,
  succeeded_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.payment_group_orders (
  group_id uuid not null references public.payment_groups (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  primary key (group_id, order_id)
);
create index payment_group_orders_order_idx on public.payment_group_orders (order_id);
alter table public.payment_groups enable row level security;
alter table public.payment_group_orders enable row level security;
revoke all on public.payment_groups, public.payment_group_orders from public, anon, authenticated;
grant all on public.payment_groups, public.payment_group_orders to service_role;
create trigger payment_groups_no_delete before delete on public.payment_groups for each row execute function app_private.deny_mutation();
create trigger payment_group_orders_no_delete before delete on public.payment_group_orders for each row execute function app_private.deny_mutation();

-- A paid order keeps its own payment row (so refunds, payouts and receipts are per order as before); orders paid together share
-- the one Paystack reference, so the reference is unique per order instead of unique overall.
alter table public.payment_transactions drop constraint payment_transactions_reference_key;
create unique index payment_transactions_ref_order on public.payment_transactions (reference, order_id);
alter table public.payment_transactions add column group_id uuid references public.payment_groups (id) on delete restrict;

create or replace function public.cart_add_item(p_product uuid, p_qty int, p_options uuid[], p_replace boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := app_private.require_customer(); v_p public.products%rowtype; v_cart public.carts%rowtype;
  v_opts uuid[]; v_prob text; v_max int := app_private.setting_int('max_cart_item_quantity', 20)::int; v_existing public.cart_items%rowtype;
begin
  if p_qty is null or p_qty < 1 or p_qty > v_max then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  select * into v_p from public.products where id = p_product and status = 'active' and is_available;
  if not found or not exists (select 1 from public.vendors v where v.id = v_p.vendor_id and v.status = 'approved') then
    raise exception 'product_unavailable' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(x order by x), '{}') into v_opts from unnest(coalesce(p_options, '{}')) x;
  v_prob := app_private.selection_problem(p_product, v_opts);
  if v_prob is not null then raise exception '%', v_prob using errcode = '22023'; end if;

  insert into public.carts (user_id) values (v_actor) on conflict (user_id) do nothing;
  select * into v_cart from public.carts where user_id = v_actor for update;
  if (select count(*) from public.cart_items where cart_id = v_cart.id) >= 30 then
    raise exception 'cart_full' using errcode = '22023';
  end if;
  select * into v_existing from public.cart_items
   where cart_id = v_cart.id and product_id = p_product and selected_option_ids = v_opts;
  if found then
    update public.cart_items set quantity = least(quantity + p_qty, v_max) where id = v_existing.id;
  else
    insert into public.cart_items (cart_id, product_id, quantity, selected_option_ids) values (v_cart.id, p_product, p_qty, v_opts);
  end if;
  update public.carts set updated_at = now() where id = v_cart.id;
  return jsonb_build_object('status', 'added');
end $$;

create function app_private.price_cart_v(p_user uuid, p_vendor uuid, p_fulfilment text, p_delivery_point uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_cart public.carts%rowtype; v_vendor public.vendors%rowtype; r record;
  v_lines jsonb := '[]'::jsonb; v_problems jsonb := '[]'::jsonb;
  v_items bigint := 0; v_delivery bigint := 0; v_fee bigint; v_unit bigint; v_delta bigint; v_opts jsonb;
  v_prob text; v_label text; v_max int := app_private.setting_int('max_cart_item_quantity', 20)::int;
begin
  if p_fulfilment not in ('pickup', 'delivery') then raise exception 'invalid_fulfilment' using errcode = '22023'; end if;
  select * into v_cart from public.carts where user_id = p_user;
  if not found or not exists (select 1 from public.cart_items ci join public.products pp on pp.id = ci.product_id where ci.cart_id = v_cart.id and pp.vendor_id = p_vendor) then
    return jsonb_build_object('empty', true, 'fulfilment', p_fulfilment, 'lines', '[]'::jsonb, 'problems', '[]'::jsonb,
      'items_total_kobo', 0, 'delivery_fee_kobo', 0, 'platform_fee_kobo', 0, 'discount_kobo', 0, 'total_kobo', 0);
  end if;
  select * into v_vendor from public.vendors where id = p_vendor;
  if not found or v_vendor.status <> 'approved' then
    v_problems := v_problems || jsonb_build_object('code', 'vendor_unavailable');
  elsif not app_private.vendor_is_open(v_vendor.id) then
    v_problems := v_problems || jsonb_build_object('code', 'vendor_closed');
  end if;

  for r in
    select ci.id as item_id, ci.product_id, ci.quantity, ci.selected_option_ids, p.name, p.price_kobo, p.is_available,
           p.status, p.vendor_id
    from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart.id and p.vendor_id = p_vendor order by ci.created_at, ci.id
  loop
    if r.status <> 'active' or not r.is_available then
      v_problems := v_problems || jsonb_build_object('code', 'unavailable', 'item_id', r.item_id, 'product_id', r.product_id);
    end if;
    if r.quantity < 1 or r.quantity > v_max then
      v_problems := v_problems || jsonb_build_object('code', 'invalid_quantity', 'item_id', r.item_id);
    end if;
    v_prob := app_private.selection_problem(r.product_id, r.selected_option_ids);
    if v_prob is not null then
      v_problems := v_problems || jsonb_build_object('code', v_prob, 'item_id', r.item_id, 'product_id', r.product_id);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'group', g.name, 'name', o.name, 'price_delta_kobo', o.price_delta_kobo)
                              order by g.sort_order, o.sort_order, o.name), '[]'::jsonb),
           coalesce(sum(o.price_delta_kobo), 0)
      into v_opts, v_delta
      from public.product_options o join public.product_option_groups g on g.id = o.group_id
     where o.id = any (r.selected_option_ids) and g.product_id = r.product_id;
    v_unit := r.price_kobo + v_delta;
    v_items := v_items + v_unit * r.quantity;
    v_lines := v_lines || jsonb_build_object('item_id', r.item_id, 'product_id', r.product_id, 'name', r.name,
      'quantity', r.quantity, 'base_price_kobo', r.price_kobo, 'unit_price_kobo', v_unit,
      'line_total_kobo', v_unit * r.quantity, 'options', v_opts);
  end loop;

  for r in
    select ci.product_id, sum(ci.quantity) as q, p.stock_quantity
    from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart.id and p.vendor_id = p_vendor group by ci.product_id, p.stock_quantity
    having p.stock_quantity is not null and sum(ci.quantity) > p.stock_quantity
  loop
    v_problems := v_problems || jsonb_build_object('code', 'out_of_stock', 'product_id', r.product_id);
  end loop;

  if p_fulfilment = 'delivery' then
    select dp.label into v_label from public.approved_delivery_points dp where dp.id = p_delivery_point and dp.is_active;
    if v_label is null then
      v_problems := v_problems || jsonb_build_object('code', 'delivery_point_invalid');
    end if;
    v_delivery := app_private.setting_int('delivery_fee_kobo', 0);
  end if;
  v_fee := app_private.platform_fee(v_items, app_private.setting_int('platform_fee_bps', 0));

  return jsonb_build_object('empty', false, 'fulfilment', p_fulfilment, 'vendor_id', p_vendor,
    'vendor_name', v_vendor.name, 'delivery_point_label', v_label, 'lines', v_lines, 'problems', v_problems,
    'items_total_kobo', v_items, 'delivery_fee_kobo', v_delivery, 'platform_fee_kobo', v_fee, 'discount_kobo', 0,
    'total_kobo', v_items + v_delivery + v_fee);
end $$;

revoke all on function app_private.price_cart_v(uuid, uuid, text, uuid) from public, anon, authenticated;

-- one shop's part of the cart, with the delivery-fee rule applied
create function app_private.quote_v(p_user uuid, p_vendor uuid, p_fulfilment text, p_point uuid) returns jsonb
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
  return q || jsonb_build_object('delivery_fee_collection', v_mode, 'is_food', app_private.vendor_sells_food(p_vendor));
end $$;
revoke all on function app_private.quote_v(uuid, uuid, text, uuid) from public, anon, authenticated;

-- Can this order be paid when it is received? (switched on, not food, small enough)
create function app_private.door_ok(p_vendor uuid, p_total bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}') = 'true' from public.platform_settings s where s.key = 'pay_on_delivery_enabled'), false)
     and not app_private.vendor_sells_food(p_vendor)
     and p_total <= app_private.setting_int('pay_on_delivery_max_kobo', 2000000)
$$;
revoke all on function app_private.door_ok(uuid, bigint) from public, anon, authenticated;

-- The whole cart, one block per shop, with what is paid now, what is paid at the door and Paystack's charge.
-- p_choices: {"<vendor id>": "pickup" | "delivery"} (a shop with no choice is pickup).
create function public.cart_quote_multi(p_choices jsonb, p_point uuid, p_pod boolean default false) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := app_private.require_customer(); v rec; q jsonb; v_f text; v_door boolean;
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
    v_door := coalesce(p_pod, false) and app_private.door_ok(v.vendor_id, (q ->> 'total_kobo')::bigint);
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

-- Places one order per shop. Returns {checkout_id, orders: [{id, order_number, vendor_name, total_kobo, pay_on_delivery}]}.
create function public.create_orders(p_choices jsonb, p_point uuid, p_key text, p_pod boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid()); v_cart public.carts%rowtype; v_checkout uuid := gen_random_uuid(); v rec; v_q jsonb; v_f text;
  v_quotes jsonb := '[]'::jsonb; v_problems jsonb := '[]'::jsonb; e jsonb; v_order uuid; v_vendor public.vendors%rowtype; v_line jsonb;
  v_expiry int := app_private.setting_int('unpaid_order_expiry_minutes', 30)::int; v_n int := 0; v_out jsonb := '[]'::jsonb;
  v_pod boolean; v_no text; v_tot bigint; v_prev jsonb;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  if not app_private.has_role('customer') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is null or char_length(p_key) not between 8 and 80 then raise exception 'invalid idempotency key' using errcode = '22023'; end if;

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
      delivery_fee_collection, idempotency_key, expires_at, checkout_id)
    values (v_no, v_actor, v_vendor.id, v_vendor.name, v_f, case when v_f = 'delivery' then p_point end, v_q ->> 'delivery_point_label',
      v_vendor.pickup_location_text, v_vendor.prep_minutes, (v_q ->> 'items_total_kobo')::bigint, (v_q ->> 'delivery_fee_kobo')::bigint,
      (v_q ->> 'platform_fee_kobo')::bigint, (v_q ->> 'discount_kobo')::bigint, (v_q ->> 'total_kobo')::bigint,
      v_q ->> 'delivery_fee_collection', p_key || ':' || v_n::text, now() + make_interval(mins => v_expiry), v_checkout)
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
revoke all on function public.create_orders(jsonb, uuid, text, boolean) from public, anon;
grant execute on function public.create_orders(jsonb, uuid, text, boolean) to authenticated;

-- Starts one Paystack payment for the given orders. Used by payment_prepare (one order) and payment_prepare_checkout (all of a checkout).
create function app_private.payment_group_for(p_customer uuid, p_orders uuid[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_items bigint; v_charge bigint; v_g public.payment_groups%rowtype; v_ref text; v_first text;
begin
  select coalesce(sum(o.total_kobo), 0), min(o.order_number) into v_items, v_first from public.orders o where o.id = any (p_orders);
  if v_items <= 0 then raise exception 'order_not_payable' using errcode = '22023'; end if;
  v_charge := app_private.paystack_charge(v_items);
  -- always a fresh reference: Paystack refuses to start the same reference twice
  v_ref := 'AFG-' || encode(extensions.gen_random_bytes(6), 'hex');
  insert into public.payment_groups (customer_id, reference, items_kobo, fee_kobo, amount_kobo)
    values (p_customer, v_ref, v_items, v_charge, v_items + v_charge) returning * into v_g;
  insert into public.payment_group_orders (group_id, order_id, amount_kobo)
    select v_g.id, o.id, o.total_kobo from public.orders o where o.id = any (p_orders);
  return jsonb_build_object('reference', v_g.reference, 'amount_kobo', v_g.amount_kobo, 'items_kobo', v_g.items_kobo, 'fee_kobo', v_g.fee_kobo,
    'currency', v_g.currency, 'order_number', v_first, 'order_count', coalesce(array_length(p_orders, 1), 0), 'access_code', v_g.access_code);
end $$;
revoke all on function app_private.payment_group_for(uuid, uuid[]) from public, anon, authenticated;

-- Pay ONE order (pay now, or at the door).
create or replace function public.payment_prepare(p_order uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found or v_o.customer_id <> v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_o.payment_timing = 'on_delivery' then
    if not app_private.pay_at_door_window(v_o.status)
       or exists (select 1 from public.payment_transactions t where t.order_id = p_order and t.status = 'succeeded') then
      raise exception 'order_not_payable' using errcode = '22023';
    end if;
  elsif v_o.status <> 'PENDING_PAYMENT' or v_o.expires_at <= now() then
    raise exception 'order_not_payable' using errcode = '22023';
  end if;
  return app_private.payment_group_for(v_actor, array[p_order]);
end $$;

-- Pay ALL the unpaid pay-now orders of one checkout in one go.
create function public.payment_prepare_checkout(p_checkout uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_ids uuid[];
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  select array_agg(o.id order by o.id) into v_ids from public.orders o
   where o.checkout_id = p_checkout and o.customer_id = v_actor and o.payment_timing = 'now'
     and o.status = 'PENDING_PAYMENT' and o.expires_at > now();
  if v_ids is null then raise exception 'order_not_payable' using errcode = '22023'; end if;
  perform 1 from public.orders where id = any (v_ids) order by id for update;
  return app_private.payment_group_for(v_actor, v_ids);
end $$;
revoke all on function public.payment_prepare_checkout(uuid) from public, anon;
grant execute on function public.payment_prepare_checkout(uuid) to authenticated;

create or replace function public.payment_set_access_code(p_reference text, p_access_code text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.payment_groups set access_code = left(p_access_code, 200) where reference = p_reference and status = 'initialized';
  update public.payment_transactions set access_code = left(p_access_code, 200) where reference = p_reference and status = 'initialized';
end $$;

-- What the people looking at one checkout need: its orders and what is still to pay now.
create function public.checkout_summary(p_checkout uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_now bigint; v_ids int;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select coalesce(sum(o.total_kobo), 0), count(*) into v_now, v_ids from public.orders o
   where o.checkout_id = p_checkout and o.customer_id = v_actor and o.payment_timing = 'now' and o.status = 'PENDING_PAYMENT' and o.expires_at > now();
  return jsonb_build_object(
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_number', o.order_number, 'vendor_name', o.vendor_name,
        'fulfilment', o.fulfilment, 'status', o.status, 'total_kobo', o.total_kobo, 'pay_on_delivery', o.payment_timing = 'on_delivery',
        'is_food', app_private.vendor_sells_food(o.vendor_id), 'paid', exists (select 1 from public.payment_transactions t where t.order_id = o.id and t.status = 'succeeded'),
        'door_charge_kobo', case when o.payment_timing = 'on_delivery' then app_private.paystack_charge(o.total_kobo) else 0 end)
        order by o.created_at, o.id) from public.orders o where o.checkout_id = p_checkout and o.customer_id = v_actor), '[]'::jsonb),
    'pay_now_count', v_ids, 'pay_now_items_kobo', v_now, 'pay_now_charge_kobo', app_private.paystack_charge(v_now),
    'pay_now_total_kobo', v_now + app_private.paystack_charge(v_now));
end $$;
revoke all on function public.checkout_summary(uuid) from public, anon;
grant execute on function public.checkout_summary(uuid) to authenticated;

create or replace function public.payment_apply_event(p_event_id text, p_event_type text, p_reference text, p_amount bigint,
                                           p_currency text, p_payload jsonb) returns text
language plpgsql security definer set search_path = ''
as $$
declare v_t public.payment_transactions%rowtype; v_o public.orders%rowtype; v_outcome text; v_other int;
        v_g public.payment_groups%rowtype; v_ga record;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200 then
    raise exception 'invalid event id' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payevt:' || p_event_id, 0));
  if exists (select 1 from public.payment_events where provider_event_id = p_event_id) then return 'duplicate_event'; end if;

  select * into v_g from public.payment_groups where reference = p_reference for update;
  if found then
    if p_event_type = 'charge.success' then
      if v_g.status = 'succeeded' then
        v_outcome := 'already_succeeded';
      elsif p_amount is null or p_amount < v_g.amount_kobo or p_amount > v_g.amount_kobo + least(v_g.amount_kobo * 2 / 100 + 10000, 300000)
            or p_currency is distinct from v_g.currency then
        update public.payment_groups set status = 'mismatch' where id = v_g.id;
        insert into public.reconciliation_flags (order_id, reason, details)
          select go.order_id, 'amount_mismatch', jsonb_build_object('expected_kobo', v_g.amount_kobo, 'received_kobo', p_amount, 'currency', p_currency, 'group', v_g.reference)
            from public.payment_group_orders go where go.group_id = v_g.id;
        v_outcome := 'amount_mismatch';
      else
        update public.payment_groups set status = 'succeeded', succeeded_at = now() where id = v_g.id;
        v_outcome := 'already_succeeded';
        for v_ga in select go.order_id, go.amount_kobo from public.payment_group_orders go where go.group_id = v_g.id order by go.order_id loop
          insert into public.payment_transactions (order_id, reference, amount_kobo, status, succeeded_at, group_id)
            values (v_ga.order_id, v_g.reference, v_ga.amount_kobo, 'succeeded', now(), v_g.id) returning * into v_t;
          insert into public.ledger_entries (order_id, transaction_id, entry_type, amount_kobo)
            values (v_ga.order_id, v_t.id, 'payment_received', v_ga.amount_kobo);
          select * into v_o from public.orders where id = v_ga.order_id for update;
          if v_o.status = 'PENDING_PAYMENT' then
            update public.orders set status = 'PAID' where id = v_o.id;
            insert into public.order_status_history (order_id, from_status, to_status, actor_id, reason)
              values (v_o.id, 'PENDING_PAYMENT', 'PAID', null, 'paystack_payment');
            v_outcome := 'paid';
          elsif v_o.payment_timing = 'on_delivery' and v_o.status <> 'CANCELLED'
                and not exists (select 1 from public.payment_transactions t where t.order_id = v_o.id and t.status = 'succeeded' and t.id <> v_t.id) then
            v_outcome := 'paid';
          elsif v_o.status = 'CANCELLED' then
            insert into public.reconciliation_flags (order_id, transaction_id, reason, details)
              values (v_o.id, v_t.id, 'late_payment', jsonb_build_object('amount_kobo', v_ga.amount_kobo, 'note', 'order was cancelled or expired; refund required'));
            if v_outcome <> 'paid' then v_outcome := 'late_payment'; end if;
          else
            insert into public.reconciliation_flags (order_id, transaction_id, reason, details)
              values (v_o.id, v_t.id, 'duplicate_payment', jsonb_build_object('amount_kobo', v_ga.amount_kobo, 'note', 'the order was already paid'));
            if v_outcome <> 'paid' then v_outcome := 'duplicate_payment'; end if;
          end if;
        end loop;
      end if;
    elsif p_event_type = 'charge.failed' then
      if v_g.status = 'initialized' then
        update public.payment_groups set status = 'failed' where id = v_g.id;
        v_outcome := 'failed';
      else
        v_outcome := 'ignored_out_of_order';
      end if;
    else
      v_outcome := 'ignored_event_type';
    end if;
    insert into public.payment_events (provider_event_id, event_type, reference, payload, outcome)
      values (p_event_id, left(coalesce(p_event_type, ''), 100), left(p_reference, 100), coalesce(p_payload, '{}'::jsonb), v_outcome);
    if v_outcome in ('paid', 'late_payment', 'amount_mismatch', 'duplicate_payment') then
      perform app_private.audit_write(null, 'payment.' || v_outcome, 'payment_group', v_g.id::text, jsonb_build_object('reference', v_g.reference));
    end if;
    return v_outcome;
  end if;

  select * into v_t from public.payment_transactions where reference = p_reference for update;
  if not found then
    v_outcome := 'unknown_reference';
    insert into public.reconciliation_flags (reason, details)
      values ('unknown_reference', jsonb_build_object('reference', left(coalesce(p_reference, ''), 100), 'event', p_event_type));
  elsif p_event_type = 'charge.success' then
    if v_t.status = 'succeeded' then
      v_outcome := 'already_succeeded';
    elsif p_amount is null or p_amount < v_t.amount_kobo or p_amount > v_t.amount_kobo + least(v_t.amount_kobo * 2 / 100 + 10000, 300000) or p_currency is distinct from v_t.currency then
      update public.payment_transactions set status = 'mismatch' where id = v_t.id;
      insert into public.reconciliation_flags (order_id, transaction_id, reason, details)
        values (v_t.order_id, v_t.id, 'amount_mismatch',
                jsonb_build_object('expected_kobo', v_t.amount_kobo, 'received_kobo', p_amount, 'currency', p_currency));
      v_outcome := 'amount_mismatch';
    else
      update public.payment_transactions set status = 'succeeded', succeeded_at = now() where id = v_t.id;
      insert into public.ledger_entries (order_id, transaction_id, entry_type, amount_kobo)
        values (v_t.order_id, v_t.id, 'payment_received', v_t.amount_kobo);
      select * into v_o from public.orders where id = v_t.order_id for update;
      if v_o.status = 'PENDING_PAYMENT' then
        update public.orders set status = 'PAID' where id = v_o.id;
        insert into public.order_status_history (order_id, from_status, to_status, actor_id, reason)
          values (v_o.id, 'PENDING_PAYMENT', 'PAID', null, 'paystack_payment');
        v_outcome := 'paid';
      elsif v_o.payment_timing = 'on_delivery' and v_o.status <> 'CANCELLED'
            and not exists (select 1 from public.payment_transactions t where t.order_id = v_o.id and t.status = 'succeeded' and t.id <> v_t.id) then
        -- paid at the door: the order was already accepted, so only the money is recorded (the hand-over can now finish)
        v_outcome := 'paid';
      elsif v_o.status = 'CANCELLED' then
        insert into public.reconciliation_flags (order_id, transaction_id, reason, details)
          values (v_o.id, v_t.id, 'late_payment', jsonb_build_object('amount_kobo', v_t.amount_kobo, 'note', 'order was cancelled or expired; refund required'));
        v_outcome := 'late_payment';
      else
        select count(*) into v_other from public.payment_transactions where order_id = v_o.id and status = 'succeeded' and id <> v_t.id;
        insert into public.reconciliation_flags (order_id, transaction_id, reason, details)
          values (v_o.id, v_t.id, 'duplicate_payment', jsonb_build_object('amount_kobo', v_t.amount_kobo, 'other_successes', v_other));
        v_outcome := 'duplicate_payment';
      end if;
    end if;
  elsif p_event_type = 'charge.failed' then
    if v_t.status = 'initialized' then
      update public.payment_transactions set status = 'failed' where id = v_t.id;
      v_outcome := 'failed';
    else
      v_outcome := 'ignored_out_of_order';
    end if;
  else
    v_outcome := 'ignored_event_type';
  end if;

  insert into public.payment_events (provider_event_id, event_type, reference, payload, outcome)
    values (p_event_id, left(coalesce(p_event_type, ''), 100), left(p_reference, 100), coalesce(p_payload, '{}'::jsonb), v_outcome);
  if v_outcome in ('paid', 'late_payment', 'amount_mismatch', 'duplicate_payment') then
    perform app_private.audit_write(null, 'payment.' || v_outcome, 'order', v_t.order_id::text, jsonb_build_object('reference', v_t.reference));
  end if;
  return v_outcome;
end $$;

-- The shop and the customer are told the order was placed to be paid on delivery (not "paid").

-- What the people at the hand-over need to know (now with Paystack's charge for a payment at the door).
create or replace function public.order_payment_view(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found then return null; end if;
  if v_o.customer_id <> v_actor
     and not exists (select 1 from public.vendor_staff vs where vs.vendor_id = v_o.vendor_id and vs.user_id = v_actor)
     and not exists (select 1 from public.delivery_assignments d where d.order_id = p_order and d.rider_id = v_actor
                      and d.status in ('accepted', 'picked_up', 'en_route')) then
    return null;
  end if;
  return jsonb_build_object('pay_at_door', v_o.payment_timing = 'on_delivery',
    'paid', exists (select 1 from public.payment_transactions t where t.order_id = p_order and t.status = 'succeeded'),
    'amount_kobo', v_o.total_kobo, 'charge_kobo', app_private.paystack_charge(v_o.total_kobo),
    'can_pay_now', app_private.pay_at_door_window(v_o.status), 'checkout_id', v_o.checkout_id,
    'is_food', app_private.vendor_sells_food(v_o.vendor_id),
    'unpaid_siblings', (select count(*) from public.orders x where x.checkout_id = v_o.checkout_id and v_o.checkout_id is not null and x.customer_id = v_o.customer_id
                         and x.payment_timing = 'now' and x.status = 'PENDING_PAYMENT' and x.expires_at > now()));
end $$;
