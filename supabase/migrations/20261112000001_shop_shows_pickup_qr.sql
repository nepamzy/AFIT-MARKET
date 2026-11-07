-- Hand-over from shop to rider, the other way round: the SHOP shows a one-time QR code (and short code) for the order, and the
-- assigned RIDER scans it (or types the code). The scan completes the hand-over; the shop does nothing more.
-- Uses the existing assignment_tokens table. The older functions (rider issues a code, shop types it) stay in the database but the
-- screens no longer use them.

-- the shop issues a fresh one-time code for the rider assigned to this order (a new one cancels the old one)
create function public.vendor_issue_pickup_token(p_order uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_a public.delivery_assignments%rowtype; v_token text; v_exp timestamptz;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app_private.require_vendor_actor(v_o.vendor_id);
  select * into v_a from public.delivery_assignments where order_id = p_order and status = 'accepted' for update;
  if not found or v_o.status <> 'RIDER_ASSIGNED' then raise exception 'no_pending_pickup' using errcode = '22023'; end if;
  update public.assignment_tokens set invalidated_at = now() where assignment_id = v_a.id and used_at is null and invalidated_at is null;
  v_token := upper(encode(extensions.gen_random_bytes(5), 'hex'));
  v_exp := now() + interval '15 minutes';
  insert into public.assignment_tokens (assignment_id, token_hash, expires_at)
    values (v_a.id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_exp);
  perform app_private.audit_write(v_actor, 'rider_handover.qr_shown', 'order', p_order::text, jsonb_build_object('assignment', v_a.id));
  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end $$;

-- the rider scans (or types) the shop's code: only the rider assigned to the order, only while it waits for collection
create function public.rider_confirm_pickup(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_rider uuid := app_private.require_rider(); v_t public.assignment_tokens%rowtype; v_a public.delivery_assignments%rowtype; v_o public.orders%rowtype;
begin
  select t.* into v_t from public.assignment_tokens t join public.delivery_assignments d on d.id = t.assignment_id
   where d.rider_id = v_rider and d.status = 'accepted' and t.used_at is null and t.invalidated_at is null
     and t.token_hash = encode(extensions.digest(upper(btrim(coalesce(p_token, ''))), 'sha256'), 'hex')
   for update of t;
  if not found then
    perform app_private.audit_write(v_rider, 'rider_handover.wrong_code', 'rider', v_rider::text, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'wrong_code');
  end if;
  if v_t.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'code_expired'); end if;
  select * into v_a from public.delivery_assignments where id = v_t.assignment_id for update;
  select * into v_o from public.orders where id = v_a.order_id for update;
  if v_o.status <> 'RIDER_ASSIGNED' then return jsonb_build_object('ok', false, 'reason', 'no_pending_pickup'); end if;
  update public.assignment_tokens set used_at = now() where id = v_t.id;
  update public.delivery_assignments set status = 'picked_up', picked_up_at = now() where id = v_a.id;
  perform app_private.step_order(v_a.order_id, 'RIDER_ASSIGNED', 'PICKED_UP_BY_RIDER', v_rider, 'rider_scanned_pickup');
  perform app_private.audit_write(v_rider, 'rider_handover.confirmed', 'order', v_a.order_id::text, jsonb_build_object('assignment', v_a.id));
  return jsonb_build_object('ok', true, 'order_number', v_o.order_number);
end $$;

revoke all on function public.vendor_issue_pickup_token(uuid), public.rider_confirm_pickup(text) from public, anon, authenticated;
grant execute on function public.vendor_issue_pickup_token(uuid), public.rider_confirm_pickup(text) to authenticated;
