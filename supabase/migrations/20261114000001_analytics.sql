-- First-party analytics: visits (once per browser session), app installs and installed-app opens.
-- No cookies, no names, no e-mail, no IP address stored. Written only by the server (service role); read only through
-- admin_analytics(), which needs a platform admin or finance admin at aal2.

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('visit', 'app_installed', 'app_opened')),
  source text not null default 'direct' check (source ~ '^[a-z0-9_-]{1,40}$'),
  device text not null default 'other' check (device in ('android', 'ios', 'desktop', 'other'))
);
create index analytics_events_kind_time_idx on public.analytics_events (kind, created_at desc);

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;
grant all on public.analytics_events to service_role;

create function public.admin_analytics(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_days int := least(greatest(coalesce(p_days, 30), 7), 90); v_since timestamptz;
begin
  perform app_private.require_staff(array['platform_admin', 'finance_admin']::public.app_role[]);
  v_since := now() - make_interval(days => v_days);
  return jsonb_build_object(
    'days', v_days,
    'visits', (select count(*) from public.analytics_events where kind = 'visit' and created_at >= v_since),
    'app_installs', (select count(*) from public.analytics_events where kind = 'app_installed' and created_at >= v_since),
    'app_opens', (select count(*) from public.analytics_events where kind = 'app_opened' and created_at >= v_since),
    'new_users', (select count(*) from auth.users where created_at >= v_since),
    'users_total', (select count(*) from auth.users),
    'users_with_alerts', (select count(distinct user_id) from public.push_subscriptions),
    'orders', (select count(*) from public.orders where created_at >= v_since),
    'buyers', (select count(distinct customer_id) from public.orders where created_at >= v_since),
    'sales_kobo', (select coalesce(sum(amount_kobo), 0) from public.ledger_entries where entry_type = 'payment_received' and created_at >= v_since),
    'visits_by_source', coalesce((select jsonb_agg(to_jsonb(t)) from (
        select source, count(*) as n from public.analytics_events
        where kind = 'visit' and created_at >= v_since group by source order by count(*) desc limit 10) t), '[]'::jsonb),
    'visits_by_device', coalesce((select jsonb_agg(to_jsonb(t)) from (
        select device, count(*) as n from public.analytics_events
        where kind = 'visit' and created_at >= v_since group by device order by count(*) desc limit 4) t), '[]'::jsonb),
    'installs_by_device', coalesce((select jsonb_agg(to_jsonb(t)) from (
        select device, count(*) as n from public.analytics_events
        where kind = 'app_installed' and created_at >= v_since group by device order by count(*) desc limit 4) t), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'visits', coalesce(ev.visits, 0),
          'installs', coalesce(ev.installs, 0), 'signups', coalesce(us.n, 0)) order by d)
        from generate_series(v_since::date, now()::date, interval '1 day') d
        left join (select e.created_at::date as day,
                          count(*) filter (where e.kind = 'visit') as visits,
                          count(*) filter (where e.kind = 'app_installed') as installs
                   from public.analytics_events e where e.created_at >= v_since group by 1) ev on ev.day = d::date
        left join (select u.created_at::date as day, count(*) as n from auth.users u
                   where u.created_at >= v_since group by 1) us on us.day = d::date), '[]'::jsonb),
    'top_vendors', coalesce((select jsonb_agg(to_jsonb(t)) from (
        select o.vendor_name, count(*) as orders from public.orders o
        where o.created_at >= v_since group by o.vendor_name order by count(*) desc limit 5) t), '[]'::jsonb));
end $$;

revoke all on function public.admin_analytics(int) from public, anon;
grant execute on function public.admin_analytics(int) to authenticated, service_role;
