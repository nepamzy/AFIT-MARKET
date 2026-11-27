-- Co-founder analytics: the owner's private board that works out, month by month, the co-founder's earned stake,
-- the profit share to pay him and the share for AFIT. Owner (platform_admin) only. Nothing here is shown to anyone else.

create table public.cofounder_settings (
  id boolean primary key default true check (id),
  cofounder_name text not null default 'Co-founder' check (char_length(cofounder_name) between 2 and 80),
  signing_date date,
  graduation_date date,
  stake_bps int not null default 1000 check (stake_bps between 1 and 5000),
  cliff_active_months int not null default 2 check (cliff_active_months between 0 and 12),
  valuation_multiple numeric not null default 2 check (valuation_multiple between 0.5 and 10),
  floor_per_percent_kobo bigint not null default 3000000 check (floor_per_percent_kobo >= 0),
  bad_leaver_percent int not null default 50 check (bad_leaver_percent between 0 and 100),
  school_share_bps int not null default 500 check (school_share_bps between 0 and 5000),
  default_running_costs_kobo bigint not null default 12907000 check (default_running_costs_kobo >= 0),
  statement_day int not null default 5 check (statement_day between 1 and 28),
  payment_day int not null default 15 check (payment_day between 1 and 28),
  school_payment_day int not null default 7 check (school_payment_day between 1 and 28),
  updated_at timestamptz not null default now()
);
insert into public.cofounder_settings (id) values (true);

create table public.cofounder_months (
  month date primary key check (month = date_trunc('month', month)::date),
  active boolean not null default true,
  running_costs_kobo bigint check (running_costs_kobo is null or running_costs_kobo >= 0),
  other_deductions_kobo bigint not null default 0 check (other_deductions_kobo >= 0),
  school_share_override_kobo bigint check (school_share_override_kobo is null or school_share_override_kobo >= 0),
  cofounder_paid_kobo bigint check (cofounder_paid_kobo is null or cofounder_paid_kobo >= 0),
  cofounder_paid_on date,
  school_paid_kobo bigint check (school_paid_kobo is null or school_paid_kobo >= 0),
  school_paid_on date,
  note text check (note is null or char_length(note) <= 200),
  updated_at timestamptz not null default now()
);

create table public.cofounder_reminders (
  key text primary key check (char_length(key) between 3 and 120),
  sent_at timestamptz not null default now()
);

alter table public.cofounder_settings enable row level security;
alter table public.cofounder_months enable row level security;
alter table public.cofounder_reminders enable row level security;
revoke all on public.cofounder_settings, public.cofounder_months, public.cofounder_reminders from public, anon, authenticated;

-- the whole board in one read: settings, month rows, and the commission AFIT Market earned in each month (Lagos time)
create function public.admin_cofounder_overview() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.require_staff(array['platform_admin']::public.app_role[]);
  return jsonb_build_object(
    'settings', (select to_jsonb(s) from public.cofounder_settings s where id),
    'months', coalesce((select jsonb_agg(to_jsonb(m) order by m.month) from public.cofounder_months m), '[]'::jsonb),
    'income', coalesce((select jsonb_agg(jsonb_build_object('month', x.month, 'income_kobo', x.income) order by x.month) from (
        select m.month,
               coalesce((select sum(l.commission_kobo) from public.order_settlement_lines l
                          where date_trunc('month', l.created_at at time zone 'Africa/Lagos')::date = m.month), 0)
             - coalesce((select sum(a.commission_reversed_kobo) from public.order_settlement_adjustments a
                          where date_trunc('month', a.created_at at time zone 'Africa/Lagos')::date = m.month), 0) as income
          from (select distinct date_trunc('month', created_at at time zone 'Africa/Lagos')::date as month from public.order_settlement_lines
                union select month from public.cofounder_months) m
      ) x), '[]'::jsonb)
  );
end $$;

