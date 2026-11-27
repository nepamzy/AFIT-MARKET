-- More for the co-founder's own area: send an application back to the founder with a note, shop invitation links,
-- and a read-only view of support cases (no customer names or contact details).

alter table public.vendor_applications
  add column cofounder_note text check (cofounder_note is null or char_length(cofounder_note) between 5 and 300),
  add column cofounder_note_at timestamptz;

create or replace function public.cofounder_list_applications(p_status text default 'pending') returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.require_cofounder();
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'invalid status' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
    select a.id, a.business_name, a.description, a.contact_phone, a.pickup_location_text, a.shop_place, a.vendor_type,
           a.delivery_fee_kobo, a.created_at, a.status, a.decided_at, a.cofounder_note, a.cofounder_note_at,
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

-- "Send back to the founder": the application stays waiting, carries his note, and the founder is told.
create function public.cofounder_send_back(p_application uuid, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_cofounder(); v_app public.vendor_applications%rowtype; v_note text := btrim(coalesce(p_note, ''));
begin
  if char_length(v_note) < 5 or char_length(v_note) > 300 then raise exception 'a short note is needed' using errcode = '22023'; end if;
  select * into v_app from public.vendor_applications where id = p_application for update;
  if not found then raise exception 'unknown application' using errcode = 'P0002'; end if;
  if v_app.status <> 'pending' then raise exception 'already decided' using errcode = '23505'; end if;
  update public.vendor_applications set cofounder_note = v_note, cofounder_note_at = now() where id = p_application;
  perform app_private.audit_write(v_actor, 'vendor_application.sent_back', 'vendor_application', p_application::text, '{}'::jsonb);
  perform app_private.notify_roles(array['platform_admin']::public.app_role[],
    'Co-founder needs you on a shop', left(v_app.business_name, 60) || ': ' || left(v_note, 120), '/admin/applications',
    'cofounder-note:' || p_application::text || ':' || extract(epoch from clock_timestamp())::bigint::text);
end $$;

-- shop invitation links, for him to hand out; used ones show how far the shop got
create function public.cofounder_list_invites() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_cofounder();
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
    select i.id, i.token, i.label, i.created_at, i.used_at, i.revoked_at,
           (select a.business_name from public.vendor_applications a where a.applicant_id = i.used_by order by a.created_at desc limit 1) as shop_name,
           (select a.status from public.vendor_applications a where a.applicant_id = i.used_by order by a.created_at desc limit 1) as shop_status
      from public.vendor_invites i order by i.created_at desc limit 200) t), '[]'::jsonb);
end $$;

create function public.cofounder_create_invites(p_count int, p_label text) returns int
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_cofounder(); v_label text := nullif(btrim(coalesce(p_label, '')), ''); i int;
begin
  if p_count is null or p_count < 1 or p_count > 20 then raise exception 'invalid count' using errcode = '22023'; end if;
  if v_label is not null and char_length(v_label) > 60 then raise exception 'label too long' using errcode = '22023'; end if;
  for i in 1..p_count loop
    insert into public.vendor_invites (token, label, created_by)
      values (encode(extensions.gen_random_bytes(12), 'hex'), case when v_label is null then null when p_count = 1 then v_label else v_label || ' #' || i end, v_actor);
  end loop;
  perform app_private.audit_write(v_actor, 'vendor_invites.created', 'vendor_invite', 'batch', jsonb_build_object('count', p_count, 'by', 'cofounder'));
  return p_count;
end $$;

-- support cases to keep an eye on: no names, no contact details, no decisions
create function public.cofounder_list_cases() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_cofounder();
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
    select c.case_no, c.case_type, c.status, c.created_at, left(c.description, 240) as description
      from public.support_cases c order by c.created_at desc limit 50) t), '[]'::jsonb);
end $$;

revoke all on function public.cofounder_send_back(uuid, text), public.cofounder_list_invites(),
  public.cofounder_create_invites(int, text), public.cofounder_list_cases() from public, anon;
grant execute on function public.cofounder_send_back(uuid, text), public.cofounder_list_invites(),
  public.cofounder_create_invites(int, text), public.cofounder_list_cases() to authenticated, service_role;
