-- INVETORY_ACC — optional product photos
-- Run once in Supabase → SQL Editor → new snippet → paste → Run.
-- (Already included at the end of schema.sql for new installs.)

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
