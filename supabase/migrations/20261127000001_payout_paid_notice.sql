-- When a payout is marked paid, the shop's owner and staff are told: a notification in the app (and a phone alert, through the same
-- notification pipeline as every other message). Everything else in payout_mark is unchanged.
create or replace function public.payout_mark(p_reference text, p_status text, p_code text, p_error text) returns text
language plpgsql security definer set search_path = ''
as $$
declare r public.vendor_payouts%rowtype; v_no text;
begin
  if p_status not in ('paid', 'failed', 'processing') then raise exception 'invalid status' using errcode = '22023'; end if;
  select * into r from public.vendor_payouts where reference = p_reference for update;
  if not found then return 'unknown'; end if;
  if r.status = 'paid' and not (p_status = 'failed' and p_error = 'reversed') then return 'unchanged'; end if;
  update public.vendor_payouts set
      status = p_status,
      transfer_code = coalesce(nullif(left(p_code, 60), ''), transfer_code),
      last_error = case when p_status = 'paid' then null else nullif(left(p_error, 300), '') end,
      paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else null end,
      updated_at = now()
    where id = r.id;
  perform app_private.audit_write(null, 'payout.' || p_status, 'vendor_payout', r.id::text,
    jsonb_build_object('vendor_id', r.vendor_id, 'order_id', r.order_id, 'amount_kobo', r.amount_kobo, 'attempt', r.attempts));
  if p_status = 'paid' and r.status <> 'paid' then
    select order_number into v_no from public.orders where id = r.order_id;
    begin
      perform app_private.notify_vendor_members(r.vendor_id, 'You have been paid',
        'N' || to_char(r.amount_kobo / 100.0, 'FM999G999G990D00') || ' for order ' || coalesce(v_no, '') || ' has been sent to your bank account.',
        '/vendor/earnings', 'payout:' || r.id::text);
    exception when others then
      -- a message that cannot be queued never undoes a payment record
      null;
    end;
  end if;
  return p_status;
end $$;
revoke all on function public.payout_mark(text, text, text, text) from public, anon, authenticated;
grant execute on function public.payout_mark(text, text, text, text) to service_role;
