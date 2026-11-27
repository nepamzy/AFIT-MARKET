-- The co-founder's own dashboard. Everything here is least privilege:
--  * he sees shop applications WITHOUT ID card images, identity numbers, dates of birth, e-mail or bank details;
--  * he may approve a pending shop (never reject, never change money settings), and the shop's record carries his name;
--  * the owner is told at once through the notification queue (in-app, push, and the e-mail alert sent by the server);
--  * revoking the role (Admin, Roles) switches all of this off at once.

alter table public.vendors
  add column approved_by uuid references auth.users (id) on delete set null,
  add column approved_by_name text check (approved_by_name is null or char_length(approved_by_name) <= 80),
  add column approved_at timestamptz;

create function app_private.require_cofounder() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  if not app_private.has_role('cofounder') then raise exception 'forbidden' using errcode = '42501'; end if;
  return v_actor;
end $$;

-- the numbers on his home screen
create function public.cofounder_overview() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_cofounder();
begin
  return jsonb_build_object(
    'applications_waiting', (select count(*) from public.vendor_applications where status = 'pending'),
    'approved_by_me', (select count(*) from public.vendors where approved_by = v_actor),
    'shops_live', (select count(*) from public.vendors where status = 'approved'),
    'invites_unused', (select count(*) from public.vendor_invites where used_at is null and revoked_at is null),
    'invites_used', (select count(*) from public.vendor_invites where used_at is not null),
    'orders_7d', (select count(*) from public.orders where created_at >= now() - interval '7 days'),
    'cases_open', (select count(*) from public.support_cases where status in ('open', 'under_review'))
  );
end $$;

-- applications, with only what a first review needs
create function public.cofounder_list_applications(p_status text default 'pending') returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.require_cofounder();
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'invalid status' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
    select a.id, a.business_name, a.description, a.contact_phone, a.pickup_location_text, a.shop_place, a.vendor_type,
           a.delivery_fee_kobo, a.created_at, a.status, a.decided_at,
           c.name as category,
           coalesce(p.display_name, 'Applicant') as applicant_name,
           v.approved_by_name,
           (select count(*) from public.products pr where pr.vendor_id = a.vendor_id) as items,
           (select count(*) from public.vendor_riders vr where vr.vendor_id = a.vendor_id) as riders
      from public.vendor_applications a
      left join public.categories c on c.id = a.category_id
      left join public.profiles p on p.id = a.applicant_id
      left join public.vendors v on v.id = a.vendor_id
     where a.status = p_status
     order by a.created_at desc
     limit 100) t), '[]'::jsonb);
end $$;

-- approve a shop that applied and is waiting. The shop's record is tagged with his name; the owner is notified.
create function public.cofounder_approve_application(p_application uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := app_private.require_cofounder();
  v_app public.vendor_applications%rowtype;
  v_name text;
begin
  select * into v_app from public.vendor_applications where id = p_application for update;
  if not found then raise exception 'unknown application' using errcode = 'P0002'; end if;
  if v_app.status <> 'pending' then raise exception 'already decided' using errcode = '23505'; end if;
  if v_app.vendor_id is null then raise exception 'ask the founder to approve this one' using errcode = '42501'; end if;
  select coalesce(nullif(btrim(display_name), ''), 'Co-founder') into v_name from public.profiles where id = v_actor;
  v_name := coalesce(v_name, 'Co-founder');
  update public.vendors set status = 'approved', approved_by = v_actor, approved_by_name = v_name, approved_at = now()
   where id = v_app.vendor_id;
  update public.vendor_applications
     set status = 'approved', decided_by = v_actor, decided_at = now(), decision_reason = 'Approved by co-founder'
   where id = p_application;
  perform app_private.audit_write(v_actor, 'vendor_application.approved', 'vendor_application', p_application::text,
    jsonb_build_object('vendor_id', v_app.vendor_id, 'by', 'cofounder'));
  perform app_private.notify_roles(array['platform_admin']::public.app_role[],
    'Shop approved by ' || left(v_name, 40), left(v_app.business_name, 80) || ' was approved.', '/admin/vendors',
    'cofounder-approved:' || p_application::text);
  return v_app.vendor_id;
end $$;

-- his own statement: the same figures the owner's board uses, nothing about payments to anyone else
create function public.cofounder_statement_data() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.require_cofounder();
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'floor_per_percent_kobo' - 'bad_leaver_percent' - 'valuation_multiple' from public.cofounder_settings s where id),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m.month, 'active', m.active,
        'running_costs_kobo', m.running_costs_kobo, 'other_deductions_kobo', m.other_deductions_kobo,
        'school_share_override_kobo', m.school_share_override_kobo, 'cofounder_paid_kobo', m.cofounder_paid_kobo,
        'cofounder_paid_on', m.cofounder_paid_on, 'school_paid_kobo', null, 'school_paid_on', null, 'note', null) order by m.month)
        from public.cofounder_months m), '[]'::jsonb),
    'income', (public.cofounder_data_service()->'income')
  );
end $$;

revoke all on function app_private.require_cofounder() from public, anon;
revoke all on function public.cofounder_overview() from public, anon;
revoke all on function public.cofounder_list_applications(text) from public, anon;
revoke all on function public.cofounder_approve_application(uuid) from public, anon;
revoke all on function public.cofounder_statement_data() from public, anon;
grant execute on function app_private.require_cofounder() to authenticated, service_role;
grant execute on function public.cofounder_overview() to authenticated, service_role;
grant execute on function public.cofounder_list_applications(text) to authenticated, service_role;
grant execute on function public.cofounder_approve_application(uuid) to authenticated, service_role;
grant execute on function public.cofounder_statement_data() to authenticated, service_role;
