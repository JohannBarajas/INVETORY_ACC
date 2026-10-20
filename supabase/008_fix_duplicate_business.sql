-- INVETORY_ACC — fix: an owner ended up with two businesses (e.g. "Create"
-- tapped twice), so employees saved in one don't show in the other.
-- This merges everything into ONE business per owner (the one with the most
-- products; if tied, the oldest). Stores with the same name are combined.
-- Safe to run when there's nothing to fix: it then changes nothing.
-- Run once in Supabase → SQL Editor → new snippet → paste → Run.

alter table public.employees add column if not exists pin_code text;
grant select (pin_code) on public.employees to authenticated;

do $$
declare u record; keep uuid; dup record; st record; ks uuid;
begin
  for u in select user_id from members where role = 'owner' group by user_id having count(*) > 1 loop
    select m.org_id into keep from members m
     where m.user_id = u.user_id and m.role = 'owner'
     order by (select count(*) from products p where p.org_id = m.org_id) desc, m.created_at asc
     limit 1;

    for dup in select org_id from members where user_id = u.user_id and role = 'owner' and org_id <> keep loop
      -- stores: same name → combine; otherwise move over
      for st in select * from stores where org_id = dup.org_id loop
        select id into ks from stores where org_id = keep and lower(trim(name)) = lower(trim(st.name)) limit 1;
        if ks is null then
          update stores set org_id = keep where id = st.id;
        else
          update inventory set store_id = ks where store_id = st.id;
          update sales     set store_id = ks where store_id = st.id;
          delete from stores where id = st.id;
        end if;
      end loop;
      update products  set org_id = keep where org_id = dup.org_id;
      update inventory set org_id = keep where org_id = dup.org_id;
      update sales     set org_id = keep where org_id = dup.org_id;
      update employees set org_id = keep where org_id = dup.org_id;
      delete from members where org_id = dup.org_id and user_id in (select user_id from members where org_id = keep);
      update members set org_id = keep where org_id = dup.org_id;
      delete from orgs where id = dup.org_id;
    end loop;
  end loop;
end $$;

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

-- Check: one row per business. You should see ONE business with your stores and employees.
select o.name,
  (select count(*) from stores s where s.org_id = o.id)    as stores,
  (select count(*) from products p where p.org_id = o.id)  as products,
  (select count(*) from employees e where e.org_id = o.id) as employees
from orgs o order by o.created_at;
