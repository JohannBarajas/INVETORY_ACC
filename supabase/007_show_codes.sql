-- INVETORY_ACC — the owner can see each employee's code in the app.
-- Only the owner can read it (row security on employees). Employees never see codes.
-- Run once in Supabase → SQL Editor → new snippet → paste → Run (after 006).
-- Existing employees show their code after the owner sets it again in Edit.
-- (Already included at the end of schema.sql for new installs.)

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