create function public.admin_cofounder_save_settings(p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.require_staff(array['platform_admin']::public.app_role[]);
  update public.cofounder_settings set
    cofounder_name = coalesce(nullif(btrim(p->>'cofounder_name'), ''), cofounder_name),
    signing_date = case when p ? 'signing_date' then nullif(p->>'signing_date', '')::date else signing_date end,
    graduation_date = case when p ? 'graduation_date' then nullif(p->>'graduation_date', '')::date else graduation_date end,
    stake_bps = coalesce((p->>'stake_bps')::int, stake_bps),
    cliff_active_months = coalesce((p->>'cliff_active_months')::int, cliff_active_months),
    valuation_multiple = coalesce((p->>'valuation_multiple')::numeric, valuation_multiple),
    floor_per_percent_kobo = coalesce((p->>'floor_per_percent_kobo')::bigint, floor_per_percent_kobo),
    bad_leaver_percent = coalesce((p->>'bad_leaver_percent')::int, bad_leaver_percent),
    school_share_bps = coalesce((p->>'school_share_bps')::int, school_share_bps),
    default_running_costs_kobo = coalesce((p->>'default_running_costs_kobo')::bigint, default_running_costs_kobo),
    statement_day = coalesce((p->>'statement_day')::int, statement_day),
    payment_day = coalesce((p->>'payment_day')::int, payment_day),
    school_payment_day = coalesce((p->>'school_payment_day')::int, school_payment_day),
    updated_at = now()
  where id;
end $$;

-- one month's inputs. Passing p_active alone just flips the month on or off for vesting
create function public.admin_cofounder_save_month(p_month date, p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_m date := date_trunc('month', p_month)::date;
begin
  perform app_private.require_staff(array['platform_admin']::public.app_role[]);
  insert into public.cofounder_months (month) values (v_m) on conflict (month) do nothing;
  update public.cofounder_months set
    active = coalesce((p->>'active')::boolean, active),
    running_costs_kobo = case when p ? 'running_costs_kobo' then nullif(p->>'running_costs_kobo', '')::bigint else running_costs_kobo end,
    other_deductions_kobo = coalesce((p->>'other_deductions_kobo')::bigint, other_deductions_kobo),
    school_share_override_kobo = case when p ? 'school_share_override_kobo' then nullif(p->>'school_share_override_kobo', '')::bigint else school_share_override_kobo end,
    cofounder_paid_kobo = case when p ? 'cofounder_paid_kobo' then nullif(p->>'cofounder_paid_kobo', '')::bigint else cofounder_paid_kobo end,
    cofounder_paid_on = case when p ? 'cofounder_paid_on' then nullif(p->>'cofounder_paid_on', '')::date else cofounder_paid_on end,
    school_paid_kobo = case when p ? 'school_paid_kobo' then nullif(p->>'school_paid_kobo', '')::bigint else school_paid_kobo end,
    school_paid_on = case when p ? 'school_paid_on' then nullif(p->>'school_paid_on', '')::date else school_paid_on end,
    note = case when p ? 'note' then nullif(btrim(p->>'note'), '') else note end,
    updated_at = now()
  where month = v_m;
end $$;

-- fills the months between the signing date and graduation (all active; the owner switches off the breaks)
create function public.admin_cofounder_fill_months() returns int
language plpgsql security definer set search_path = ''
as $$
declare s public.cofounder_settings%rowtype; v_n int;
begin
  perform app_private.require_staff(array['platform_admin']::public.app_role[]);
  select * into s from public.cofounder_settings where id;
  if s.signing_date is null or s.graduation_date is null then raise exception 'dates_needed' using errcode = '22023'; end if;
  insert into public.cofounder_months (month)
    select g::date from generate_series(date_trunc('month', s.signing_date), date_trunc('month', s.graduation_date), interval '1 month') g
    on conflict (month) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- reminder written once per key: an in-app notification for the owner (which also feeds push and e-mail like any other)
create function public.cofounder_notify_once(p_key text, p_title text, p_body text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_new boolean;
begin
  insert into public.cofounder_reminders (key) values (left(p_key, 120)) on conflict (key) do nothing;
  get diagnostics v_new = row_count;
  if v_new then
    perform app_private.notify_roles(array['platform_admin']::public.app_role[], left(p_title, 80), left(p_body, 200), '/admin/cofounder', left('cofounder:' || p_key, 120));
  end if;
  return v_new;
end $$;

revoke all on function public.admin_cofounder_overview() from public, anon;
revoke all on function public.admin_cofounder_save_settings(jsonb) from public, anon;
revoke all on function public.admin_cofounder_save_month(date, jsonb) from public, anon;
revoke all on function public.admin_cofounder_fill_months() from public, anon;
revoke all on function public.cofounder_notify_once(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_cofounder_overview() to authenticated, service_role;
grant execute on function public.admin_cofounder_save_settings(jsonb) to authenticated, service_role;
grant execute on function public.admin_cofounder_save_month(date, jsonb) to authenticated, service_role;
grant execute on function public.admin_cofounder_fill_months() to authenticated, service_role;
grant execute on function public.cofounder_notify_once(text, text, text) to service_role;
