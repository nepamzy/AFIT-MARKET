-- The rider's map follows the delivery in two stages:
--   1. Accepted (heading to the shop): the rider sees the shop's location and themselves. Nothing of the customer yet.
--   2. After the hand-over at the shop (picked up / on the way): the shop pin goes away; the rider sees the delivery point,
--      themselves and the customer's position.
-- The shop's position comes from the shop owner's or staff phone while they have the orders screen open (automatic, no buttons).

create table public.vendor_location_current (
  vendor_id uuid primary key references public.vendors (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  observed_at timestamptz not null default now()
);
alter table public.vendor_location_current enable row level security;
revoke all on public.vendor_location_current from public, anon, authenticated;
grant all on public.vendor_location_current to service_role;

create function public.vendor_post_location(p_lat double precision, p_lng double precision, p_accuracy double precision) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_vendor uuid;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select vs.vendor_id into v_vendor from public.vendor_staff vs where vs.user_id = v_actor limit 1;
  if v_vendor is null then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app_private.require_vendor_actor(v_vendor);
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 1000 then
    return jsonb_build_object('accepted', false, 'reason', 'inaccurate');
  end if;
  insert into public.vendor_location_current (vendor_id, lat, lng, accuracy_m, observed_at)
    values (v_vendor, p_lat, p_lng, p_accuracy, now())
    on conflict (vendor_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m, observed_at = now();
  return jsonb_build_object('accepted', true);
end $$;
revoke all on function public.vendor_post_location(double precision, double precision, double precision) from public, anon;
grant execute on function public.vendor_post_location(double precision, double precision, double precision) to authenticated;

create or replace function public.rider_job_map(p_assignment uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_rider(); v_a public.delivery_assignments%rowtype; v_o public.orders%rowtype;
        v_r public.rider_location_current%rowtype; v_c public.customer_location_current%rowtype;
        v_v public.vendor_location_current%rowtype; v_stale int := app_private.setting_int('location_stale_after_seconds', 45)::int;
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
        'age_seconds', round(extract(epoch from (now() - v_c.observed_at))),
        'stale', extract(epoch from (now() - v_c.observed_at)) > v_stale) end);
end $$;
