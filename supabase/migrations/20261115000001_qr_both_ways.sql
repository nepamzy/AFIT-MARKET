-- QR hand-overs in BOTH directions, for delivery and for pickup. No signature is needed any more.
--   Delivery: the rider shows a code and the customer scans it (existing), OR the customer shows a code and the rider scans it (new).
--   Pickup:   the shop shows a code and the customer scans it (new), OR the customer shows their pickup code and the shop scans it (new).
-- Codes are single-use, short-lived and stored only as hashes; five wrong tries lock a code.

-- 1. The customer's own confirmation of a delivery may only use a code the RIDER made (a customer must not confirm with a code they made).
create or replace function public.customer_qr_confirm(p_order uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_a public.delivery_assignments%rowtype;
        v_q public.delivery_qr_codes%rowtype; v_s uuid; v_name text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found or v_o.customer_id <> v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app_private.lock_order_row(p_order);
  select * into v_o from public.orders where id = p_order;
  if v_o.status in ('DELIVERED', 'COMPLETED') and exists (select 1 from public.handover_evidence e
                                                          where e.order_id = p_order and e.evidence_kind = 'delivery') then
    return jsonb_build_object('ok', false, 'reason', 'already_completed');
  end if;
  if v_o.fulfilment <> 'delivery' or v_o.status not in ('ARRIVAL_DETECTED', 'AWAITING_RECIPIENT_PROOF') then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  select * into v_a from public.delivery_assignments
   where order_id = p_order and status = 'en_route' and arrival_detected_at is not null for update;
  if not found then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if v_a.rider_id = v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_q from public.delivery_qr_codes
   where order_id = p_order and assignment_id = v_a.id and created_by = v_a.rider_id
     and used_at is null and invalidated_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'qr_unavailable'); end if;
  if v_q.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'qr_expired'); end if;
  if v_q.failed_attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'qr_locked'); end if;
  if encode(extensions.digest(upper(btrim(coalesce(p_token, ''))), 'sha256'), 'hex') <> v_q.token_hash then
    update public.delivery_qr_codes set failed_attempts = failed_attempts + 1 where id = v_q.id;
    perform app_private.audit_write(v_actor, 'delivery_qr.wrong_token', 'order', p_order::text, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'wrong_qr');
  end if;
  update public.delivery_qr_codes set used_at = now() where id = v_q.id;
  select coalesce(nullif(btrim(p.display_name), ''), 'Customer') into v_name from public.profiles p where p.id = v_actor;
  if v_o.status = 'ARRIVAL_DETECTED' then
    perform app_private.step_order(p_order, 'ARRIVAL_DETECTED', 'AWAITING_RECIPIENT_PROOF', v_actor, 'recipient_scanned_qr');
  end if;
  v_s := app_private.used_proof_session(p_order, v_a.id, v_actor);
  insert into public.handover_evidence (order_id, recipient_name, signature_png, signature_sha256, completed_by, capture_method,
                                        evidence_kind, assignment_id, proof_session_id, arrival_detected_at, confirmation_channel)
    values (p_order, coalesce(v_name, 'Customer'), null, v_q.token_hash, v_actor, 'qr',
            'delivery', v_a.id, v_s, v_a.arrival_detected_at, 'qr');
  perform app_private.close_delivery(p_order, v_a, v_actor, 'qr', v_s);
  return jsonb_build_object('ok', true);
end $$;

