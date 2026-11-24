-- Checkout can be for the shops the customer picked: when the choices name shops, only those shops are quoted and ordered, and only
-- their items leave the cart (the rest stay in the cart). With no choices at all, everything behaves as before (all shops).
do $$
declare d text; n int;
  filt constant text := '(p_choices is null or p_choices = ''{}''::jsonb or p_choices ? p.vendor_id::text)';
begin
  -- create_orders
  d := pg_get_functiondef('public.create_orders(jsonb, uuid, text, boolean, text)'::regprocedure);
  if position('where ci.cart_id = v_cart.id group by p.vendor_id order by max(vn.name), p.vendor_id' in d) = 0 then raise exception 'pattern 1'; end if;
  d := replace(d, 'where ci.cart_id = v_cart.id group by p.vendor_id order by max(vn.name), p.vendor_id',
    'where ci.cart_id = v_cart.id and ' || filt || ' group by p.vendor_id order by max(vn.name), p.vendor_id');
  if position('from (select product_id, sum(quantity)::int as q from public.cart_items where cart_id = v_cart.id group by product_id) s' in d) = 0 then raise exception 'pattern 2'; end if;
  d := replace(d, 'from (select product_id, sum(quantity)::int as q from public.cart_items where cart_id = v_cart.id group by product_id) s',
    'from (select ci2.product_id, sum(ci2.quantity)::int as q from public.cart_items ci2 join public.products p on p.id = ci2.product_id where ci2.cart_id = v_cart.id and ' || filt || ' group by ci2.product_id) s');
  if position('delete from public.cart_items where cart_id = v_cart.id;' in d) = 0 then raise exception 'pattern 3'; end if;
  d := replace(d, 'delete from public.cart_items where cart_id = v_cart.id;',
    'delete from public.cart_items where cart_id = v_cart.id and product_id in (select p.id from public.products p where ' || filt || ');');
  execute d;
  -- cart_quote_multi
  d := pg_get_functiondef('public.cart_quote_multi(jsonb, uuid, boolean)'::regprocedure);
  if position('where c.user_id = v_actor group by p.vendor_id order by max(vn.name), p.vendor_id' in d) = 0 then raise exception 'pattern 4'; end if;
  d := replace(d, 'where c.user_id = v_actor group by p.vendor_id order by max(vn.name), p.vendor_id',
    'where c.user_id = v_actor and ' || filt || ' group by p.vendor_id order by max(vn.name), p.vendor_id');
  execute d;
end $$;
