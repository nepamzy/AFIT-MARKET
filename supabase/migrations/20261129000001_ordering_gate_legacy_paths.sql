-- Closes the gaps found in review of the ordering gate:
-- 1. The older single-order function create_order is now a thin wrapper over create_orders, so the "ordering is not open yet" rule
--    (and the clothing/checkout rules) apply to every way of placing an order, with no second copy of the logic.
-- 2. cart_add_item keeps carts.vendor_id set while the cart holds items from ONE shop (and clears it when there are several), so
--    older readers of that column keep working.
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
  update public.carts set updated_at = now(),
         vendor_id = (select case when count(distinct p.vendor_id) = 1 then (array_agg(distinct p.vendor_id))[1] end
                        from public.cart_items ci join public.products p on p.id = ci.product_id where ci.cart_id = v_cart.id)
   where id = v_cart.id;
  return jsonb_build_object('status', 'added');
end $$;

create or replace function public.create_order(p_fulfilment text, p_delivery_point uuid, p_idempotency_key text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_vendors uuid[]; v_res jsonb;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_fulfilment is null or p_fulfilment not in ('pickup', 'delivery') then raise exception 'invalid_fulfilment' using errcode = '22023'; end if;
  select array_agg(distinct p.vendor_id) into v_vendors
    from public.carts c join public.cart_items ci on ci.cart_id = c.id join public.products p on p.id = ci.product_id where c.user_id = v_actor;
  if v_vendors is not null and array_length(v_vendors, 1) > 1 then raise exception 'multiple_vendors' using errcode = '22023'; end if;
  v_res := public.create_orders(
    case when v_vendors is null then '{}'::jsonb else jsonb_build_object(v_vendors[1]::text, p_fulfilment) end,
    p_delivery_point, p_idempotency_key, false, null);
  return ((v_res -> 'orders' -> 0) ->> 'id')::uuid;
end $$;
