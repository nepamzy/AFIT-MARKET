-- If Paystack refuses the shop split, the payment is started without it; the shares are cleared so those orders are paid to the shop by transfer.
create function public.payment_group_clear_split(p_reference text) returns void
language sql security definer set search_path = ''
as $$
  update public.payment_group_orders set vendor_share_kobo = null
   where group_id = (select id from public.payment_groups where reference = p_reference and status = 'initialized')
$$;
revoke all on function public.payment_group_clear_split(text) from public, anon, authenticated;
grant execute on function public.payment_group_clear_split(text) to service_role;
