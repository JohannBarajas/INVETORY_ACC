-- INVETORY_ACC — more employee info for the owner: last sign-in and sales per employee.
-- Run once in Supabase → SQL Editor → new snippet → paste → Run (after 003_employees.sql).
-- (Already included at the end of schema.sql for new installs.)

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
