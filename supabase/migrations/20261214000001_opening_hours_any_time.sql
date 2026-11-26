-- A shop may open and close at ANY time. A closing time that is not later than the opening time means the shop closes after midnight
-- (for example 18:00 to 02:00), and the same time twice means open all day and night.
alter table public.store_hours drop constraint if exists store_hours_order;

create or replace function app_private.vendor_is_open(p_vendor uuid, p_at timestamptz default now()) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select v.status = 'approved' and not v.temporarily_closed and exists (
      select 1 from public.store_hours h
      where h.vendor_id = v.id
        and (
          (h.opens < h.closes and h.weekday = n.d and n.t >= h.opens and n.t < h.closes)
          or (h.opens >= h.closes and (
                (h.weekday = n.d and n.t >= h.opens)
                or (h.weekday = (n.d + 6) % 7 and n.t < h.closes)))
        ))
    from public.vendors v,
         lateral (select extract(dow from (p_at at time zone 'Africa/Lagos'))::int as d,
                         (p_at at time zone 'Africa/Lagos')::time as t) n
    where v.id = p_vendor), false)
$$;

create or replace function public.vendor_set_hours(p_vendor uuid, p_hours jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e jsonb; v_count int; v_wd smallint; v_o time; v_c time;
  starts int[] := '{}'; durs int[] := '{}'; s int; d int; mo int; mc int; j int; k int;
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' then raise exception 'hours must be an array' using errcode = '22023'; end if;
  v_count := jsonb_array_length(p_hours);
  if v_count > 28 then raise exception 'too many intervals' using errcode = '22023'; end if;
  for e in select * from jsonb_array_elements(p_hours) loop
    begin
      v_wd := (e->>'weekday')::smallint; v_o := (e->>'opens')::time; v_c := (e->>'closes')::time;
    exception when others then
      raise exception 'invalid interval' using errcode = '22023';
    end;
    if v_wd is null or v_o is null or v_c is null or v_wd not between 0 and 6 then
      raise exception 'invalid interval' using errcode = '22023';
    end if;
    mo := extract(hour from v_o)::int * 60 + extract(minute from v_o)::int;
    mc := extract(hour from v_c)::int * 60 + extract(minute from v_c)::int;
    s := v_wd * 1440 + mo;
    d := case when mc > mo then mc - mo else 1440 - mo + mc end;
    -- no two intervals may overlap, counting those that run past midnight (and the week wrapping round)
    for j in 1 .. coalesce(array_length(starts, 1), 0) loop
      foreach k in array array[-10080, 0, 10080] loop
        if s < starts[j] + k + durs[j] and starts[j] + k < s + d then
          raise exception 'overlapping intervals' using errcode = '22023';
        end if;
      end loop;
    end loop;
    starts := starts || s; durs := durs || d;
  end loop;
  delete from public.store_hours where vendor_id = p_vendor;
  insert into public.store_hours (vendor_id, weekday, opens, closes)
    select p_vendor, (x->>'weekday')::smallint, (x->>'opens')::time, (x->>'closes')::time from jsonb_array_elements(p_hours) x;
  perform app_private.audit_write((select auth.uid()), 'vendor.hours_updated', 'vendor', p_vendor::text,
    jsonb_build_object('intervals', v_count));
end $$;
