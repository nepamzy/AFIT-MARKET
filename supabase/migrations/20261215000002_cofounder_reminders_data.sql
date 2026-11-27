-- The daily job reads the same board data as the owner's page, without a signed-in person (service role only).
create function public.cofounder_data_service() returns jsonb
language sql security definer set search_path = ''
as $$
  select jsonb_build_object(
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
  )
$$;
revoke all on function public.cofounder_data_service() from public, anon, authenticated;
grant execute on function public.cofounder_data_service() to service_role;
