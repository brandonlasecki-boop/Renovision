-- Fix project photo uploads: compare storage path segment as UUID (text comparison was unreliable).
-- Recreate project_photos policies with explicit INSERT/SELECT/UPDATE/DELETE for clearer checks.

drop policy if exists "project_photos_all_own" on public.project_photos;

create policy "project_photos_select_own"
  on public.project_photos for select
  using (
    exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = project_id
        and c.owner_id = auth.uid()
    )
  );

create policy "project_photos_insert_own"
  on public.project_photos for insert
  with check (
    exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = project_id
        and c.owner_id = auth.uid()
    )
  );

create policy "project_photos_update_own"
  on public.project_photos for update
  using (
    exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = project_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = project_id
        and c.owner_id = auth.uid()
    )
  );

create policy "project_photos_delete_own"
  on public.project_photos for delete
  using (
    exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = project_id
        and c.owner_id = auth.uid()
    )
  );

-- Storage: match first path segment as UUID to project.id
drop policy if exists "project_photos_storage_insert" on storage.objects;
drop policy if exists "project_photos_storage_select_own" on storage.objects;
drop policy if exists "project_photos_storage_update_own" on storage.objects;
drop policy if exists "project_photos_storage_delete_own" on storage.objects;

create policy "project_photos_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-photos'
    and split_part(name, '/', 1) <> ''
    and split_part(name, '/', 1) <> 'bids'
    and exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = split_part(name, '/', 1)::uuid
        and c.owner_id = auth.uid()
    )
  );

create policy "project_photos_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-photos'
    and split_part(name, '/', 1) <> ''
    and split_part(name, '/', 1) <> 'bids'
    and exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = split_part(name, '/', 1)::uuid
        and c.owner_id = auth.uid()
    )
  );

create policy "project_photos_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-photos'
    and split_part(name, '/', 1) <> ''
    and split_part(name, '/', 1) <> 'bids'
    and exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = split_part(name, '/', 1)::uuid
        and c.owner_id = auth.uid()
    )
  );

create policy "project_photos_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-photos'
    and split_part(name, '/', 1) <> ''
    and split_part(name, '/', 1) <> 'bids'
    and exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = split_part(name, '/', 1)::uuid
        and c.owner_id = auth.uid()
    )
  );
