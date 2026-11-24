-- Where a person with a used invitation link stopped (read by the server only). Lets the link take them back.
create or replace function public.vendor_invite_progress(p_token text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'label', i.label,
    'email', u.email,
    'confirmed', u.email_confirmed_at is not null,
    'applied', exists (select 1 from public.vendor_applications a where a.applicant_id = i.used_by),
    'has_shop', exists (select 1 from public.vendor_staff s where s.user_id = i.used_by),
    'draft_waiting', coalesce(jsonb_typeof(u.raw_user_meta_data -> 'shop') = 'object', false))
  from public.vendor_invites i join auth.users u on u.id = i.used_by
  where i.token = p_token and i.used_by is not null and i.revoked_at is null
$$;
revoke all on function public.vendor_invite_progress(text) from public, anon, authenticated;
grant execute on function public.vendor_invite_progress(text) to service_role;
