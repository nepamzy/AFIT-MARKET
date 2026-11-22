-- 1. The delivery fee is part of the customer's one payment, and AFIT's commission is taken from the whole payment (items after
--    discount plus the delivery fee) for delivery and pickup alike. The shop receives the rest and pays its own rider.
do $$
declare d text; n text;
begin
  select pg_get_functiondef('app_private.settle_completed_order()'::regprocedure) into d;
  n := replace(d, 'v_base := o.items_total_kobo - o.discount_kobo;',
    'v_base := o.items_total_kobo - o.discount_kobo + case when o.delivery_fee_collection = ''paystack'' then o.delivery_fee_kobo else 0 end;');
  if n = d then raise exception 'settlement base text not found'; end if;
  execute n;

  select pg_get_functiondef('app_private.payment_group_for(uuid, uuid[])'::regprocedure) into d;
  n := replace(d, '(o.items_total_kobo - o.discount_kobo) - app_private.round_bps(o.items_total_kobo - o.discount_kobo, v_bps)',
    '(o.items_total_kobo - o.discount_kobo + case when o.delivery_fee_collection = ''paystack'' then o.delivery_fee_kobo else 0 end) - app_private.round_bps(o.items_total_kobo - o.discount_kobo + case when o.delivery_fee_collection = ''paystack'' then o.delivery_fee_kobo else 0 end, v_bps)');
  if n = d then raise exception 'shop share text not found'; end if;
  execute n;
end $$;

update public.platform_settings set value = '"paystack"'::jsonb, updated_at = now() where key = 'delivery_fee_collection_mode';
select app_private.audit_write(null, 'setting.changed', 'platform_setting', 'delivery_fee_collection_mode',
  jsonb_build_object('old', 'direct_to_rider', 'new', 'paystack', 'reason', 'Delivery fee is now part of the one payment; the shop pays its own rider', 'outcome', 'applied'));

-- 2. Where every delivery ended: kept for the owner, with the time. Taken from the rider's phone at the moment the order is
--    handed over; if the phone gave no recent position, the approved delivery point is recorded instead.
create table public.delivery_locations (
  order_id uuid primary key references public.orders (id) on delete cascade,
  assignment_id uuid references public.delivery_assignments (id) on delete set null,
  rider_id uuid references auth.users (id) on delete set null,
  vendor_id uuid references public.vendors (id) on delete set null,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  observed_at timestamptz,
  point_label text,
  source text not null check (source in ('rider_phone', 'delivery_point', 'none')),
  recorded_at timestamptz not null default now()
);
alter table public.delivery_locations enable row level security;
revoke all on public.delivery_locations from public, anon, authenticated;
grant all on public.delivery_locations to service_role;
create index delivery_locations_recorded_idx on public.delivery_locations (recorded_at desc);

create function app_private.record_delivery_location() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare o public.orders%rowtype; a public.delivery_assignments%rowtype; l public.rider_location_current%rowtype;
begin
  if new.to_status <> 'DELIVERED' then return new; end if;
  select * into o from public.orders where id = new.order_id;
  if not found or o.fulfilment <> 'delivery' then return new; end if;
  select * into a from public.delivery_assignments where order_id = new.order_id order by assignment_no desc limit 1;
  if a.rider_id is not null then
    select * into l from public.rider_location_current where rider_id = a.rider_id;
  end if;
  if l.rider_id is not null and l.observed_at > now() - interval '30 minutes' then
    insert into public.delivery_locations (order_id, assignment_id, rider_id, vendor_id, lat, lng, accuracy_m, observed_at, point_label, source)
      values (o.id, a.id, a.rider_id, o.vendor_id, l.lat, l.lng, l.accuracy_m, l.observed_at, o.delivery_point_label, 'rider_phone')
      on conflict (order_id) do nothing;
  else
    insert into public.delivery_locations (order_id, assignment_id, rider_id, vendor_id, lat, lng, point_label, source)
      values (o.id, a.id, a.rider_id, o.vendor_id, a.dest_lat, a.dest_lng, o.delivery_point_label,
              case when a.dest_lat is null then 'none' else 'delivery_point' end)
      on conflict (order_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function app_private.record_delivery_location() from public, anon, authenticated;
create trigger order_status_history_delivery_location after insert on public.order_status_history
  for each row execute function app_private.record_delivery_location();

create function public.admin_list_delivery_locations(p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_platform_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('order_id', t.order_id, 'order_number', t.order_number, 'vendor_name', t.vendor_name,
            'rider_name', t.rider_name, 'point_label', t.point_label, 'lat', t.lat, 'lng', t.lng, 'accuracy_m', t.accuracy_m,
            'source', t.source, 'recorded_at', t.recorded_at) order by t.recorded_at desc)
          from (select dl.*, o.order_number, o.vendor_name, rp.full_name as rider_name
                  from public.delivery_locations dl join public.orders o on o.id = dl.order_id
                  left join public.rider_profiles rp on rp.user_id = dl.rider_id
                 order by dl.recorded_at desc limit least(greatest(coalesce(p_limit, 200), 1), 500)) t), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_delivery_locations(int) from public, anon;
grant execute on function public.admin_list_delivery_locations(int) to authenticated;
