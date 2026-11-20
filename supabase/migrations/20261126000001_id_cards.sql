-- Student ID cards for people who apply to sell or to deliver.
-- A student applicant sends two pictures of the new AFIT ID card: the front (with the QR code) and the back (with the normal text).
-- The pictures are shrunk to JPEGs in the browser and kept here. The table is closed to every API role: an applicant can only write
-- their own card through save_my_id_card, and only a platform administrator (aal2) can read one, through admin_view_id_card, which
-- writes an audit line every time a picture is opened.

create table public.application_id_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('vendor', 'rider')),
  front bytea not null check (octet_length(front) between 2000 and 700000),
  back bytea not null check (octet_length(back) between 2000 and 700000),
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.application_id_cards enable row level security;
revoke all on public.application_id_cards from public, anon, authenticated;
grant all on public.application_id_cards to service_role;

create function public.save_my_id_card(p_kind text, p_front bytea, p_back bytea) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('vendor', 'rider') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_front is null or octet_length(p_front) not between 2000 and 700000
     or get_byte(p_front, 0) <> 255 or get_byte(p_front, 1) <> 216 or get_byte(p_front, 2) <> 255
     or p_back is null or octet_length(p_back) not between 2000 and 700000
     or get_byte(p_back, 0) <> 255 or get_byte(p_back, 1) <> 216 or get_byte(p_back, 2) <> 255 then
    raise exception 'invalid_image' using errcode = '22023';
  end if;
  insert into public.application_id_cards (user_id, kind, front, back) values (v_actor, p_kind, p_front, p_back)
    on conflict (user_id, kind) do update set front = excluded.front, back = excluded.back, created_at = now();
  perform app_private.audit_write(v_actor, 'id_card.saved', 'user', v_actor::text, jsonb_build_object('kind', p_kind));
end $$;
revoke all on function public.save_my_id_card(text, bytea, bytea) from public, anon;
grant execute on function public.save_my_id_card(text, bytea, bytea) to authenticated;

-- which applicants have sent a card (no pictures): for the administrators' lists
create function public.admin_list_id_cards() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_platform_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'kind', c.kind, 'created_at', c.created_at)) from public.application_id_cards c), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_id_cards() from public, anon;
grant execute on function public.admin_list_id_cards() to authenticated;

-- one picture, for a platform administrator; every look is recorded
create function public.admin_view_id_card(p_user uuid, p_kind text, p_side text) returns bytea
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_platform_admin(); v_img bytea;
begin
  if p_kind not in ('vendor', 'rider') or p_side not in ('front', 'back') then raise exception 'invalid_request' using errcode = '22023'; end if;
  select case when p_side = 'front' then c.front else c.back end into v_img from public.application_id_cards c where c.user_id = p_user and c.kind = p_kind;
  if v_img is null then return null; end if;
  perform app_private.audit_write(v_actor, 'id_card.viewed', 'user', p_user::text, jsonb_build_object('kind', p_kind, 'side', p_side));
  return v_img;
end $$;
revoke all on function public.admin_view_id_card(uuid, text, text) from public, anon;
grant execute on function public.admin_view_id_card(uuid, text, text) to authenticated;
