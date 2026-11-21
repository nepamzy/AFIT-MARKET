-- Pay each shop through its own Paystack sub-account (switched off until the owner turns it on in Admin, Settings).
-- When on: a payment is split by Paystack, each shop's own sub-account gets its share (product value after discount, less AFIT's
-- commission), and the main account keeps the commission and the Paystack charge the customer paid. Orders paid that way are
-- recorded as already paid to the shop, so no payout transfer is sent for them.
alter table public.vendor_bank_accounts add column paystack_subaccount_code text
  check (paystack_subaccount_code is null or paystack_subaccount_code ~ '^ACCT_[A-Za-z0-9]{6,40}$');
alter table public.payment_group_orders add column vendor_share_kobo bigint check (vendor_share_kobo is null or vendor_share_kobo >= 0);

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
    ('pay_on_delivery_max_kobo', 'int', 100000, 20000000, null),
    ('ordering_open', 'bool', null, null, null),
    ('payment_split_enabled', 'bool', null, null, null)
  ) as r(key, kind, lo, hi, choices) where r.key = p_key
$$;

insert into public.platform_settings (key, value, note) values
  ('payment_split_enabled', 'false'::jsonb, 'Pay each shop through its own Paystack sub-account: the shop is paid by Paystack on its normal settlement schedule and AFIT keeps only its commission. Turn on only when the Paystack account is ready for sub-accounts.')
on conflict (key) do nothing;

create function public.payout_set_subaccount(p_vendor uuid, p_code text) returns void
language sql security definer set search_path = ''
as $$ update public.vendor_bank_accounts set paystack_subaccount_code = p_code where vendor_id = p_vendor $$;
revoke all on function public.payout_set_subaccount(uuid, text) from public, anon, authenticated;
grant execute on function public.payout_set_subaccount(uuid, text) to service_role;

create or replace function app_private.payment_group_for(p_customer uuid, p_orders uuid[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_items bigint; v_charge bigint; v_g public.payment_groups%rowtype; v_ref text; v_first text; v_split boolean; v_bps bigint; v_shares jsonb;
begin
  select coalesce(sum(o.total_kobo), 0), min(o.order_number) into v_items, v_first from public.orders o where o.id = any (p_orders);
  if v_items <= 0 then raise exception 'order_not_payable' using errcode = '22023'; end if;
  v_charge := app_private.paystack_charge(v_items);
  v_split := coalesce((select (s.value #>> '{}') = 'true' from public.platform_settings s where s.key = 'payment_split_enabled'), false);
  v_bps := app_private.setting_int('vendor_commission_bps', 450);
  -- always a fresh reference: Paystack refuses to start the same reference twice
  v_ref := 'AFG-' || encode(extensions.gen_random_bytes(6), 'hex');
  insert into public.payment_groups (customer_id, reference, items_kobo, fee_kobo, amount_kobo)
    values (p_customer, v_ref, v_items, v_charge, v_items + v_charge) returning * into v_g;
  -- When "pay each shop through its own Paystack sub-account" is on, each order that has a shop sub-account carries the shop's
  -- share: the product value after any discount, less AFIT's commission (the same sum the settlement uses).
  insert into public.payment_group_orders (group_id, order_id, amount_kobo, vendor_share_kobo)
    select v_g.id, o.id, o.total_kobo,
           case when v_split and b.paystack_subaccount_code is not null
                then greatest((o.items_total_kobo - o.discount_kobo) - app_private.round_bps(o.items_total_kobo - o.discount_kobo, v_bps), 0)
           end
      from public.orders o left join public.vendor_bank_accounts b on b.vendor_id = o.vendor_id
     where o.id = any (p_orders);
  select coalesce(jsonb_agg(jsonb_build_object('subaccount', t.code, 'share_kobo', t.share)), '[]'::jsonb) into v_shares
    from (select b.paystack_subaccount_code as code, sum(pgo.vendor_share_kobo)::bigint as share
            from public.payment_group_orders pgo join public.orders o on o.id = pgo.order_id
            join public.vendor_bank_accounts b on b.vendor_id = o.vendor_id
           where pgo.group_id = v_g.id and pgo.vendor_share_kobo is not null and pgo.vendor_share_kobo > 0
           group by b.paystack_subaccount_code) t;
  return jsonb_build_object('reference', v_g.reference, 'amount_kobo', v_g.amount_kobo, 'items_kobo', v_g.items_kobo, 'fee_kobo', v_g.fee_kobo,
    'currency', v_g.currency, 'order_number', v_first, 'order_count', coalesce(array_length(p_orders, 1), 0), 'access_code', v_g.access_code, 'split_shares', v_shares);
end $$;
create or replace function app_private.schedule_payout() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare l public.order_settlement_lines%rowtype; v_share bigint;
begin
  if new.to_status <> 'COMPLETED' then return new; end if;
  select * into l from public.order_settlement_lines where order_id = new.order_id;
  if not found then return new; end if;
  -- an order that was paid through the shop's own Paystack sub-account has already been paid to the shop by Paystack
  select pgo.vendor_share_kobo into v_share
    from public.payment_group_orders pgo join public.payment_groups pg on pg.id = pgo.group_id
   where pgo.order_id = new.order_id and pg.status = 'succeeded' and pgo.vendor_share_kobo is not null
   order by pg.succeeded_at nulls last limit 1;
  if v_share is not null then
    insert into public.vendor_payouts (vendor_id, order_id, line_id, status, eligible_at, amount_kobo, transfer_code, paid_at)
      values (l.vendor_id, l.order_id, l.id, 'paid', now(), v_share, 'paystack_split', now())
      on conflict (order_id) do nothing;
    return new;
  end if;
  insert into public.vendor_payouts (vendor_id, order_id, line_id, eligible_at)
    values (l.vendor_id, l.order_id, l.id, now() + make_interval(hours => app_private.setting_int('payout_hold_hours', 24)::int))
    on conflict (order_id) do nothing;
  return new;
end $$;
