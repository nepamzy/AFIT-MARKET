-- A private letter written for one person. Only the signed-in owner of the recipient email address can read it, and only
-- once that address is CONFIRMED (sign-up already requires email confirmation, so nobody can claim an address they do not own).
-- The table is locked: no API role can read or write it. It is read only through the two functions below, which look up the
-- caller's own confirmed email themselves and never take an email or an id from the browser.

create table public.private_letters (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null unique
    check (recipient_email = lower(recipient_email) and char_length(recipient_email) between 5 and 254),
  sender_label text not null default 'Bestie' check (char_length(sender_label) between 1 and 60),
  title text check (title is null or char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  first_opened_at timestamptz
);
alter table public.private_letters enable row level security;
revoke all on public.private_letters from public, anon, authenticated;
grant all on public.private_letters to service_role;

-- True when a letter is waiting for the signed-in person (used only to decide whether to show the tab).
create function public.my_letter_exists() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.private_letters l
      join auth.users u on lower(u.email) = l.recipient_email
     where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  )
$$;

-- The letter for the signed-in person, or null. Records when it was first opened.
create function public.my_letter() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (select auth.uid());
  v_row public.private_letters;
begin
  if v_id is null then return null; end if;
  select l.* into v_row
    from public.private_letters l
    join auth.users u on lower(u.email) = l.recipient_email
   where u.id = v_id and u.email_confirmed_at is not null;
  if not found then return null; end if;
  update public.private_letters set first_opened_at = coalesce(first_opened_at, now()) where id = v_row.id;
  return jsonb_build_object('sender', v_row.sender_label, 'title', v_row.title, 'body', v_row.body, 'created_at', v_row.created_at);
end $$;

revoke all on function public.my_letter_exists() from public, anon;
revoke all on function public.my_letter() from public, anon;
grant execute on function public.my_letter_exists() to authenticated;
grant execute on function public.my_letter() to authenticated;
