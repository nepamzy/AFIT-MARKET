-- Each shop sets its own delivery fee, up to 500 naira (50,000 kobo). Existing shops keep 500.
alter table public.vendors add column if not exists delivery_fee_kobo integer not null default 50000 check (delivery_fee_kobo between 0 and 50000);
alter table public.vendor_applications add column if not exists delivery_fee_kobo integer check (delivery_fee_kobo is null or delivery_fee_kobo between 0 and 50000);

create or replace function app_private.vendor_delivery_fee_from_application() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_fee integer;
begin
  select a.delivery_fee_kobo into v_fee from public.vendor_applications a
   where a.applicant_id = new.owner_id and a.delivery_fee_kobo is not null order by a.created_at desc limit 1;
  if v_fee is not null then new.delivery_fee_kobo := least(greatest(v_fee, 0), 50000); end if;
  return new;
end $$;
drop trigger if exists vendors_delivery_fee_from_application on public.vendors;
create trigger vendors_delivery_fee_from_application before insert on public.vendors
  for each row execute function app_private.vendor_delivery_fee_from_application();

create or replace function public.vendor_set_delivery_fee(p_vendor uuid, p_kobo integer) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  if p_kobo is null or p_kobo < 0 or p_kobo > 50000 then raise exception 'invalid_delivery_fee' using errcode = '22023'; end if;
  update public.vendors set delivery_fee_kobo = p_kobo, updated_at = now() where id = p_vendor;
  perform app_private.audit_write(v_actor, 'vendor.delivery_fee_set', 'vendor', p_vendor::text, jsonb_build_object('kobo', p_kobo));
end $$;
revoke all on function public.vendor_set_delivery_fee(uuid, integer) from public, anon;
grant execute on function public.vendor_set_delivery_fee(uuid, integer) to authenticated;

do $$
declare d text; n text;
begin
  foreach n in array array['price_cart', 'price_cart_v'] loop
    d := pg_get_functiondef(('app_private.' || n)::regproc);
    if position('v_delivery := app_private.setting_int(''delivery_fee_kobo'', 0);' in d) = 0 then raise exception 'pattern not found in %', n; end if;
    d := replace(d, 'v_delivery := app_private.setting_int(''delivery_fee_kobo'', 0);', 'v_delivery := least(greatest(coalesce(v_vendor.delivery_fee_kobo, 50000), 0), 50000);');
    execute d;
  end loop;
end $$;
