-- The ID card pictures a rider or student shop owner sends WITH THEIR SIGN-UP (rider_identity) now also show in the
-- administrators' lists, like the pictures sent with an application.
create or replace function public.admin_list_id_cards() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_platform_admin();
  return coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object('user_id', c.user_id, 'kind', c.kind, 'created_at', c.created_at) as x from public.application_id_cards c
      union all
      select jsonb_build_object('user_id', r.user_id, 'kind', 'rider', 'created_at', r.created_at)
        from public.rider_identity r
       where not exists (select 1 from public.application_id_cards c where c.user_id = r.user_id and c.kind = 'rider')
    ) t), '[]'::jsonb);
end $$;

create or replace function public.admin_view_id_card(p_user uuid, p_kind text, p_side text) returns bytea
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_platform_admin(); v_img bytea;
begin
  if p_kind not in ('vendor', 'rider') or p_side not in ('front', 'back') then raise exception 'invalid_request' using errcode = '22023'; end if;
  select case when p_side = 'front' then c.front else c.back end into v_img from public.application_id_cards c where c.user_id = p_user and c.kind = p_kind;
  if v_img is null then
    select case when p_side = 'front' then r.id_front_jpeg else r.id_back_jpeg end into v_img from public.rider_identity r where r.user_id = p_user;
  end if;
  if v_img is null then return null; end if;
  perform app_private.audit_write(v_actor, 'id_card.viewed', 'user', p_user::text, jsonb_build_object('kind', p_kind, 'side', p_side));
  return v_img;
end $$;
