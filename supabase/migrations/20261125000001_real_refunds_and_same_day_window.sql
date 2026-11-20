-- 1. Real refunds from the admin screen.
-- Executing an approved refund may now use Paystack (test or live) as well as the local fake provider. The function also hands back the
-- payment reference so the server can ask Paystack to return exactly this refund's amount to the customer's original payment.
create or replace function public.refund_begin_execution(p_refund uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := app_private.require_finance(); v_r public.refunds%rowtype; v_ref text;
begin
  if p_mode is null or p_mode not in ('fake', 'paystack_test', 'paystack_live') then raise exception 'provider_not_enabled' using errcode = '42501'; end if;
  select * into v_r from public.refunds where id = p_refund for update;
  if not found then raise exception 'unknown refund' using errcode = 'P0002'; end if;
  if v_r.requested_by = v_actor then raise exception 'cannot execute your own request' using errcode = '42501'; end if;
  if v_r.status <> 'approved' then raise exception 'refund_invalid_transition' using errcode = '22023'; end if;
  select reference into v_ref from public.payment_transactions where id = v_r.transaction_id;
  update public.refunds set status = 'processing', provider_mode = p_mode, executed_by = v_actor, executed_at = now() where id = p_refund;
  perform app_private.refund_log(p_refund, v_actor, 'execution_started', 'approved', 'processing',
    'mode: ' || p_mode || case when p_mode = 'fake' then ' (no real money moves)' else '' end);
  return jsonb_build_object('id', p_refund, 'amount_kobo', v_r.amount_kobo, 'mode', p_mode, 'reference', v_ref);
end $$;

-- 2. The customer's window to report a problem now ends at the end of the day (Nigeria time) on which the order was completed.
-- The shop is paid when the window closes. An open complaint or refund still holds the payout, as before.
create function app_private.report_window_end(p_from timestamptz) returns timestamptz
language sql immutable set search_path = ''
as $$ select (date_trunc('day', p_from at time zone 'Africa/Lagos') + interval '1 day') at time zone 'Africa/Lagos' $$;
revoke all on function app_private.report_window_end(timestamptz) from public, anon, authenticated;

create or replace function public.report_window_end(p_order uuid) returns timestamptz
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_done timestamptz;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.orders where id = p_order and customer_id = v_actor) then return null; end if;
  select min(created_at) into v_done from public.order_status_history where order_id = p_order and to_status = 'COMPLETED';
  if v_done is null then return null; end if;
  return app_private.report_window_end(v_done);
end $$;
revoke all on function public.report_window_end(uuid) from public, anon;
grant execute on function public.report_window_end(uuid) to authenticated;

create or replace function app_private.schedule_payout() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare l public.order_settlement_lines%rowtype;
begin
  if new.to_status <> 'COMPLETED' then return new; end if;
  select * into l from public.order_settlement_lines where order_id = new.order_id;
  if not found then return new; end if;
  insert into public.vendor_payouts (vendor_id, order_id, line_id, eligible_at)
    values (l.vendor_id, l.order_id, l.id, app_private.report_window_end(now()))
    on conflict (order_id) do nothing;
  return new;
end $$;
