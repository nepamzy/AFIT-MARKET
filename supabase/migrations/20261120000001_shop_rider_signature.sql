-- Hand-over from shop to rider with a SIGNATURE instead of a QR code: the rider signs on the shop's phone.
-- Service role only: the app first compares the drawing with the signature the rider saved at sign-up, then calls this.
create table public.rider_pickup_signatures (
  assignment_id uuid primary key references public.delivery_assignments (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  signature_png bytea not null,
  recorded_by uuid not null,
  signed_at timestamptz not null default now()
);
alter table public.rider_pickup_signatures enable row level security;
revoke all on public.rider_pickup_signatures from public, anon, authenticated;
grant all on public.rider_pickup_signatures to service_role;
create trigger rider_pickup_signatures_append_only before update or delete on public.rider_pickup_signatures
  for each row execute function app_private.deny_mutation();

create function public.vendor_rider_pickup_signed(p_actor uuid, p_order uuid, p_rider_sig bytea) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_o public.orders%rowtype; v_a public.delivery_assignments%rowtype;
begin
  if p_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  perform app_private.lock_order_row(p_order);
  select * into v_o from public.orders where id = p_order;
  if not found or not exists (select 1 from public.vendor_staff vs where vs.vendor_id = v_o.vendor_id and vs.user_id = p_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_a from public.delivery_assignments where order_id = p_order and status = 'accepted' for update;
  if not found or v_o.status <> 'RIDER_ASSIGNED' then return jsonb_build_object('ok', false, 'reason', 'no_pending_pickup'); end if;
  if v_a.rider_id = p_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_rider_sig is null or octet_length(p_rider_sig) not between 100 and 300000 then
    raise exception 'signature_required' using errcode = '22023';
  end if;
  insert into public.rider_pickup_signatures (assignment_id, order_id, signature_png, recorded_by)
    values (v_a.id, p_order, p_rider_sig, p_actor);
  update public.assignment_tokens set invalidated_at = now() where assignment_id = v_a.id and used_at is null and invalidated_at is null;
  update public.delivery_assignments set status = 'picked_up', picked_up_at = now() where id = v_a.id;
  perform app_private.step_order(p_order, 'RIDER_ASSIGNED', 'PICKED_UP_BY_RIDER', p_actor, 'rider_signed_pickup');
  perform app_private.audit_write(p_actor, 'rider_handover.confirmed', 'order', p_order::text,
    jsonb_build_object('assignment', v_a.id, 'channel', 'signature'));
  return jsonb_build_object('ok', true, 'order_number', v_o.order_number);
end $$;
revoke all on function public.vendor_rider_pickup_signed(uuid, uuid, bytea) from public, anon, authenticated;
grant execute on function public.vendor_rider_pickup_signed(uuid, uuid, bytea) to service_role;
