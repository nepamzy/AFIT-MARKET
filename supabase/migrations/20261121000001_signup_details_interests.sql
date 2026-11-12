-- Sign-up details (full name, phone number, date of birth) and what a new person would like to shop (reference only).
-- Both tables are private: written by the server at sign-up, read by the owner of the account. No role or price depends on them.

create table public.profile_details (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  phone_cipher text not null, -- encrypted by the server, like the rider phone number
  date_of_birth date not null check (date_of_birth >= date '1900-01-01'), -- the 18-or-older rule is checked by the server against today's date
  created_at timestamptz not null default now()
);
alter table public.profile_details enable row level security;
revoke all on public.profile_details from public, anon, authenticated;
grant select on public.profile_details to authenticated;
grant all on public.profile_details to service_role;
create policy profile_details_own on public.profile_details for select to authenticated using (user_id = (select auth.uid()));

-- Interests point at the live category list (never a fixed list in the code): a category added or renamed later just works.
create table public.user_interests (
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, category_id)
);
alter table public.user_interests enable row level security;
revoke all on public.user_interests from public, anon, authenticated;
grant select on public.user_interests to authenticated;
grant all on public.user_interests to service_role;
create policy user_interests_own on public.user_interests for select to authenticated using (user_id = (select auth.uid()));

-- Erasing an account also removes these (same hook as the signature and the ID details).
create or replace function app_private.erase_identity_data() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.user_signatures where user_id = new.user_id;
  delete from public.account_identity where user_id = new.user_id;
  delete from public.profile_details where user_id = new.user_id;
  delete from public.user_interests where user_id = new.user_id;
  return new;
end $$;