-- 2. DELIVERY, customer shows: the order's customer opens a code (ten minutes, one live code per delivery).
create function public.customer_qr_open(p_order uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_a public.delivery_assignments%rowtype;
        v_token text; v_exp timestamptz;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found or v_o.customer_id <> v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_o.fulfilment <> 'delivery' or v_o.status not in ('ARRIVAL_DETECTED', 'AWAITING_RECIPIENT_PROOF') then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  select * into v_a from public.delivery_assignments
   where order_id = p_order and status = 'en_route' and arrival_detected_at is not null for update;
  if not found then raise exception 'invalid_transition' using errcode = '22023'; end if;
  update public.delivery_qr_codes set invalidated_at = now()
   where assignment_id = v_a.id and used_at is null and invalidated_at is null;
  v_token := upper(encode(extensions.gen_random_bytes(10), 'hex'));
  v_exp := now() + interval '10 minutes';
  insert into public.delivery_qr_codes (order_id, assignment_id, created_by, token_hash, expires_at)
    values (p_order, v_a.id, v_actor, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_exp);
  perform app_private.audit_write(v_actor, 'delivery_qr.customer_opened', 'order', p_order::text, '{}'::jsonb);
  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end $$;
revoke all on function public.customer_qr_open(uuid) from public, anon;
grant execute on function public.customer_qr_open(uuid) to authenticated;

-- 3. DELIVERY, customer shows: the assigned rider scans the customer's code and the delivery is confirmed.
create function public.rider_qr_scan(p_order uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_a public.delivery_assignments%rowtype;
        v_q public.delivery_qr_codes%rowtype; v_s uuid; v_name text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  perform app_private.lock_order_row(p_order);
  select * into v_o from public.orders where id = p_order;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_o.status in ('DELIVERED', 'COMPLETED') and exists (select 1 from public.handover_evidence e
                                                          where e.order_id = p_order and e.evidence_kind = 'delivery') then
    return jsonb_build_object('ok', false, 'reason', 'already_completed');
  end if;
  if v_o.fulfilment <> 'delivery' or v_o.status not in ('ARRIVAL_DETECTED', 'AWAITING_RECIPIENT_PROOF') then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  select * into v_a from public.delivery_assignments
   where order_id = p_order and status = 'en_route' and arrival_detected_at is not null for update;
  if not found then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if v_a.rider_id <> v_actor or v_o.customer_id = v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_q from public.delivery_qr_codes
   where order_id = p_order and assignment_id = v_a.id and created_by = v_o.customer_id
     and used_at is null and invalidated_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'qr_unavailable'); end if;
  if v_q.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'qr_expired'); end if;
  if v_q.failed_attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'qr_locked'); end if;
  if encode(extensions.digest(upper(btrim(coalesce(p_token, ''))), 'sha256'), 'hex') <> v_q.token_hash then
    update public.delivery_qr_codes set failed_attempts = failed_attempts + 1 where id = v_q.id;
    perform app_private.audit_write(v_actor, 'delivery_qr.wrong_scan', 'order', p_order::text, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'wrong_qr');
  end if;
  update public.delivery_qr_codes set used_at = now() where id = v_q.id;
  select coalesce(nullif(btrim(p.display_name), ''), 'Customer') into v_name from public.profiles p where p.id = v_o.customer_id;
  if v_o.status = 'ARRIVAL_DETECTED' then
    perform app_private.step_order(p_order, 'ARRIVAL_DETECTED', 'AWAITING_RECIPIENT_PROOF', v_actor, 'rider_scanned_customer_qr');
  end if;
  v_s := app_private.used_proof_session(p_order, v_a.id, v_actor);
  insert into public.handover_evidence (order_id, recipient_name, signature_png, signature_sha256, completed_by, capture_method,
                                        evidence_kind, assignment_id, proof_session_id, arrival_detected_at, confirmation_channel)
    values (p_order, coalesce(v_name, 'Customer'), null, v_q.token_hash, v_actor, 'qr',
            'delivery', v_a.id, v_s, v_a.arrival_detected_at, 'qr');
  perform app_private.close_delivery(p_order, v_a, v_actor, 'qr', v_s);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.rider_qr_scan(uuid, text) from public, anon;
grant execute on function public.rider_qr_scan(uuid, text) to authenticated;

-- 4. PICKUP, shop shows: codes the shop opens for a customer collecting their own order.
create table public.pickup_qr_codes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  invalidated_at timestamptz,
  failed_attempts int not null default 0,
  created_at timestamptz not null default now()
);
create unique index pickup_qr_one_live on public.pickup_qr_codes (order_id) where used_at is null and invalidated_at is null;
alter table public.pickup_qr_codes enable row level security;
revoke all on public.pickup_qr_codes from public, anon, authenticated;
grant all on public.pickup_qr_codes to service_role;

