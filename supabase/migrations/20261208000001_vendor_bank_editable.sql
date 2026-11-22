-- A shop owner may now change the payout account without asking staff. The old account's Paystack codes are returned so the
-- server can switch them off at Paystack, and they are cleared so a fresh sub-account / recipient is made for the new account.
create or replace function public.vendor_save_bank(p_vendor uuid, p_bank_code text, p_bank_name text, p_cipher text, p_last4 text, p_name text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  old public.vendor_bank_accounts%rowtype;
begin
  perform app_private.require_vendor_actor(p_vendor, true);
  select * into old from public.vendor_bank_accounts where vendor_id = p_vendor for update;
  if found then
    update public.vendor_bank_accounts set bank_code = btrim(p_bank_code), bank_name = btrim(p_bank_name),
      account_name = btrim(p_name), account_cipher = p_cipher, account_last4 = p_last4, verified_by = v_actor,
      verified_at = now(), paystack_recipient_code = null, paystack_subaccount_code = null
      where vendor_id = p_vendor;
    perform app_private.audit_write(v_actor, 'vendor.bank_changed', 'vendor', p_vendor::text,
      jsonb_build_object('from_ending', old.account_last4, 'to_ending', p_last4, 'bank', btrim(p_bank_name)));
    return jsonb_build_object('saved', true, 'replaced', true,
      'old_subaccount', old.paystack_subaccount_code, 'old_recipient', old.paystack_recipient_code);
  end if;
  insert into public.vendor_bank_accounts (vendor_id, bank_code, bank_name, account_name, account_cipher, account_last4, verified_by)
    values (p_vendor, btrim(p_bank_code), btrim(p_bank_name), btrim(p_name), p_cipher, p_last4, v_actor);
  perform app_private.audit_write(v_actor, 'vendor.bank_verified', 'vendor', p_vendor::text,
    jsonb_build_object('bank', btrim(p_bank_name), 'account_ending', p_last4));
  return jsonb_build_object('saved', true, 'replaced', false);
end $$;
