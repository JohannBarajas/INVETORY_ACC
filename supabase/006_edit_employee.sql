-- INVETORY_ACC — owner can edit every employee field from the app:
-- name, sign-in ID, code and access.
-- Run once in Supabase → SQL Editor → new snippet → paste → Run.
-- (Already included at the end of schema.sql for new installs.)

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
