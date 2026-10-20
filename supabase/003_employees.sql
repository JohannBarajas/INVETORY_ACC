-- INVETORY_ACC — employee logins with ID + code (no email)
-- Run once in Supabase → SQL Editor → new snippet → paste → Run.
-- Also turn ON: Authentication → Sign In / Providers → "Allow anonymous sign-ins".
-- (Already included at the end of schema.sql for new installs.)

create extension if not exists pgcrypto;

-- Employees the owner creates. login_id is unique across the whole app so an
-- employee only needs ID + code to sign in. The code is stored hashed.
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
