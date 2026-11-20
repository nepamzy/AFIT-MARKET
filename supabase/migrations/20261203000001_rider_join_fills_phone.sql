-- A rider whose account was set up by staff (no phone yet) gets the name and phone they type when they join a shop with its code.
create or replace function public.rider_join_with_code(p_user uuid, p_code text, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_c public.rider_join_codes%rowtype; v_owner uuid; v_vname text;
begin
  if exists (select 1 from public.vendor_riders where rider_user_id = p_user and revoked_at is null and claimed_at is not null) then
    raise exception 'already_linked' using errcode = '22023';
  end if;
  if exists (select 1 from public.rider_profiles where user_id = p_user and status = 'suspended') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_c from public.rider_join_codes where code = p_code and used_at is null and expires_at > now() for update;
  if not found then raise exception 'code_not_found' using errcode = 'P0002'; end if;
  select v.owner_id, v.name into v_owner, v_vname from public.vendors v where v.id = v_c.vendor_id and v.status = 'approved';
  if v_owner is null then raise exception 'code_not_found' using errcode = 'P0002'; end if;
  insert into public.rider_profiles (user_id, full_name, contact_phone, approved_by, status)
    values (p_user, btrim(p_name), btrim(p_phone), v_owner, 'approved')
    on conflict (user_id) do update set status = 'approved',
      full_name = case when rider_profiles.full_name = '' then excluded.full_name else rider_profiles.full_name end,
      contact_phone = case when rider_profiles.contact_phone = '' then excluded.contact_phone else rider_profiles.contact_phone end
    where rider_profiles.status <> 'suspended';
  insert into public.role_assignments (user_id, role, granted_by) values (p_user, 'rider', v_owner)
    on conflict (user_id, role) where status = 'active' do nothing;
  insert into public.vendor_riders (vendor_id, name, phone, rider_user_id, claimed_at) values (v_c.vendor_id, btrim(p_name), btrim(p_phone), p_user, now());
  update public.rider_join_codes set used_by = p_user, used_at = now() where id = v_c.id;
  perform app_private.audit_write(p_user, 'rider.joined_shop', 'vendor', v_c.vendor_id::text, jsonb_build_object('code_id', v_c.id));
  return jsonb_build_object('vendor_id', v_c.vendor_id, 'vendor_name', v_vname);
end $$;