create function public.vendor_pickup_qr_open(p_order uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_token text; v_exp timestamptz;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app_private.require_vendor_actor(v_o.vendor_id);
  select * into v_o from public.orders where id = p_order for update;
  if v_o.fulfilment <> 'pickup' or v_o.status <> 'PICKUP_AWAITING_HANDOVER' then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  update public.pickup_qr_codes set invalidated_at = now() where order_id = p_order and used_at is null and invalidated_at is null;
  v_token := upper(encode(extensions.gen_random_bytes(10), 'hex'));
  v_exp := now() + interval '10 minutes';
  insert into public.pickup_qr_codes (order_id, created_by, token_hash, expires_at)
    values (p_order, v_actor, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_exp);
  perform app_private.audit_write(v_actor, 'pickup_qr.shop_opened', 'order', p_order::text, '{}'::jsonb);
  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end $$;
revoke all on function public.vendor_pickup_qr_open(uuid) from public, anon;
grant execute on function public.vendor_pickup_qr_open(uuid) to authenticated;

-- 5. PICKUP, shop shows: the order's customer scans the shop's code and the pickup is completed.
create function public.customer_pickup_qr_confirm(p_order uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_q public.pickup_qr_codes%rowtype; v_name text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found or v_o.customer_id <> v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app_private.lock_order_row(p_order);
  select * into v_o from public.orders where id = p_order;
  if v_o.status = 'COMPLETED' and exists (select 1 from public.handover_evidence e where e.order_id = p_order and e.evidence_kind = 'pickup') then
    return jsonb_build_object('ok', false, 'reason', 'already_completed');
  end if;
  if v_o.fulfilment <> 'pickup' or v_o.status <> 'PICKUP_AWAITING_HANDOVER' then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  select * into v_q from public.pickup_qr_codes where order_id = p_order and used_at is null and invalidated_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'qr_unavailable'); end if;
  if v_q.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'qr_expired'); end if;
  if v_q.failed_attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'qr_locked'); end if;
  if encode(extensions.digest(upper(btrim(coalesce(p_token, ''))), 'sha256'), 'hex') <> v_q.token_hash then
    update public.pickup_qr_codes set failed_attempts = failed_attempts + 1 where id = v_q.id;
    perform app_private.audit_write(v_actor, 'pickup_qr.wrong_token', 'order', p_order::text, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'wrong_qr');
  end if;
  update public.pickup_qr_codes set used_at = now() where id = v_q.id;
  update public.pickup_codes set used_at = now() where order_id = p_order and used_at is null;
  select coalesce(nullif(btrim(p.display_name), ''), 'Customer') into v_name from public.profiles p where p.id = v_actor;
  insert into public.handover_evidence (order_id, recipient_name, signature_png, signature_sha256, completed_by, capture_method, confirmation_channel)
    values (p_order, coalesce(v_name, 'Customer'), null, v_q.token_hash, v_actor, 'qr', 'qr');
  perform app_private.step_order(p_order, 'PICKUP_AWAITING_HANDOVER', 'COMPLETED', v_actor, 'pickup_completed:customer_scanned_qr');
  perform app_private.audit_write(v_actor, 'pickup.completed', 'order', p_order::text, jsonb_build_object('method', 'qr'));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.customer_pickup_qr_confirm(uuid, text) from public, anon;
grant execute on function public.customer_pickup_qr_confirm(uuid, text) to authenticated;

-- 6. PICKUP, customer shows: the shop scans (or types) the customer's pickup code and the pickup is completed, no signature.
create function public.complete_pickup_qr(p_order uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_c public.pickup_codes%rowtype; v_name text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app_private.require_vendor_actor(v_o.vendor_id);
  select * into v_o from public.orders where id = p_order for update;
  if v_o.fulfilment <> 'pickup' or v_o.status <> 'PICKUP_AWAITING_HANDOVER' then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  select * into v_c from public.pickup_codes where order_id = p_order for update;
  if not found or v_c.used_at is not null or v_c.expires_at <= now() or v_c.code_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'code_unavailable');
  end if;
  if v_c.failed_attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'code_locked'); end if;
  if encode(extensions.digest(upper(btrim(coalesce(p_code, ''))), 'sha256'), 'hex') <> v_c.code_hash then
    update public.pickup_codes set failed_attempts = failed_attempts + 1 where order_id = p_order;
    perform app_private.audit_write(v_actor, 'pickup.wrong_code', 'order', p_order::text, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'wrong_code', 'attempts_left', greatest(0, 4 - v_c.failed_attempts));
  end if;
  update public.pickup_codes set used_at = now() where order_id = p_order;
  update public.pickup_qr_codes set invalidated_at = now() where order_id = p_order and used_at is null and invalidated_at is null;
  select coalesce(nullif(btrim(p.display_name), ''), 'Customer') into v_name from public.profiles p where p.id = v_o.customer_id;
  insert into public.handover_evidence (order_id, recipient_name, signature_png, signature_sha256, completed_by, capture_method, confirmation_channel)
    values (p_order, coalesce(v_name, 'Customer'), null, v_c.code_hash, v_actor, 'qr', 'qr');
  perform app_private.step_order(p_order, 'PICKUP_AWAITING_HANDOVER', 'COMPLETED', v_actor, 'pickup_completed:shop_scanned_qr');
  perform app_private.audit_write(v_actor, 'pickup.completed', 'order', p_order::text, jsonb_build_object('method', 'qr'));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.complete_pickup_qr(uuid, text) from public, anon;
grant execute on function public.complete_pickup_qr(uuid, text) to authenticated;
