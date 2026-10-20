-- INVETORY_ACC — public catalog (no login): photo, name, price and
-- available / sold out. Never shows units or cost.
-- Run once in Supabase → SQL Editor → new snippet → paste → Run.
-- (Already included at the end of schema.sql for new installs.)

alter table public.orgs add column if not exists catalog_code text unique
  default lower(substr(md5(gen_random_uuid()::text), 1, 8));
update public.orgs set catalog_code = lower(substr(md5(gen_random_uuid()::text), 1, 8)) where catalog_code is null;

-- Employees now sign in with ID + code, so the old "join with business code"
-- door is closed for good.
drop function if exists public.join_org(text, text);

create or replace function public.get_catalog(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'business', o.name,
    'stores', coalesce((select json_agg(s.name order by s.created_at) from stores s where s.org_id = o.id), '[]'::json),
    'items', coalesce((
      select json_agg(json_build_object(
        'name', p.name,
        'price', p.price,
        'photo_path', p.photo_path,
        'in_stock', exists (select 1 from inventory i where i.product_id = p.id and i.qty > 0)
      ) order by p.name)
      from products p where p.org_id = o.id), '[]'::json))
  from orgs o where o.catalog_code = lower(trim(p_code));
$$;
grant execute on function public.get_catalog(text) to anon, authenticated;
