-- Search that understands people: every word must be found somewhere sensible (item name, description, menu section, shop name,
-- the shop's categories), "food" also finds rice and chicken, plural/singular both work, and a small typo ("jolof") still finds
-- the item. Results are ranked: a word in the item's name counts most. Used by the items page, the shops list and quick search.

create table if not exists public.search_synonyms (
  term text primary key check (term = lower(term)),
  expands text[] not null
);
alter table public.search_synonyms enable row level security;
revoke all on public.search_synonyms from public, anon, authenticated;
grant all on public.search_synonyms to service_role;
insert into public.search_synonyms (term, expands) values
  ('food', array['food','meal','rice','chicken','jollof','yam','soup','stew','beans','noodles','spaghetti','pasta','egg','fish','meat','pizza','burger','shawarma','snack','bread','bakery','cake','pastry','swallow']),
  ('meal', array['meal','food','rice','chicken','jollof','yam','soup','stew','beans','noodles','spaghetti']),
  ('eat', array['food','meal','rice','chicken','snack','bread']),
  ('drink', array['drink','drinks','juice','water','soda','zobo','smoothie','tea','coffee','malt','beverage']),
  ('drinks', array['drink','drinks','juice','water','soda','zobo','smoothie','tea','coffee','malt','beverage']),
  ('snack', array['snack','snacks','chips','puff','meat pie','pie','biscuit','cake','bread','bakery','pastry','popcorn']),
  ('clothes', array['clothing','clothes','shirt','trouser','dress','wear','jeans','tee','fashion','tailoring','hoodie']),
  ('clothing', array['clothing','clothes','shirt','trouser','dress','wear','jeans','tee','fashion','tailoring','hoodie']),
  ('wear', array['clothing','clothes','shirt','trouser','dress','wear','jeans','tee','fashion','shoe','footwear']),
  ('shoes', array['shoe','shoes','footwear','sneakers','slippers','sandals']),
  ('phone', array['phone','gadget','gadgets','electronics','charger','earphone','earbuds','powerbank']),
  ('gadget', array['gadget','gadgets','electronics','phone','charger','earphone','earbuds','powerbank']),
  ('book', array['book','books','textbook','textbooks','stationery','notebook','pen']),
  ('print', array['print','printing','photocopy','stationery','scan','lamination'])
on conflict (term) do nothing;

-- the categories of a shop, as one line of words
create or replace function app_private.vendor_cat_text(p_vendor uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select lower(coalesce(string_agg(distinct c.name || ' ' || c.slug, ' '), ''))
    from (
      select cc.name, cc.slug from public.vendor_categories vc join public.categories cc on cc.id = vc.category_id where vc.vendor_id = p_vendor
      union
      select cc.name, cc.slug from public.vendors v join public.categories cc on cc.id = v.category_id where v.id = p_vendor
    ) c
$$;

-- 0 = no match; larger = better. Every word of the search must match.
create or replace function app_private.search_rank(p_q text, p_name text, p_desc text, p_section text, p_vendor text, p_cats text)
returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_name text := lower(coalesce(p_name, ''));
  v_ctx text := lower(coalesce(p_section, '') || ' ' || coalesce(p_vendor, '') || ' ' || coalesce(p_cats, ''));
  v_desc text := lower(coalesce(p_desc, ''));
  v_all text := v_name || ' ' || v_desc || ' ' || v_ctx;
  v_tok text; v_alt text[]; v_x text; v_score int := 0; v_t int; v_hit boolean;
begin
  for v_tok in
    select distinct t from unnest(regexp_split_to_array(lower(btrim(coalesce(left(p_q, 60), ''))), '[^a-z0-9]+')) t
     where t <> '' and t not in ('and', 'the', 'of', 'with', 'a', 'in', 'for', 'to', 'an')
  loop
    v_alt := array[v_tok];
    if length(v_tok) > 3 and right(v_tok, 1) = 's' then v_alt := v_alt || left(v_tok, length(v_tok) - 1); end if;
    if length(v_tok) > 2 and right(v_tok, 1) <> 's' then v_alt := v_alt || (v_tok || 's'); end if;
    v_t := 0; v_hit := false;
    foreach v_x in array v_alt loop
      if position(v_x in v_name) > 0 then v_t := greatest(v_t, 10); v_hit := true;
      elsif position(v_x in v_ctx) > 0 then v_t := greatest(v_t, 5); v_hit := true;
      elsif position(v_x in v_desc) > 0 then v_t := greatest(v_t, 3); v_hit := true;
      end if;
    end loop;
    if not v_hit then
      -- related words ("food" finds rice)
      for v_x in select unnest(s.expands) from public.search_synonyms s where s.term = v_tok loop
        if position(v_x in v_all) > 0 then v_t := greatest(v_t, 4); v_hit := true; end if;
      end loop;
    end if;
    if not v_hit and length(v_tok) >= 4 then
      -- a small spelling slip ("jolof")
      if extensions.word_similarity(v_tok, v_all) >= 0.5 then v_t := 2; v_hit := true; end if;
    end if;
    if not v_hit then return 0; end if;
    v_score := v_score + v_t;
  end loop;
  return greatest(v_score, 1);
end $$;
revoke all on function app_private.search_rank(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function app_private.vendor_cat_text(uuid) from public, anon, authenticated;

create or replace function public.search_products(p_q text, p_max_price bigint default null, p_open_only boolean default false, p_limit integer default 24, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_out jsonb;
begin
  if p_q is null or btrim(p_q) = '' then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(t) - array['rank', 'ord', 'vid'] order by t.ord), '[]'::jsonb) into v_out
  from (
    select x.*, row_number() over (order by app_private.vendor_is_open(x.vid) desc, x.rank desc, x.price_kobo, x.name) as ord
    from (
      select p.id, p.name, p.price_kobo, p.is_available and (p.stock_quantity is null or p.stock_quantity > 0) as available,
             v.slug as vendor_slug, v.name as vendor_name, app_private.vendor_is_open(v.id) as open_now, v.id as vid,
             app_private.search_rank(p_q, p.name, p.description, p.section, v.name, app_private.vendor_cat_text(v.id)) as rank
        from public.products p join public.vendors v on v.id = p.vendor_id
       where p.status = 'active' and v.status = 'approved'
         and (p_max_price is null or p.price_kobo <= p_max_price)
         and (not coalesce(p_open_only, false) or app_private.vendor_is_open(v.id))
    ) x where x.rank > 0
  ) t
  where t.ord > greatest(coalesce(p_offset, 0), 0)
    and t.ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 24), 1), 50);
  return v_out;
