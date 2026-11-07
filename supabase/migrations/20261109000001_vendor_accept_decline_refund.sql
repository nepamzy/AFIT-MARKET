-- Shop flow made shorter, and a declined order is refunded automatically.
--  * Accepting an order now starts preparing it straight away (no separate "start" step). Orders already in ACCEPTED can
--    still be marked ready.
--  * Declining a paid order (a reason is required and shown to the customer) cancels it and queues an automatic full refund.
--    The refund is created as source 'auto', approved by the system, and moved to 'processing' in one step; the app server then
--    asks Paystack to return the money and records the outcome. Nothing here is reachable by anon or signed-in users.
-- ADDITIVE ONLY (one constraint widened, one function replaced).

-- 1. the new automatic source and the new job name ------------------------------------------------------------------
alter table public.refunds drop constraint if exists refunds_source_check;
alter table public.refunds add constraint refunds_source_check check (source in ('customer', 'finance', 'case', 'auto'));

alter table public.job_runs drop constraint if exists job_runs_job_check;
alter table public.job_runs add constraint job_runs_job_check
  check (job in ('expire-orders', 'purge-location', 'process-notifications', 'release-payouts', 'dispatch-notifications', 'settle-refunds'));
create or replace function app_private.job_expectations() returns table (job text, max_age_minutes int)
language sql immutable set search_path = ''
as $$ select * from (values ('expire-orders', 1560), ('process-notifications', 1560), ('purge-location', 1560), ('release-payouts', 1560), ('settle-refunds', 1560)) as v(job, max_age_minutes) $$;

-- 2. accept = start preparing; decline = cancel (refund is queued by the server straight after) ---------------------
create or replace function public.vendor_transition_order(p_order uuid, p_action text, p_reason text default null) returns text
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_o public.orders%rowtype; v_nonce text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app_private.require_vendor_actor(v_o.vendor_id);
  select * into v_o from public.orders where id = p_order for update;

  if p_action = 'accept' then
    perform app_private.step_order(p_order, 'PAID', 'ACCEPTED', v_actor, 'vendor_accepted');
    perform app_private.step_order(p_order, 'ACCEPTED', 'PREPARING', v_actor, 'vendor_preparing');
  elsif p_action = 'reject' then
    if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
    perform app_private.step_order(p_order, 'PAID', 'CANCELLED', v_actor, 'vendor_rejected: ' || left(btrim(p_reason), 200));
    perform app_private.release_order_stock(p_order);
  elsif p_action = 'start_preparing' then
    -- kept for older callers: accepting already starts preparing, so an order that is preparing is left as it is
    if v_o.status <> 'PREPARING' then
      perform app_private.step_order(p_order, 'ACCEPTED', 'PREPARING', v_actor, 'vendor_preparing');
    end if;
  elsif p_action = 'mark_ready' then
    if v_o.status = 'ACCEPTED' then
      perform app_private.step_order(p_order, 'ACCEPTED', 'PREPARING', v_actor, 'vendor_preparing');
    end if;
    perform app_private.step_order(p_order, 'PREPARING', 'READY', v_actor, 'vendor_ready');
    if v_o.fulfilment = 'pickup' then
      v_nonce := encode(extensions.gen_random_bytes(12), 'hex');
      insert into public.pickup_codes (order_id, nonce, code_hash, expires_at)
        values (p_order, v_nonce, null, now() + interval '48 hours');
      perform app_private.step_order(p_order, 'READY', 'PICKUP_AWAITING_HANDOVER', v_actor, 'pickup_code_issued');
    else
      perform app_private.step_order(p_order, 'READY', 'AWAITING_RIDER', v_actor, 'awaiting_rider');
    end if;
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  perform app_private.audit_write(v_actor, 'order.' || p_action, 'order', p_order::text, '{}'::jsonb);
  return (select status from public.orders where id = p_order);
end $$;

