-- 1. While a rider is on the way to collect an order, the SHOP sees the rider on a map (and the rider already sees the shop).
--    Only the shop's own staff, only for an order whose rider has accepted and has not collected it yet. Nothing about the
--    customer is included, and once the rider has the parcel the shop's view ends.
create function public.vendor_rider_map(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_a public.delivery_assignments%rowtype;
        v_r public.rider_location_current%rowtype; v_v public.vendor_location_current%rowtype;
        v_stale int := app_private.setting_int('location_stale_after_seconds', 90)::int;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found or not exists (select 1 from public.vendor_staff vs where vs.vendor_id = v_o.vendor_id and vs.user_id = v_actor) then
    return jsonb_build_object('active', false);
  end if;
  select * into v_a from public.delivery_assignments where order_id = p_order and status = 'accepted';
  if not found or v_o.status <> 'RIDER_ASSIGNED' then return jsonb_build_object('active', false); end if;
  select * into v_r from public.rider_location_current where rider_id = v_a.rider_id;
  select * into v_v from public.vendor_location_current where vendor_id = v_o.vendor_id;
  return jsonb_build_object('active', true,
    'rider_name', (select rp.full_name from public.rider_profiles rp where rp.user_id = v_a.rider_id),
    'rider', case when v_r.rider_id is null then null else jsonb_build_object('lat', v_r.lat, 'lng', v_r.lng,
        'age_seconds', round(extract(epoch from (now() - v_r.observed_at))),
        'stale', extract(epoch from (now() - v_r.observed_at)) > v_stale) end,
    'shop', case when v_v.vendor_id is null then null else jsonb_build_object('lat', v_v.lat, 'lng', v_v.lng) end);
end $$;
revoke all on function public.vendor_rider_map(uuid) from public, anon;
grant execute on function public.vendor_rider_map(uuid) to authenticated;

-- 2. "Your rider is on the move": the customer is told the moment the rider has collected the order (tracking starts then).
--    The older "On its way" message is only sent when the order skipped the pick-up step, so nobody is told twice.
create or replace function app_private.notify_order_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare o public.orders%rowtype; v_title text; v_body text; v_key text;
begin
  select * into o from public.orders where id = new.order_id;
  if not found then return new; end if;
  v_key := 'order:' || new.id::text;
  if new.to_status = 'PAID' then
    perform app_private.notify(o.customer_id, 'order', 'Order received', 'Your payment was received. The shop will review your order.', '/orders/' || o.id, v_key);
    perform app_private.notify_vendor_members(o.vendor_id, 'New order', 'A new paid order is waiting for you.', '/vendor/orders', v_key);
    return new;
  end if;
  if new.to_status = 'EN_ROUTE' and exists (select 1 from public.order_status_history h
                                             where h.order_id = new.order_id and h.to_status = 'PICKED_UP_BY_RIDER') then
    return new;
  end if;
  v_title := case new.to_status
    when 'ACCEPTED' then 'Order accepted'
    when 'CANCELLED' then 'Order cancelled'
    when 'PICKUP_AWAITING_HANDOVER' then 'Ready for pickup'
    when 'RIDER_ASSIGNED' then 'Rider assigned'
    when 'PICKED_UP_BY_RIDER' then 'Your rider is on the move'
    when 'EN_ROUTE' then 'On its way'
    when 'ARRIVAL_DETECTED' then 'Your rider has arrived'
    when 'COMPLETED' then 'Order complete'
    when 'DISPUTED' then 'Order under review'
    when 'RETURN_REQUESTED' then 'Return update'
    when 'RETURN_IN_PROGRESS' then 'Return update'
    when 'RETURNED_TO_VENDOR' then 'Return update'
    else null end;
  if v_title is null then return new; end if;
  v_body := case new.to_status
    when 'PICKED_UP_BY_RIDER' then 'Your rider has your order. Open it to follow the rider on the map.'
    when 'ARRIVAL_DETECTED' then 'Open your order to confirm that you received it.'
    when 'CANCELLED' then 'Your order was cancelled. Open it to see what happens next.'
    when 'PICKUP_AWAITING_HANDOVER' then 'Your order is ready. Open it to see your pickup details.'
    else 'Open your order to see the latest status.' end;
  perform app_private.notify(o.customer_id, 'order', v_title, v_body, '/orders/' || o.id, v_key);
  return new;
exception when others then
  insert into public.notification_errors (event_key, error) values (left(v_key, 120), left(sqlerrm, 300));
  return new;
end $$;
