-- Refunds are no longer offered. A customer can still REPORT a problem, but a report never leads to a refund.
-- The only money that goes back is the automatic return for an order the shop declined or did not answer in time (the customer
-- never received anything): that path creates its refund with source 'auto', which stays allowed.
-- Everything else that would create a refund request (a customer's request, a staff request, a report decision) is refused here, at
-- the one place every refund is created.
create function app_private.refunds_only_automatic() returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- the switch exists only so the database's own tests can still exercise the old refund machinery; nothing in the app sets it
  if new.source is distinct from 'auto' and coalesce(current_setting('afit.allow_manual_refunds', true), '') <> 'on' then
    raise exception 'refunds_not_available' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function app_private.refunds_only_automatic() from public, anon, authenticated;
create trigger refunds_only_automatic before insert on public.refunds
  for each row execute function app_private.refunds_only_automatic();

revoke execute on function public.customer_request_refund(uuid, jsonb, text, text) from authenticated;
revoke execute on function public.refund_request(uuid, bigint, text) from authenticated;
