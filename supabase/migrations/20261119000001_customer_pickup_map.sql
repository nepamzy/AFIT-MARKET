-- A customer collecting their own order sees where the shop is, from the moment the order is paid until it is handed over.
-- Only the customer who placed the order, only for pickup orders, only while it is waiting to be collected.
create function public.customer_pickup_map(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_v public.vendor_location_current%rowtype;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order and customer_id = v_actor;
  if not found or v_o.fulfilment <> 'pickup'
     or v_o.status not in ('PAID', 'VENDOR_REVIEW', 'ACCEPTED', 'PREPARING', 'READY', 'PICKUP_AWAITING_HANDOVER') then
    return jsonb_build_object('active', false);
  end if;
  select * into v_v from public.vendor_location_current where vendor_id = v_o.vendor_id;
  return jsonb_build_object('active', true, 'shop_name', v_o.vendor_name, 'address', v_o.pickup_location_snapshot,
    'shop', case when v_v.vendor_id is null then null
                 else jsonb_build_object('lat', v_v.lat, 'lng', v_v.lng,
                      'age_seconds', round(extract(epoch from (now() - v_v.observed_at)))) end);
end $$;
revoke all on function public.customer_pickup_map(uuid) from public, anon;
grant execute on function public.customer_pickup_map(uuid) to authenticated;
