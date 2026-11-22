-- A shop's banner picture (shown on its shop page and card). Kept like product photos: shrunk to a JPEG in the browser,
-- service-role only, written through the two functions below. Without one, the site draws a shop front.
create table public.vendor_banners (
  vendor_id uuid primary key references public.vendors (id) on delete cascade,
  jpeg bytea not null check (octet_length(jpeg) between 500 and 600000),
  updated_at timestamptz not null default now()
);
alter table public.vendor_banners enable row level security;
revoke all on public.vendor_banners from public, anon, authenticated;
grant all on public.vendor_banners to service_role;

create function public.vendor_set_banner(p_vendor uuid, p_jpeg bytea) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  if p_jpeg is null or octet_length(p_jpeg) not between 500 and 600000
     or get_byte(p_jpeg, 0) <> 255 or get_byte(p_jpeg, 1) <> 216 or get_byte(p_jpeg, 2) <> 255 then
    raise exception 'invalid_image' using errcode = '22023';
  end if;
  insert into public.vendor_banners (vendor_id, jpeg) values (p_vendor, p_jpeg)
    on conflict (vendor_id) do update set jpeg = excluded.jpeg, updated_at = now();
  perform app_private.audit_write(v_actor, 'vendor.banner_set', 'vendor', p_vendor::text, '{}'::jsonb);
end $$;
revoke all on function public.vendor_set_banner(uuid, bytea) from public, anon;
grant execute on function public.vendor_set_banner(uuid, bytea) to authenticated;

create function public.vendor_remove_banner(p_vendor uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  delete from public.vendor_banners where vendor_id = p_vendor;
  perform app_private.audit_write(v_actor, 'vendor.banner_removed', 'vendor', p_vendor::text, '{}'::jsonb);
end $$;
revoke all on function public.vendor_remove_banner(uuid) from public, anon;
grant execute on function public.vendor_remove_banner(uuid) to authenticated;
