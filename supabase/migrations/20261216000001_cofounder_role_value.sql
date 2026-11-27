-- A role for the co-founder: a limited dashboard (shop pipeline, first-review approvals with a name tag, his own statement).
alter type public.app_role add value if not exists 'cofounder';
