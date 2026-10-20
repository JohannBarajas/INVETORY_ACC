-- INVETORY_ACC — Supabase schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: every object is created with "if not exists" / "or replace".

create extension if not exists pgcrypto;

-- ─────────────────────────── Tables ───────────────────────────

-- A business (one owner, one or more stores, several employees).
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_at  timestamptz not null default now()
);

-- Who belongs to which business, and their role.
create table if not exists public.members (
  org_id        uuid not null references public.orgs(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'employee' check (role in ('owner', 'employee')),
  display_name  text not null default '',
  created_at    timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- The catalog is shared by every store in the business.
create table if not exists public.products (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id) on delete cascade,
  name                 text not null,
  cost                 numeric(10,2) not null default 0,
  price                numeric(10,2),
  low_stock_threshold  int not null default 3,
  created_at           timestamptz not null default now()
);

-- Stock of each product in each store.
create table if not exists public.inventory (
  org_id      uuid not null references public.orgs(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  qty         int  not null default 0 check (qty >= 0),
  updated_at  timestamptz not null default now(),
  primary key (product_id, store_id)
);

create table if not exists public.sales (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  store_id      uuid not null references public.stores(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_name  text not null,
  qty           int not null check (qty > 0),
  unit_price    numeric(10,2) not null,
  unit_cost     numeric(10,2) not null default 0,
  sold_by       uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists sales_store_created_idx on public.sales (store_id, created_at desc);
create index if not exists products_org_idx on public.products (org_id);
create index if not exists inventory_store_idx on public.inventory (store_id);

-- ─────────────────────────── Access helpers ───────────────────────────

create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.is_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where org_id = p_org and user_id = auth.uid() and role = 'owner');
$$;

-- ─────────────────────────── Row Level Security ───────────────────────────
-- Nobody sees another business's data. Employees can sell and adjust stock;
-- only owners can rename stores or delete products.

alter table public.orgs      enable row level security;
alter table public.members   enable row level security;
alter table public.stores    enable row level security;
alter table public.products  enable row level security;
alter table public.inventory enable row level security;
alter table public.sales     enable row level security;

drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs for select using (public.is_member(id));
drop policy if exists orgs_update on public.orgs;
create policy orgs_update on public.orgs for update using (public.is_owner(id));

drop policy if exists members_select on public.members;
create policy members_select on public.members for select using (public.is_member(org_id));
drop policy if exists members_update_self on public.members;
create policy members_update_self on public.members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists members_delete_owner on public.members;
create policy members_delete_owner on public.members for delete using (public.is_owner(org_id));

drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores for select using (public.is_member(org_id));
drop policy if exists stores_write on public.stores;
create policy stores_write on public.stores for all using (public.is_owner(org_id)) with check (public.is_owner(org_id));

drop policy if exists products_select on public.products;
create policy products_select on public.products for select using (public.is_member(org_id));
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert with check (public.is_member(org_id));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update using (public.is_member(org_id)) with check (public.is_member(org_id));
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete using (public.is_owner(org_id));

drop policy if exists inventory_select on public.inventory;
create policy inventory_select on public.inventory for select using (public.is_member(org_id));
drop policy if exists inventory_write on public.inventory;
create policy inventory_write on public.inventory for all using (public.is_member(org_id)) with check (public.is_member(org_id));

drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select using (public.is_member(org_id));
-- Sales are written only through record_sale() / void_sale() below.

-- ─────────────────────────── Actions (RPC) ───────────────────────────

-- First-time setup: create the business, its stores, and make the caller the owner.
create or replace function public.create_org(p_name text, p_stores text[], p_display_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; s text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into orgs (name) values (trim(p_name)) returning id into v_org;
  insert into members (org_id, user_id, role, display_name) values (v_org, auth.uid(), 'owner', coalesce(p_display_name, ''));
  foreach s in array p_stores loop
    if length(trim(s)) > 0 then insert into stores (org_id, name) values (v_org, trim(s)); end if;
  end loop;
  return v_org;
end $$;

-- Employees join with the 6-character code the owner shares.
create or replace function public.join_org(p_code text, p_display_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into v_org from orgs where join_code = upper(trim(p_code));
  if v_org is null then raise exception 'That code does not match any business'; end if;
  insert into members (org_id, user_id, role, display_name) values (v_org, auth.uid(), 'employee', coalesce(p_display_name, ''))
  on conflict (org_id, user_id) do nothing;
  return v_org;
end $$;

-- Add or remove units (deliveries, corrections). Never goes below zero.
create or replace function public.adjust_stock(p_product uuid, p_store uuid, p_delta int)
returns int language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_qty int;
begin
  select org_id into v_org from products where id = p_product;
  if v_org is null or not is_member(v_org) then raise exception 'Not allowed'; end if;
  insert into inventory (org_id, product_id, store_id, qty) values (v_org, p_product, p_store, greatest(0, p_delta))
  on conflict (product_id, store_id) do update set qty = greatest(0, inventory.qty + p_delta), updated_at = now()
  returning qty into v_qty;
  return v_qty;
end $$;

-- Record a sale and take it out of stock in one step (no double-selling the last unit).
create or replace function public.record_sale(p_product uuid, p_store uuid, p_qty int, p_price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_cost numeric; v_have int; v_sale uuid;
begin
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
  if p_price is null or p_price < 0 then raise exception 'Enter the sale price'; end if;
  select org_id, name, cost into v_org, v_name, v_cost from products where id = p_product;
  if v_org is null or not is_member(v_org) then raise exception 'Not allowed'; end if;
  select qty into v_have from inventory where product_id = p_product and store_id = p_store for update;
  if coalesce(v_have, 0) < p_qty then raise exception 'Only % left in this store', coalesce(v_have, 0); end if;
  update inventory set qty = qty - p_qty, updated_at = now() where product_id = p_product and store_id = p_store;
  update products set price = p_price where id = p_product;
  insert into sales (org_id, store_id, product_id, product_name, qty, unit_price, unit_cost, sold_by)
  values (v_org, p_store, p_product, v_name, p_qty, p_price, v_cost, auth.uid())
  returning id into v_sale;
  return v_sale;
end $$;

-- Undo a sale and put the units back on the shelf.
create or replace function public.void_sale(p_sale uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v sales%rowtype;
begin
  select * into v from sales where id = p_sale;
  if v.id is null or not is_member(v.org_id) then raise exception 'Not allowed'; end if;
  if v.product_id is not null then
    insert into inventory (org_id, product_id, store_id, qty) values (v.org_id, v.product_id, v.store_id, v.qty)
    on conflict (product_id, store_id) do update set qty = inventory.qty + v.qty, updated_at = now();
  end if;
  delete from sales where id = p_sale;
end $$;

grant execute on function public.create_org(text, text[], text) to authenticated;
grant execute on function public.join_org(text, text) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, int) to authenticated;
grant execute on function public.record_sale(uuid, uuid, int, numeric) to authenticated;
grant execute on function public.void_sale(uuid) to authenticated;

-- ─────────────────────────── Live updates ───────────────────────────
-- Lets every phone see stock and sales change without refreshing.
do $$ begin
  begin alter publication supabase_realtime add table public.inventory; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sales;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.products;  exception when duplicate_object then null; end;
end $$;

-- ─────────────────────────── Product photos (optional) ───────────────────────────
alter table public.products add column if not exists photo_path text;

-- Public bucket for small product thumbnails (anyone with the link can view a
-- thumbnail; only members of the business can upload, replace or delete).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Files live at  <org_id>/<file>.jpg  — the first folder decides who may write.
create or replace function public.photo_org_ok(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  begin v_org := (storage.foldername(p_name))[1]::uuid; exception when others then return false; end;
  return public.is_member(v_org);
end $$;

drop policy if exists product_photos_select on storage.objects;
create policy product_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'product-photos' and public.photo_org_ok(name));
drop policy if exists product_photos_insert on storage.objects;
create policy product_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and public.photo_org_ok(name));
drop policy if exists product_photos_update on storage.objects;
create policy product_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and public.photo_org_ok(name));
drop policy if exists product_photos_delete on storage.objects;
create policy product_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and public.photo_org_ok(name));

-- ─────────────────────────── Employee logins (ID + code) ───────────────────────────
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  login_id      text not null unique check (login_id ~ '^[a-z0-9._-]{3,20}$'),
  name          text not null,
  pin_hash      text not null,
  active        boolean not null default true,
  failed        int not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.employees enable row level security;
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select using (public.is_owner(org_id));
-- The owner can list employees but never read the stored codes.
revoke all on public.employees from anon, authenticated;
grant select (id, org_id, login_id, name, active, created_at) on public.employees to authenticated;

-- Each phone an employee signs in on is linked to their employee record.
alter table public.members add column if not exists employee_id uuid references public.employees(id) on delete cascade;

-- Keep the seller's name on each sale, even after they sign out.
alter table public.sales add column if not exists seller_name text;

create or replace function public.add_employee(p_login text, p_name text, p_pin text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_id uuid; v_login text := lower(trim(p_login));
begin
  select org_id into v_org from members where user_id = auth.uid() and role = 'owner' limit 1;
  if v_org is null then raise exception 'Only the owner can add employees'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter the employee''s name'; end if;
  if v_login !~ '^[a-z0-9._-]{3,20}$' then raise exception 'ID must be 3–20 letters or numbers, no spaces'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'Code must be 4 to 6 numbers'; end if;
  if exists (select 1 from employees where login_id = v_login) then raise exception 'That ID is taken. Try another, like %1', v_login; end if;
  insert into employees (org_id, login_id, name, pin_hash) values (v_org, v_login, trim(p_name), crypt(p_pin, gen_salt('bf')))
  returning id into v_id;
  return v_id;
end $$;

-- Change name and/or code, or turn access off. A new code or turning access
-- off signs the employee out of every phone right away.
create or replace function public.update_employee(p_id uuid, p_name text, p_pin text default null, p_active boolean default true)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid;
begin
  select org_id into v_org from employees where id = p_id;
  if v_org is null or not is_owner(v_org) then raise exception 'Not allowed'; end if;
  if p_pin is not null and length(p_pin) > 0 and p_pin !~ '^[0-9]{4,6}$' then raise exception 'Code must be 4 to 6 numbers'; end if;
  update employees set
    name = coalesce(nullif(trim(p_name), ''), name),
    pin_hash = case when coalesce(p_pin, '') <> '' then crypt(p_pin, gen_salt('bf')) else pin_hash end,
    active = p_active, failed = 0, locked_until = null
  where id = p_id;
  update members set display_name = coalesce(nullif(trim(p_name), ''), display_name) where employee_id = p_id;
  if coalesce(p_pin, '') <> '' or not p_active then delete from members where employee_id = p_id; end if;
end $$;

create or replace function public.delete_employee(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from employees where id = p_id;
  if v_org is null or not is_owner(v_org) then raise exception 'Not allowed'; end if;
  delete from employees where id = p_id;   -- members rows go with it (cascade)
end $$;

-- Called from the employee's phone after a guest (anonymous) sign-in.
-- 5 wrong codes lock that ID for 15 minutes.
create or replace function public.employee_login(p_login text, p_pin text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare e employees%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into e from employees where login_id = lower(trim(p_login));
  if e.id is null or not e.active then raise exception 'Wrong ID or code'; end if;
  if e.locked_until is not null and e.locked_until > now() then
    raise exception 'Too many tries. Wait % minutes or ask the owner.', ceil(extract(epoch from e.locked_until - now()) / 60);
  end if;
  if e.pin_hash <> crypt(coalesce(p_pin, ''), e.pin_hash) then
    update employees set
      locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end,
      failed = case when failed + 1 >= 5 then 0 else failed + 1 end
    where id = e.id;
    raise exception 'Wrong ID or code';
  end if;
  update employees set failed = 0, locked_until = null where id = e.id;
  insert into members (org_id, user_id, role, display_name, employee_id)
  values (e.org_id, auth.uid(), 'employee', e.name, e.id)
  on conflict (org_id, user_id) do update set display_name = excluded.display_name, employee_id = excluded.employee_id, role = 'employee';
  return e.org_id;
end $$;

-- Same as before, plus the seller's name on the sale.
create or replace function public.record_sale(p_product uuid, p_store uuid, p_qty int, p_price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_cost numeric; v_have int; v_sale uuid; v_seller text;
begin
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
  if p_price is null or p_price < 0 then raise exception 'Enter the sale price'; end if;
  select org_id, name, cost into v_org, v_name, v_cost from products where id = p_product;
  if v_org is null or not is_member(v_org) then raise exception 'Not allowed'; end if;
  select qty into v_have from inventory where product_id = p_product and store_id = p_store for update;
  if coalesce(v_have, 0) < p_qty then raise exception 'Only % left in this store', coalesce(v_have, 0); end if;
  select nullif(display_name, '') into v_seller from members where org_id = v_org and user_id = auth.uid();
  update inventory set qty = qty - p_qty, updated_at = now() where product_id = p_product and store_id = p_store;
  update products set price = p_price where id = p_product;
  insert into sales (org_id, store_id, product_id, product_name, qty, unit_price, unit_cost, sold_by, seller_name)
  values (v_org, p_store, p_product, v_name, p_qty, p_price, v_cost, auth.uid(), v_seller)
  returning id into v_sale;
  return v_sale;
end $$;

grant execute on function public.add_employee(text, text, text) to authenticated;
grant execute on function public.update_employee(uuid, text, text, boolean) to authenticated;
grant execute on function public.delete_employee(uuid) to authenticated;
grant execute on function public.employee_login(text, text) to authenticated;

-- ─────────────────────────── Public catalog ───────────────────────────
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

-- ─────────────────────────── Employee info ───────────────────────────
alter table public.employees add column if not exists last_login_at timestamptz;
grant select (last_login_at) on public.employees to authenticated;

alter table public.sales add column if not exists employee_id uuid references public.employees(id) on delete set null;
create index if not exists sales_employee_idx on public.sales (employee_id, created_at desc);

-- Same login as before, plus "last sign-in" time.
create or replace function public.employee_login(p_login text, p_pin text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare e employees%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into e from employees where login_id = lower(trim(p_login));
  if e.id is null or not e.active then raise exception 'Wrong ID or code'; end if;
  if e.locked_until is not null and e.locked_until > now() then
    raise exception 'Too many tries. Wait % minutes or ask the owner.', ceil(extract(epoch from e.locked_until - now()) / 60);
  end if;
  if e.pin_hash <> crypt(coalesce(p_pin, ''), e.pin_hash) then
    update employees set
      locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end,
      failed = case when failed + 1 >= 5 then 0 else failed + 1 end
    where id = e.id;
    raise exception 'Wrong ID or code';
  end if;
  update employees set failed = 0, locked_until = null, last_login_at = now() where id = e.id;
  insert into members (org_id, user_id, role, display_name, employee_id)
  values (e.org_id, auth.uid(), 'employee', e.name, e.id)
  on conflict (org_id, user_id) do update set display_name = excluded.display_name, employee_id = excluded.employee_id, role = 'employee';
  return e.org_id;
end $$;

-- Same sale as before, plus which employee made it.
create or replace function public.record_sale(p_product uuid, p_store uuid, p_qty int, p_price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_cost numeric; v_have int; v_sale uuid; v_seller text; v_emp uuid;
begin
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
  if p_price is null or p_price < 0 then raise exception 'Enter the sale price'; end if;
  select org_id, name, cost into v_org, v_name, v_cost from products where id = p_product;
  if v_org is null or not is_member(v_org) then raise exception 'Not allowed'; end if;
  select qty into v_have from inventory where product_id = p_product and store_id = p_store for update;
  if coalesce(v_have, 0) < p_qty then raise exception 'Only % left in this store', coalesce(v_have, 0); end if;
  select nullif(display_name, ''), employee_id into v_seller, v_emp from members where org_id = v_org and user_id = auth.uid();
  update inventory set qty = qty - p_qty, updated_at = now() where product_id = p_product and store_id = p_store;
  update products set price = p_price where id = p_product;
  insert into sales (org_id, store_id, product_id, product_name, qty, unit_price, unit_cost, sold_by, seller_name, employee_id)
  values (v_org, p_store, p_product, v_name, p_qty, p_price, v_cost, auth.uid(), v_seller, v_emp)
  returning id into v_sale;
  return v_sale;
end $$;

-- ─────────────────────────── Edit employee ───────────────────────────
create or replace function public.edit_employee(p_id uuid, p_name text, p_login text, p_pin text default null, p_active boolean default true)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_old text; v_login text := lower(trim(coalesce(p_login, '')));
begin
  select org_id, login_id into v_org, v_old from employees where id = p_id;
  if v_org is null or not is_owner(v_org) then raise exception 'Not allowed'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter the employee''s name'; end if;
  if v_login !~ '^[a-z0-9._-]{3,20}$' then raise exception 'Sign-in ID must be 3–20 letters or numbers, no spaces'; end if;
  if v_login <> v_old and exists (select 1 from employees where login_id = v_login) then
    raise exception 'That sign-in ID is taken. Try another.';
  end if;
  if coalesce(p_pin, '') <> '' and p_pin !~ '^[0-9]{4,6}$' then raise exception 'Code must be 4 to 6 numbers'; end if;
  update employees set
    name = trim(p_name),
    login_id = v_login,
    pin_hash = case when coalesce(p_pin, '') <> '' then crypt(p_pin, gen_salt('bf')) else pin_hash end,
    active = p_active, failed = 0, locked_until = null
  where id = p_id;
  update members set display_name = trim(p_name) where employee_id = p_id;
  -- New code, new ID or access off: sign them out of every phone right away.
  if coalesce(p_pin, '') <> '' or v_login <> v_old or not p_active then
    delete from members where employee_id = p_id;
  end if;
end $$;
grant execute on function public.edit_employee(uuid, text, text, text, boolean) to authenticated;

-- ─────────────────────────── Owner can see codes ───────────────────────────
alter table public.employees add column if not exists pin_code text;
grant select (pin_code) on public.employees to authenticated;

create or replace function public.add_employee(p_login text, p_name text, p_pin text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_id uuid; v_login text := lower(trim(p_login));
begin
  select org_id into v_org from members where user_id = auth.uid() and role = 'owner' limit 1;
  if v_org is null then raise exception 'Only the owner can add employees'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter the employee''s name'; end if;
  if v_login !~ '^[a-z0-9._-]{3,20}$' then raise exception 'Sign-in ID must be 3–20 letters or numbers, no spaces'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'Code must be 4 to 6 numbers'; end if;
  if exists (select 1 from employees where login_id = v_login) then raise exception 'That sign-in ID is taken. Try another.'; end if;
  insert into employees (org_id, login_id, name, pin_hash, pin_code)
  values (v_org, v_login, trim(p_name), crypt(p_pin, gen_salt('bf')), p_pin)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.edit_employee(p_id uuid, p_name text, p_login text, p_pin text default null, p_active boolean default true)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_old text; v_login text := lower(trim(coalesce(p_login, '')));
begin
  select org_id, login_id into v_org, v_old from employees where id = p_id;
  if v_org is null or not is_owner(v_org) then raise exception 'Not allowed'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter the employee''s name'; end if;
  if v_login !~ '^[a-z0-9._-]{3,20}$' then raise exception 'Sign-in ID must be 3–20 letters or numbers, no spaces'; end if;
  if v_login <> v_old and exists (select 1 from employees where login_id = v_login) then
    raise exception 'That sign-in ID is taken. Try another.';
  end if;
  if coalesce(p_pin, '') <> '' and p_pin !~ '^[0-9]{4,6}$' then raise exception 'Code must be 4 to 6 numbers'; end if;
  update employees set
    name = trim(p_name),
    login_id = v_login,
    pin_hash = case when coalesce(p_pin, '') <> '' then crypt(p_pin, gen_salt('bf')) else pin_hash end,
    pin_code = case when coalesce(p_pin, '') <> '' then p_pin else pin_code end,
    active = p_active, failed = 0, locked_until = null
  where id = p_id;
  update members set display_name = trim(p_name) where employee_id = p_id;
  if coalesce(p_pin, '') <> '' or v_login <> v_old or not p_active then
    delete from members where employee_id = p_id;
  end if;
end $$;

-- ─────────────────────────── One business per owner ───────────────────────────
-- From now on an owner can't create a second business by accident.
create or replace function public.create_org(p_name text, p_stores text[], p_display_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; s text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select org_id into v_org from members where user_id = auth.uid() and role = 'owner' order by created_at limit 1;
  if v_org is not null then return v_org; end if;
  insert into orgs (name) values (trim(p_name)) returning id into v_org;
  insert into members (org_id, user_id, role, display_name) values (v_org, auth.uid(), 'owner', coalesce(p_display_name, ''));
  foreach s in array p_stores loop
    if length(trim(s)) > 0 then insert into stores (org_id, name) values (v_org, trim(s)); end if;
  end loop;
  return v_org;
end $$;

-- Employees always go into the owner's (single) business.
create or replace function public.add_employee(p_login text, p_name text, p_pin text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_id uuid; v_login text := lower(trim(p_login));
begin
  select org_id into v_org from members where user_id = auth.uid() and role = 'owner' order by created_at limit 1;
  if v_org is null then raise exception 'Only the owner can add employees'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter the employee''s name'; end if;
  if v_login !~ '^[a-z0-9._-]{3,20}$' then raise exception 'Sign-in ID must be 3–20 letters or numbers, no spaces'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'Code must be 4 to 6 numbers'; end if;
  if exists (select 1 from employees where login_id = v_login) then raise exception 'That sign-in ID is taken. Try another.'; end if;
  insert into employees (org_id, login_id, name, pin_hash, pin_code)
  values (v_org, v_login, trim(p_name), crypt(p_pin, gen_salt('bf')), p_pin)
  returning id into v_id;
  return v_id;
end $$;