end $$;

create or replace function public.browse_products(p_q text default null, p_category text default null, p_open_only boolean default false, p_max_price bigint default null, p_sort text default 'recommended', p_limit integer default 24, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_sort text := coalesce(p_sort, 'recommended'); v_has boolean := p_q is not null and btrim(p_q) <> ''; v_out jsonb;
begin
  if v_sort not in ('recommended', 'price_asc', 'price_desc', 'name', 'newest') then v_sort := 'recommended'; end if;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.ord), '[]'::jsonb) into v_out
  from (
    select y.id, y.name, y.price_kobo, y.available, y.vendor_slug, y.vendor_name, y.category_slug, y.category_name, y.open_now,
           row_number() over (order by
             case when v_sort = 'recommended' then (not y.open_now)::int end,
             case when v_sort = 'recommended' and v_has then -y.rank end,
             case when v_sort = 'price_asc' then y.price_kobo end,
             case when v_sort = 'price_desc' then y.price_kobo end desc,
             case when v_sort = 'newest' then y.created_at end desc,
             lower(y.name), y.id) as ord
    from (
      select p.id, p.name, p.price_kobo, p.is_available and (p.stock_quantity is null or p.stock_quantity > 0) as available,
             v.slug as vendor_slug, v.name as vendor_name, c.slug as category_slug, c.name as category_name,
             app_private.vendor_is_open(v.id) as open_now, p.created_at,
             case when v_has then app_private.search_rank(p_q, p.name, p.description, p.section, v.name, app_private.vendor_cat_text(v.id)) else 1 end as rank
        from public.products p
        join public.vendors v on v.id = p.vendor_id
        left join public.categories c on c.id = v.category_id
       where p.status = 'active' and v.status = 'approved'
         and (p_category is null or exists (select 1 from public.vendor_categories vc join public.categories cc on cc.id = vc.category_id where vc.vendor_id = v.id and cc.slug = p_category))
         and (p_max_price is null or p.price_kobo <= p_max_price)
         and (not coalesce(p_open_only, false) or app_private.vendor_is_open(v.id))
    ) y where y.rank > 0
  ) t
  where t.ord > greatest(coalesce(p_offset, 0), 0)
    and t.ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 24), 1), 50);
  return v_out;
end $$;

create or replace function public.browse_vendors(p_q text default null, p_category text default null, p_open_only boolean default false, p_limit integer default 24, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_has boolean := p_q is not null and btrim(p_q) <> ''; v_out jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.open_now desc, t.name), '[]'::jsonb) into v_out
  from (
    select v.id, v.slug, v.name, v.description, c.slug as category_slug, c.name as category_name,
           v.prep_minutes, v.temporarily_closed, app_private.vendor_is_open(v.id) as open_now
    from public.vendors v left join public.categories c on c.id = v.category_id
    where v.status = 'approved'
      and (p_category is null or exists (select 1 from public.vendor_categories vc join public.categories cc on cc.id = vc.category_id where vc.vendor_id = v.id and cc.slug = p_category))
      and (not v_has
           or app_private.search_rank(p_q, v.name, v.description, '', v.name, app_private.vendor_cat_text(v.id)) > 0
           or exists (select 1 from public.products p where p.vendor_id = v.id and p.status = 'active'
                       and app_private.search_rank(p_q, p.name, p.description, p.section, v.name, app_private.vendor_cat_text(v.id)) > 0))
      and (not coalesce(p_open_only, false) or app_private.vendor_is_open(v.id))
    order by app_private.vendor_is_open(v.id) desc, v.name
    limit least(greatest(coalesce(p_limit, 24), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
  ) t;
  return v_out;
end $$;
