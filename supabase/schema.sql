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

drop policy if exists product_photos_insert on storage.objects;
create policy product_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and public.photo_org_ok(name));
drop policy if exists product_photos_update on storage.objects;
create policy product_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and public.photo_org_ok(name));
drop policy if exists product_photos_delete on storage.objects;
create policy product_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and public.photo_org_ok(name));