-- 3. automatic refund for a declined order (service role only) -------------------------------------------------------
-- Returns null when there is nothing to refund (already refunded, never paid). Safe to call again: an existing automatic
-- refund for the order is returned instead of a second one being made.
create function public.refund_auto_start(p_order uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_o public.orders%rowtype; v_r public.refunds%rowtype; v_actor uuid; v_balance bigint; v_id uuid; v_txn uuid; v_ref text;
begin
  if p_mode not in ('paystack_test', 'paystack_live') then raise exception 'invalid mode' using errcode = '22023'; end if;
  perform app_private.lock_order_row(p_order);
  select * into v_o from public.orders where id = p_order;
  if not found or v_o.status <> 'CANCELLED' then raise exception 'order_not_declined' using errcode = '22023'; end if;
  select actor_id into v_actor from public.order_status_history
   where order_id = p_order and to_status = 'CANCELLED' and reason like 'vendor_rejected%' order by id desc limit 1;
  if v_actor is null then raise exception 'order_not_declined' using errcode = '22023'; end if;

  select * into v_r from public.refunds where order_id = p_order and source = 'auto' and status in ('processing', 'succeeded', 'reconciliation_required') order by created_at limit 1;
  if not found then
    v_balance := app_private.order_received(p_order) - app_private.refund_active_total(p_order);
    if v_balance <= 0 then return null; end if;
    select id, reference into v_txn, v_ref from public.payment_transactions where order_id = p_order and status = 'succeeded' order by created_at limit 1;
    if v_txn is null then return null; end if;
    insert into public.refunds (order_id, transaction_id, amount_kobo, reason, requested_by, source, status, decided_at, decision_reason,
                                provider_mode, executed_at)
      values (p_order, v_txn, v_balance, 'The shop declined the order', v_actor, 'auto', 'requested', null, null, 'none', null)
      returning * into v_r;
    update public.refunds set status = 'approved', decided_at = now(), decision_reason = 'Automatic: the shop declined the order' where id = v_r.id;
    update public.refunds set status = 'processing', provider_mode = p_mode, executed_at = now() where id = v_r.id returning * into v_r;
    perform app_private.refund_log(v_r.id, null, 'auto_started', 'requested', 'processing', 'shop declined the order');
    perform app_private.audit_write(null, 'refund.auto_started', 'order', p_order::text, jsonb_build_object('refund', v_r.id, 'amount_kobo', v_r.amount_kobo));
  end if;
  select reference into v_ref from public.payment_transactions where id = v_r.transaction_id;
  return jsonb_build_object('id', v_r.id, 'status', v_r.status, 'amount_kobo', v_r.amount_kobo, 'reference', v_ref,
                            'provider_ref', v_r.provider_refund_ref, 'mode', v_r.provider_mode);
end $$;

-- 4. helpers for the app server (service role only) -------------------------------------------------------------------
create function public.refund_set_provider_ref(p_refund uuid, p_ref text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_ref is null or char_length(btrim(p_ref)) < 3 then raise exception 'provider_reference_required' using errcode = '22023'; end if;
  update public.refunds set provider_refund_ref = btrim(p_ref)
   where id = p_refund and status in ('processing', 'reconciliation_required') and provider_refund_ref is null;
end $$;

-- the refund a Paystack "refund" event is about: matched by the payment reference and amount
create function public.refund_find_processing(p_reference text, p_amount bigint) returns uuid
language sql security definer set search_path = ''
as $$
  select r.id from public.refunds r join public.payment_transactions t on t.id = r.transaction_id
   where t.reference = p_reference and r.status in ('processing', 'reconciliation_required')
     and (p_amount is null or r.amount_kobo = p_amount)
   order by r.created_at limit 1
$$;

-- automatic refunds that have not finished (for the daily retry), oldest first
create function public.refund_auto_unfinished(p_limit int default 20) returns jsonb
language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'order_id', x.order_id, 'amount_kobo', x.amount_kobo,
           'reference', x.reference, 'provider_ref', x.provider_refund_ref, 'mode', x.provider_mode) order by x.created_at), '[]'::jsonb)
  from (select r.id, r.order_id, r.amount_kobo, r.created_at, r.provider_refund_ref, r.provider_mode, t.reference
          from public.refunds r join public.payment_transactions t on t.id = r.transaction_id
         where r.source = 'auto' and r.status in ('processing', 'reconciliation_required') and r.executed_at < now() - interval '2 minutes'
         order by r.created_at limit least(greatest(coalesce(p_limit, 20), 1), 50)) x
$$;

-- declined orders whose refund was never even started (e.g. the server stopped right after the decline)
create function public.refund_auto_missing(p_limit int default 20) returns jsonb
language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.id), '[]'::jsonb) from (
    select o.id from public.orders o
     where o.status = 'CANCELLED'
       and exists (select 1 from public.order_status_history h where h.order_id = o.id and h.to_status = 'CANCELLED' and h.reason like 'vendor_rejected%')
       and app_private.order_received(o.id) - app_private.refund_active_total(o.id) > 0
       and not exists (select 1 from public.refunds r where r.order_id = o.id and r.source = 'auto')
     order by o.updated_at limit least(greatest(coalesce(p_limit, 20), 1), 50)) x
$$;

revoke all on function public.refund_auto_start(uuid, text), public.refund_set_provider_ref(uuid, text),
  public.refund_find_processing(text, bigint), public.refund_auto_unfinished(int), public.refund_auto_missing(int)
  from public, anon, authenticated;
grant execute on function public.refund_auto_start(uuid, text), public.refund_set_provider_ref(uuid, text),
  public.refund_find_processing(text, bigint), public.refund_auto_unfinished(int), public.refund_auto_missing(int) to service_role;
