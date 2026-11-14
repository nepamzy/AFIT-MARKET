-- Pay on delivery: the customer places the order, the shop accepts it, and the customer pays with Paystack when they see
-- the order (the rider has arrived, or they are collecting it at the shop). The hand-over cannot finish until the payment
-- has succeeded, and the shop is paid out only after the order is completed, as for every other order.

alter table public.orders add column payment_timing text not null default 'now' check (payment_timing in ('now', 'on_delivery'));

insert into public.platform_settings (key, value, note) values
  ('pay_on_delivery_enabled', 'true'::jsonb, 'Customers may choose to pay when they receive their order.'),
  ('pay_on_delivery_max_kobo', '2000000'::jsonb, 'Largest order (in kobo) that can be paid on delivery. 2000000 is 20,000 naira.')
on conflict (key) do nothing;

create or replace function app_private.setting_rule(p_key text) returns table (kind text, lo bigint, hi bigint, choices text[])
language sql immutable set search_path = ''
as $$
  select r.kind, r.lo, r.hi, r.choices from (values
    ('delivery_fee_kobo', 'int', 0::bigint, 1000000::bigint, null::text[]),
    ('platform_fee_bps', 'int', 0, 0, null),
    ('vendor_commission_bps', 'int', 0, 2000, null),
    ('commission_afit_bps', 'int', 0, 2000, null),
    ('unpaid_order_expiry_minutes', 'int', 5, 1440, null),
    ('max_cart_item_quantity', 'int', 1, 100, null),
    ('handover_token_ttl_minutes', 'int', 5, 720, null),
    ('location_max_accuracy_m', 'int', 5, 500, null),
    ('location_max_age_seconds', 'int', 5, 600, null),
    ('location_min_interval_seconds', 'int', 1, 60, null),
    ('location_stale_after_seconds', 'int', 10, 600, null),
    ('arrival_max_accuracy_m', 'int', 5, 200, null),
    ('arrival_max_age_seconds', 'int', 5, 120, null),
    ('default_geofence_radius_m', 'int', 10, 500, null),
    ('location_history_retention_hours', 'int', 1, 720, null),
    ('delivery_proof_ttl_minutes', 'int', 5, 120, null),
    ('refund_support_approval_limit_kobo', 'int', 0, 100000000, null),
    ('typed_signature_enabled', 'bool', null, null, null),
    ('refund_fee_policy', 'enum', null, null, array['none', 'proportional_service_fee']),
    ('return_policy', 'return_policy', null, null, null),
    ('settlement_policy', 'locked', null, null, null),
    ('mock_payments_enabled', 'locked', null, null, null),
    ('rider_terms_current_version', 'locked', null, null, null),
    ('delivery_fee_collection_mode', 'enum', null, null, array['paystack', 'direct_to_rider']),
    ('location_send_interval_seconds', 'int', 5, 300, null),
    ('payout_hold_hours', 'int', 1, 720, null),
    ('vendor_response_hours', 'int', 15, 20, null),
    ('pay_on_delivery_enabled', 'bool', null, null, null),
    ('pay_on_delivery_max_kobo', 'int', 100000, 20000000, null)
  ) as r(key, kind, lo, hi, choices) where r.key = p_key
$$;

-- The moments when someone is holding their order and can pay for it.
create function app_private.pay_at_door_window(p_status text) returns boolean
language sql immutable set search_path = ''
as $$ select p_status in ('ARRIVAL_DETECTED', 'AWAITING_RECIPIENT_PROOF', 'PICKUP_AWAITING_HANDOVER') $$;
revoke all on function app_private.pay_at_door_window(text) from public, anon, authenticated;

-- Every move of an order goes through here: an order that is paid on delivery cannot be delivered or completed until a
-- payment for it has succeeded.
create or replace function app_private.step_order(p_order uuid, p_from text, p_to text, p_actor uuid, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_to in ('DELIVERED', 'COMPLETED')
     and exists (select 1 from public.orders o where o.id = p_order and o.payment_timing = 'on_delivery')
     and not exists (select 1 from public.payment_transactions t where t.order_id = p_order and t.status = 'succeeded') then
    raise exception 'payment_due' using errcode = '22023';
  end if;
  update public.orders set status = p_to where id = p_order and status = p_from;
  if not found then raise exception 'invalid_transition' using errcode = '22023'; end if;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, reason)
    values (p_order, p_from, p_to, p_actor, p_reason);
