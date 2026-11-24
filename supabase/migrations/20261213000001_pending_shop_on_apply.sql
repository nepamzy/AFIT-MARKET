-- A shop owner who applies gets the shop straight away, in the "pending" state: they can open the dashboard and set the shop up
-- (items, banner, hours, payout account), but nothing is visible to customers and nothing can be sold until an administrator approves.
-- Approving now only switches the existing shop to "approved"; rejecting removes the pending shop and the shop-owner role.

-- 1. setting-up actions are allowed for pending shops too (everything customers see still needs status = 'approved')
create or replace function app_private.require_vendor_actor(p_vendor uuid, p_owner_only boolean default false) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_role text; v_status text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  select vs.staff_role into v_role from public.vendor_staff vs where vs.vendor_id = p_vendor and vs.user_id = v_actor;
  if v_role is null or (p_owner_only and v_role <> 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select v.status into v_status from public.vendors v where v.id = p_vendor;
  if v_status is null or v_status not in ('approved', 'pending') then
    raise exception 'vendor is not active' using errcode = '42501';
  end if;
end $$;

-- 2. every new application opens its pending shop
create or replace function app_private.open_pending_shop() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_slug text; v_base text; v_vendor uuid; v_try int := 0;
begin
  if new.vendor_id is not null or new.status <> 'pending' then return new; end if;
  v_base := trim(both '-' from lower(regexp_replace(new.business_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then v_base := 'vendor'; end if;
  v_base := left(v_base, 50);
  loop
    v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    exit when not exists (select 1 from public.vendors where slug = v_slug);
    v_try := v_try + 1;
    if v_try > 10 then raise exception 'could not allocate slug'; end if;
  end loop;
  insert into public.vendors (name, slug, status, description, category_id, contact_phone, pickup_location_text, owner_id)
  values (new.business_name, v_slug, 'pending', new.description, new.category_id, new.contact_phone,
          new.pickup_location_text, new.applicant_id)
  returning id into v_vendor;
  update public.vendors set other_category = new.other_category where id = v_vendor;
  insert into public.vendor_categories (vendor_id, category_id)
    select v_vendor, x from unnest(array[new.category_id] || coalesce(new.extra_category_ids, '{}')) as x on conflict do nothing;
  insert into public.vendor_staff (vendor_id, user_id, staff_role) values (v_vendor, new.applicant_id, 'owner');
  insert into public.role_assignments (user_id, role, granted_by) values (new.applicant_id, 'vendor_owner', new.applicant_id)
  on conflict (user_id, role) where status = 'active' do nothing;
  update public.vendor_applications set vendor_id = v_vendor where id = new.id;
  return new;
end $$;
revoke all on function app_private.open_pending_shop() from public, anon, authenticated;
drop trigger if exists vendor_applications_open_shop on public.vendor_applications;
create trigger vendor_applications_open_shop after insert on public.vendor_applications
  for each row execute function app_private.open_pending_shop();

-- 3. approving switches the existing shop on; rejecting removes the pending shop
do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.decide_vendor_application(uuid,text,text)'::regprocedure);
  v_new := replace(v_def,
    $a$    return null;
  end if;
$a$,
    $b$    if v_app.vendor_id is not null then
      update public.role_assignments set status = 'revoked', revoked_at = now(), revoked_by = v_actor
       where user_id = v_app.applicant_id and role = 'vendor_owner' and status = 'active';
      begin
        delete from public.vendors where id = v_app.vendor_id;
      exception when others then
        update public.vendors set status = 'suspended' where id = v_app.vendor_id;
      end;
    end if;
    return null;
  end if;
$b$);
  if v_new = v_def then raise exception 'reject patch did not apply'; end if;
  v_def := v_new;
  v_new := replace(v_def,
    $c$  v_base := trim(both '-' from lower($c$,
    $d$  if v_app.vendor_id is not null then
    update public.vendors set status = 'approved' where id = v_app.vendor_id;
    update public.vendor_applications
       set status = 'approved', decided_by = v_actor, decided_at = now(), decision_reason = nullif(btrim(p_reason), '')
     where id = p_application;
    perform app_private.audit_write(v_actor, 'vendor_application.approved', 'vendor_application', p_application::text,
      jsonb_build_object('vendor_id', v_app.vendor_id));
    return v_app.vendor_id;
  end if;

  v_base := trim(both '-' from lower($d$);
  if v_new = v_def then raise exception 'approve patch did not apply'; end if;
  execute v_new;
end $mig$;
