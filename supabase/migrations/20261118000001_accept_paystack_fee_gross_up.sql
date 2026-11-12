-- Paystack can add its own fee on top of the order total when the account is set so the customer pays fees.
-- Accept received >= expected within a small fee allowance; the ledger records the order value only.
-- Anything lower, or far higher, is still flagged as an amount mismatch.
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