end $$;

-- The customer chooses to pay when the order arrives. Same checks as paying now, plus a size limit and a limit on unpaid orders.
create function public.customer_choose_pay_on_delivery(p_order uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_open int;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found or v_o.customer_id <> v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_o.status <> 'PENDING_PAYMENT' or v_o.expires_at <= now() then raise exception 'order_not_payable' using errcode = '22023'; end if;
  if coalesce((select (s.value #>> '{}') = 'true' from public.platform_settings s where s.key = 'pay_on_delivery_enabled'), false) is not true then
    raise exception 'pay_on_delivery_off' using errcode = '22023';
  end if;
  if v_o.total_kobo > app_private.setting_int('pay_on_delivery_max_kobo', 2000000) then
    raise exception 'pay_on_delivery_too_large' using errcode = '22023';
  end if;
  select count(*) into v_open from public.orders x
   where x.customer_id = v_actor and x.payment_timing = 'on_delivery' and x.id <> p_order
     and x.status not in ('COMPLETED', 'CANCELLED', 'PENDING_PAYMENT')
     and not exists (select 1 from public.payment_transactions t where t.order_id = x.id and t.status = 'succeeded');
  if v_open >= 2 then raise exception 'too_many_unpaid' using errcode = '22023'; end if;
  update public.orders set payment_timing = 'on_delivery' where id = p_order;
  perform app_private.step_order(p_order, 'PENDING_PAYMENT', 'PAID', v_actor, 'pay_on_delivery');
  perform app_private.audit_write(v_actor, 'order.pay_on_delivery', 'order', p_order::text, jsonb_build_object('total_kobo', v_o.total_kobo));
end $$;
revoke all on function public.customer_choose_pay_on_delivery(uuid) from public, anon;
grant execute on function public.customer_choose_pay_on_delivery(uuid) to authenticated;

-- What the people at the hand-over need to know: is this order paid at the door, and has it been paid yet?
create function public.order_payment_view(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found then return null; end if;
  if v_o.customer_id <> v_actor
     and not exists (select 1 from public.vendor_staff vs where vs.vendor_id = v_o.vendor_id and vs.user_id = v_actor)
     and not exists (select 1 from public.delivery_assignments d where d.order_id = p_order and d.rider_id = v_actor
                      and d.status in ('accepted', 'picked_up', 'en_route')) then
    return null;
  end if;
  return jsonb_build_object('pay_at_door', v_o.payment_timing = 'on_delivery',
    'paid', exists (select 1 from public.payment_transactions t where t.order_id = p_order and t.status = 'succeeded'),
    'amount_kobo', v_o.total_kobo, 'can_pay_now', app_private.pay_at_door_window(v_o.status));
end $$;
revoke all on function public.order_payment_view(uuid) from public, anon;
grant execute on function public.order_payment_view(uuid) to authenticated;

-- The payment can start at the door for an order that is paid on delivery.
create or replace function public.payment_prepare(p_order uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_t public.payment_transactions%rowtype;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.is_aal2() then raise exception 'MFA (aal2) required' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found or v_o.customer_id <> v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_o.payment_timing = 'on_delivery' then
    if not app_private.pay_at_door_window(v_o.status)
       or exists (select 1 from public.payment_transactions t where t.order_id = p_order and t.status = 'succeeded') then
      raise exception 'order_not_payable' using errcode = '22023';
    end if;
  elsif v_o.status <> 'PENDING_PAYMENT' or v_o.expires_at <= now() then
    raise exception 'order_not_payable' using errcode = '22023';
  end if;
  select * into v_t from public.payment_transactions where order_id = p_order and status = 'initialized' order by created_at desc limit 1;
  if not found then
    insert into public.payment_transactions (order_id, reference, amount_kobo)
      values (p_order, v_o.order_number || '-' || encode(extensions.gen_random_bytes(6), 'hex'), v_o.total_kobo)
      returning * into v_t;
  end if;
  return jsonb_build_object('reference', v_t.reference, 'amount_kobo', v_t.amount_kobo, 'currency', v_t.currency,
                            'order_number', v_o.order_number, 'access_code', v_t.access_code);
end $$;

-- A payment that succeeds at the door is recorded without moving the order (it was accepted long before).
create or replace function public.payment_apply_event(p_event_id text, p_event_type text, p_reference text, p_amount bigint,
                                           p_currency text, p_payload jsonb) returns text
language plpgsql security definer set search_path = ''
as $$
declare v_t public.payment_transactions%rowtype; v_o public.orders%rowtype; v_outcome text; v_other int;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200 then
    raise exception 'invalid event id' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payevt:' || p_event_id, 0));
  if exists (select 1 from public.payment_events where provider_event_id = p_event_id) then return 'duplicate_event'; end if;

  select * into v_t from public.payment_transactions where reference = p_reference for update;
  if not found then
    v_outcome := 'unknown_reference';
    insert into public.reconciliation_flags (reason, details)
      values ('unknown_reference', jsonb_build_object('reference', left(coalesce(p_reference, ''), 100), 'event', p_event_type));
  elsif p_event_type = 'charge.success' then
    if v_t.status = 'succeeded' then
      v_outcome := 'already_succeeded';
    elsif p_amount is null or p_amount < v_t.amount_kobo or p_amount > v_t.amount_kobo + least(v_t.amount_kobo * 2 / 100 + 10000, 300000) or p_currency is distinct from v_t.currency then
      update public.payment_transactions set status = 'mismatch' where id = v_t.id;
      insert into public.reconciliation_flags (order_id, transaction_id, reason, details)
        values (v_t.order_id, v_t.id, 'amount_mismatch',
                jsonb_build_object('expected_kobo', v_t.amount_kobo, 'received_kobo', p_amount, 'currency', p_currency));
      v_outcome := 'amount_mismatch';
    else
      update public.payment_transactions set status = 'succeeded', succeeded_at = now() where id = v_t.id;
      insert into public.ledger_entries (order_id, transaction_id, entry_type, amount_kobo)
        values (v_t.order_id, v_t.id, 'payment_received', v_t.amount_kobo);
      select * into v_o from public.orders where id = v_t.order_id for update;
      if v_o.status = 'PENDING_PAYMENT' then
        update public.orders set status = 'PAID' where id = v_o.id;
        insert into public.order_status_history (order_id, from_status, to_status, actor_id, reason)
          values (v_o.id, 'PENDING_PAYMENT', 'PAID', null, 'paystack_payment');
        v_outcome := 'paid';
      elsif v_o.payment_timing = 'on_delivery' and v_o.status <> 'CANCELLED'
            and not exists (select 1 from public.payment_transactions t where t.order_id = v_o.id and t.status = 'succeeded' and t.id <> v_t.id) then
        -- paid at the door: the order was already accepted, so only the money is recorded (the hand-over can now finish)
        v_outcome := 'paid';
      elsif v_o.status = 'CANCELLED' then
        insert into public.reconciliation_flags (order_id, transaction_id, reason, details)
          values (v_o.id, v_t.id, 'late_payment', jsonb_build_object('amount_kobo', v_t.amount_kobo, 'note', 'order was cancelled or expired; refund required'));
        v_outcome := 'late_payment';
      else
        select count(*) into v_other from public.payment_transactions where order_id = v_o.id and status = 'succeeded' and id <> v_t.id;
        insert into public.reconciliation_flags (order_id, transaction_id, reason, details)
          values (v_o.id, v_t.id, 'duplicate_payment', jsonb_build_object('amount_kobo', v_t.amount_kobo, 'other_successes', v_other));
        v_outcome := 'duplicate_payment';
      end if;
    end if;
  elsif p_event_type = 'charge.failed' then
    if v_t.status = 'initialized' then
      update public.payment_transactions set status = 'failed' where id = v_t.id;
      v_outcome := 'failed';
    else
      v_outcome := 'ignored_out_of_order';
    end if;
  else
    v_outcome := 'ignored_event_type';
  end if;

  insert into public.payment_events (provider_event_id, event_type, reference, payload, outcome)
    values (p_event_id, left(coalesce(p_event_type, ''), 100), left(p_reference, 100), coalesce(p_payload, '{}'::jsonb), v_outcome);
  if v_outcome in ('paid', 'late_payment', 'amount_mismatch', 'duplicate_payment') then
    perform app_private.audit_write(null, 'payment.' || v_outcome, 'order', v_t.order_id::text, jsonb_build_object('reference', v_t.reference));
  end if;
  return v_outcome;
end $$;

-- The shop and the customer are told the order was placed to be paid on delivery (not "paid").
create or replace function app_private.notify_order_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare o public.orders%rowtype; v_title text; v_body text; v_key text;
begin
  select * into o from public.orders where id = new.order_id;
  if not found then return new; end if;
  v_key := 'order:' || new.id::text;
  if new.to_status = 'PAID' and new.reason = 'pay_on_delivery' then
    perform app_private.notify(o.customer_id, 'order', 'Order placed', 'The shop will review your order. You pay when you receive it.', '/orders/' || o.id, v_key);
    perform app_private.notify_vendor_members(o.vendor_id, 'New order', 'A new order is waiting for you. The customer pays when they receive it.', '/vendor/orders', v_key);
    return new;
  end if;
  if new.to_status = 'PAID' then
    perform app_private.notify(o.customer_id, 'order', 'Order received', 'Your payment was received. The shop will review your order.', '/orders/' || o.id, v_key);
    perform app_private.notify_vendor_members(o.vendor_id, 'New order', 'A new paid order is waiting for you.', '/vendor/orders', v_key);
    return new;
  end if;
  if new.to_status = 'EN_ROUTE' and exists (select 1 from public.order_status_history h
                                             where h.order_id = new.order_id and h.to_status = 'PICKED_UP_BY_RIDER') then
    return new;
  end if;
  v_title := case new.to_status
    when 'ACCEPTED' then 'Order accepted'
    when 'CANCELLED' then 'Order cancelled'
    when 'PICKUP_AWAITING_HANDOVER' then 'Ready for pickup'
    when 'RIDER_ASSIGNED' then 'Rider assigned'
    when 'PICKED_UP_BY_RIDER' then 'Your rider is on the move'
    when 'EN_ROUTE' then 'On its way'
    when 'ARRIVAL_DETECTED' then 'Your rider has arrived'
    when 'COMPLETED' then 'Order complete'
    when 'DISPUTED' then 'Order under review'
    when 'RETURN_REQUESTED' then 'Return update'
    when 'RETURN_IN_PROGRESS' then 'Return update'
    when 'RETURNED_TO_VENDOR' then 'Return update'
    else null end;
  if v_title is null then return new; end if;
  v_body := case new.to_status
    when 'PICKED_UP_BY_RIDER' then 'Your rider has your order. Open it to follow the rider on the map.'
    when 'ARRIVAL_DETECTED' then case when o.payment_timing = 'on_delivery'
      then 'Your rider is here. Open your order to pay, then confirm that you received it.'
      else 'Open your order to confirm that you received it.' end
    when 'CANCELLED' then 'Your order was cancelled. Open it to see what happens next.'
    when 'PICKUP_AWAITING_HANDOVER' then case when o.payment_timing = 'on_delivery'
      then 'Your order is ready. Open it to pay and see your pickup details.'
      else 'Your order is ready. Open it to see your pickup details.' end
    else 'Open your order to see the latest status.' end;
  perform app_private.notify(o.customer_id, 'order', v_title, v_body, '/orders/' || o.id, v_key);
  return new;
exception when others then
  insert into public.notification_errors (event_key, error) values (left(v_key, 120), left(sqlerrm, 300));
  return new;
end $$;
