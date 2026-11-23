-- Why Paystack refused the shop split for a payment (kept so the reason can be read without server logs).
alter table public.payment_groups add column if not exists split_error text;
