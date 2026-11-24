-- A shop waiting for approval can already add its riders: the rider-side functions accept a pending shop's code too.
do $mig$
declare f regprocedure; v_def text; v_new text;
begin
  foreach f in array array['public.rider_code_check(text)'::regprocedure, 'public.rider_join_with_code(uuid,text,text,text)'::regprocedure, 'public.rider_claim_code(uuid,text)'::regprocedure]
  loop
    v_def := pg_get_functiondef(f);
    v_new := replace(v_def, $a$v.status = 'approved'$a$, $b$v.status in ('approved', 'pending')$b$);
    if v_new = v_def then raise exception 'no change for %', f; end if;
    execute v_new;
  end loop;
end $mig$;
