-- 1. The tag on a shop he approves is always "Co-founder" (no personal name stored or shown).
create or replace function public.cofounder_approve_application(p_application uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := app_private.require_cofounder();
  v_app public.vendor_applications%rowtype;
begin
  select * into v_app from public.vendor_applications where id = p_application for update;
  if not found then raise exception 'unknown application' using errcode = 'P0002'; end if;
  if v_app.status <> 'pending' then raise exception 'already decided' using errcode = '23505'; end if;
  if v_app.vendor_id is null then raise exception 'ask the founder to approve this one' using errcode = '42501'; end if;
  update public.vendors set status = 'approved', approved_by = v_actor, approved_by_name = 'Co-founder', approved_at = now()
   where id = v_app.vendor_id;
  update public.vendor_applications
     set status = 'approved', decided_by = v_actor, decided_at = now(), decision_reason = 'Approved by co-founder'
   where id = p_application;
  perform app_private.audit_write(v_actor, 'vendor_application.approved', 'vendor_application', p_application::text,
    jsonb_build_object('vendor_id', v_app.vendor_id, 'by', 'cofounder'));
  perform app_private.notify_roles(array['platform_admin']::public.app_role[],
    'Shop approved by the co-founder', left(v_app.business_name, 80) || ' was approved.', '/admin/vendors',
    'cofounder-approved:' || p_application::text);
  return v_app.vendor_id;
end $$;
update public.vendors set approved_by_name = 'Co-founder' where approved_by_name is not null;

-- 2. A personal sign-up link for the co-founder only. It works once. The account it makes has no special access until
--    the owner grants the "cofounder" role (Admin, Roles); revoking that role is how access is suspended, granting it again restores it.
create table public.cofounder_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[0-9a-f]{24}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);
alter table public.cofounder_invites enable row level security;
revoke all on public.cofounder_invites from public, anon, authenticated;

create function public.admin_create_cofounder_invite() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_platform_admin(); v_tok text; v_id uuid;
begin
  -- only one open link at a time: a new link cancels any unused one
  update public.cofounder_invites set revoked_at = now() where used_at is null and revoked_at is null;
  v_tok := encode(extensions.gen_random_bytes(12), 'hex');
  insert into public.cofounder_invites (token, created_by) values (v_tok, v_actor) returning id into v_id;
  perform app_private.audit_write(v_actor, 'cofounder_invite.created', 'cofounder_invite', v_id::text, '{}'::jsonb);
  return jsonb_build_object('id', v_id, 'token', v_tok);
end $$;

create function public.admin_list_cofounder_invites() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_platform_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token, 'created_at', t.created_at,
            'used_at', t.used_at, 'revoked_at', t.revoked_at, 'used_by', t.used_by, 'used_by_name', t.nm) order by t.created_at desc)
          from (select i.*, d.full_name as nm from public.cofounder_invites i left join public.profile_details d on d.user_id = i.used_by
                 order by i.created_at desc limit 20) t), '[]'::jsonb);
end $$;

create function public.admin_revoke_cofounder_invite(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_platform_admin();
begin
  update public.cofounder_invites set revoked_at = now() where id = p_id and used_at is null and revoked_at is null;
  perform app_private.audit_write(v_actor, 'cofounder_invite.revoked', 'cofounder_invite', p_id::text, '{}'::jsonb);
end $$;

create function public.cofounder_invite_check(p_token text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.cofounder_invites i where i.token = p_token and i.used_at is null and i.revoked_at is null)
$$;

create function public.cofounder_invite_consume(p_token text, p_user uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  update public.cofounder_invites set used_by = p_user, used_at = now()
   where token = p_token and used_at is null and revoked_at is null returning id into v_id;
  if v_id is null then return false; end if;
  perform app_private.audit_write(p_user, 'cofounder_invite.used', 'cofounder_invite', v_id::text, '{}'::jsonb);
  perform app_private.notify_roles(array['platform_admin']::public.app_role[],
    'Co-founder account created', 'The co-founder signed up with the link. Check the account, then grant the role.', '/admin/cofounder',
    'cofounder-signup:' || v_id::text);
  return true;
end $$;

revoke all on function public.admin_create_cofounder_invite(), public.admin_list_cofounder_invites(), public.admin_revoke_cofounder_invite(uuid),
  public.cofounder_invite_check(text), public.cofounder_invite_consume(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_cofounder_invite(), public.admin_list_cofounder_invites(), public.admin_revoke_cofounder_invite(uuid) to authenticated;
grant execute on function public.cofounder_invite_check(text), public.cofounder_invite_consume(text, uuid) to service_role;
