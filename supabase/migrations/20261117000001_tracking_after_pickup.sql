-- Tracking for the customer starts AFTER the rider has collected the order from the shop (not when the rider accepts).
-- Until then the rider is on the way to the shop and the customer sees nothing live; the customer's own position is also
-- only taken in from pickup onward. The rider's map keeps its two stages (to the shop, then to the customer).

create or replace function app_private.tracking_payload(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_o public.orders%rowtype; v_a public.delivery_assignments%rowtype; v_l public.rider_location_current%rowtype;
        v_stale int := app_private.setting_int('location_stale_after_seconds', 90)::int; v_age double precision; v_dp public.approved_delivery_points%rowtype;
begin
  select * into v_o from public.orders where id = p_order;
  if v_o.status not in ('PICKED_UP_BY_RIDER', 'EN_ROUTE', 'ARRIVAL_DETECTED') then
    return jsonb_build_object('tracking', false, 'reason', 'not_in_transit', 'status', v_o.status);
  end if;
  select * into v_a from public.delivery_assignments where order_id = p_order and status in ('picked_up', 'en_route');
  if not found then return jsonb_build_object('tracking', false, 'reason', 'no_active_assignment', 'status', v_o.status); end if;
  if not exists (select 1 from public.rider_shifts s where s.id = v_a.shift_id and s.ended_at is null) then
    return jsonb_build_object('tracking', false, 'reason', 'rider_not_sharing', 'status', v_o.status);
  end if;
  select * into v_l from public.rider_location_current where rider_id = v_a.rider_id and shift_id = v_a.shift_id;
  select * into v_dp from public.approved_delivery_points where id = v_o.delivery_point_id;
  if v_l.rider_id is null then
    return jsonb_build_object('tracking', false, 'reason', 'no_location_yet', 'status', v_o.status,
      'destination', jsonb_build_object('label', v_o.delivery_point_label, 'lat', v_a.dest_lat, 'lng', v_a.dest_lng, 'synthetic', coalesce(v_dp.is_synthetic, true)));
  end if;
  v_age := extract(epoch from (now() - v_l.observed_at));
  return jsonb_build_object('tracking', true, 'status', v_o.status,
    'rider', jsonb_build_object('lat', v_l.lat, 'lng', v_l.lng, 'accuracy_m', v_l.accuracy_m, 'observed_at', v_l.observed_at,
                                 'age_seconds', round(v_age), 'stale', v_age > v_stale),
    'destination', jsonb_build_object('label', v_o.delivery_point_label, 'lat', v_a.dest_lat, 'lng', v_a.dest_lng,
                                      'radius_m', v_a.dest_radius_m, 'synthetic', coalesce(v_dp.is_synthetic, true)),
    'arrival_detected', v_a.arrival_detected_at is not null);
end $$;

create or replace function public.customer_post_location(p_order uuid, p_lat double precision, p_lng double precision, p_accuracy double precision)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  if not exists (select 1 from public.orders where id = p_order and customer_id = v_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_accuracy < 0 then
    return jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;
  if p_accuracy > 5000 then return jsonb_build_object('accepted', false, 'reason', 'inaccurate'); end if;
  if not exists (select 1 from public.delivery_assignments where order_id = p_order and status in ('picked_up', 'en_route')) then
    delete from public.customer_location_current where order_id = p_order;
    return jsonb_build_object('accepted', false, 'reason', 'no_active_delivery');
  end if;
  insert into public.customer_location_current (order_id, customer_id, lat, lng, accuracy_m, observed_at)
    values (p_order, v_actor, p_lat, p_lng, p_accuracy, now())
  on conflict (order_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m, observed_at = now();
  return jsonb_build_object('accepted', true);
end $$;

create or replace function public.rider_job_map(p_assignment uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_rider(); v_a public.delivery_assignments%rowtype; v_o public.orders%rowtype;
        v_r public.rider_location_current%rowtype; v_c public.customer_location_current%rowtype;
        v_v public.vendor_location_current%rowtype; v_stale int := app_private.setting_int('location_stale_after_seconds', 90)::int;
        v_before_pickup boolean;
begin
  select * into v_a from public.delivery_assignments where id = p_assignment and rider_id = v_actor and status in ('accepted', 'picked_up', 'en_route');
  if not found then return jsonb_build_object('active', false); end if;
  v_before_pickup := v_a.status = 'accepted';
  select * into v_o from public.orders where id = v_a.order_id;
  select * into v_r from public.rider_location_current where rider_id = v_actor;
  select * into v_c from public.customer_location_current where order_id = v_a.order_id;
  select * into v_v from public.vendor_location_current where vendor_id = v_o.vendor_id;
  return jsonb_build_object('active', true, 'stage', case when v_before_pickup then 'to_shop' else 'to_customer' end,
    'destination', case when v_before_pickup then jsonb_build_object('label', null, 'lat', null, 'lng', null)
                        else jsonb_build_object('label', v_o.delivery_point_label, 'lat', v_a.dest_lat, 'lng', v_a.dest_lng) end,
    'shop', case when not v_before_pickup or v_v.vendor_id is null then null
                 else jsonb_build_object('label', v_o.vendor_name, 'lat', v_v.lat, 'lng', v_v.lng,
                      'age_seconds', round(extract(epoch from (now() - v_v.observed_at)))) end,
    'shop_name', v_o.vendor_name,
    'rider', case when v_r.rider_id is null then null else jsonb_build_object('lat', v_r.lat, 'lng', v_r.lng,
        'age_seconds', round(extract(epoch from (now() - v_r.observed_at)))) end,
    'customer', case when v_before_pickup or v_c.order_id is null then null else jsonb_build_object('lat', v_c.lat, 'lng', v_c.lng,
        'accuracy_m', v_c.accuracy_m,
        'age_seconds', round(extract(epoch from (now() - v_c.observed_at))),
        'stale', extract(epoch from (now() - v_c.observed_at)) > v_stale) end);
end $$;
