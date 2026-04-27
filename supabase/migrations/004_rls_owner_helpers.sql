-- RLS helpers (SECURITY DEFINER) so policies don't fail when nested SELECTs hit RLS on projects/companies/bids.
-- Run after 001, 002, 003.

-- Project ownership (company owner = auth user)
create or replace function public.user_owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    inner join public.companies c on c.id = p.company_id
    where p.id = p_project_id
      and c.owner_id = auth.uid()
  );
$$;

-- Bid ownership
create or replace function public.user_owns_bid(p_bid_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bids b
    inner join public.companies c on c.id = b.company_id
    where b.id = p_bid_id
      and c.owner_id = auth.uid()
  );
$$;

-- Storage path: {project_uuid}/file...  (not bids/...)
create or replace function public.storage_project_path_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  seg text;
begin
  seg := split_part(p_name, '/', 1);
  if seg is null or seg = '' or seg = 'bids' then
    return false;
  end if;
  begin
    return public.user_owns_project(seg::uuid);
  exception
    when invalid_text_representation then
      return false;
  end;
end;
$$;

-- Storage path: bids/{bid_uuid}/file...
create or replace function public.storage_bid_path_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  seg1 text;
  seg2 text;
begin
  seg1 := split_part(p_name, '/', 1);
  seg2 := split_part(p_name, '/', 2);
  if seg1 is null or seg1 <> 'bids' or seg2 is null or seg2 = '' then
    return false;
  end if;
  begin
    return public.user_owns_bid(seg2::uuid);
  exception
    when invalid_text_representation then
      return false;
  end;
end;
$$;

grant execute on function public.user_owns_project(uuid) to authenticated;
grant execute on function public.user_owns_bid(uuid) to authenticated;
grant execute on function public.storage_project_path_allowed(text) to authenticated;
grant execute on function public.storage_bid_path_allowed(text) to authenticated;

-- project_photos: replace policies
drop policy if exists "project_photos_select_own" on public.project_photos;
drop policy if exists "project_photos_insert_own" on public.project_photos;
drop policy if exists "project_photos_update_own" on public.project_photos;
drop policy if exists "project_photos_delete_own" on public.project_photos;
drop policy if exists "project_photos_all_own" on public.project_photos;

create policy "project_photos_select_own"
  on public.project_photos for select
  using ( public.user_owns_project(project_id) );

create policy "project_photos_insert_own"
  on public.project_photos for insert
  with check ( public.user_owns_project(project_id) );

create policy "project_photos_update_own"
  on public.project_photos for update
  using ( public.user_owns_project(project_id) )
  with check ( public.user_owns_project(project_id) );

create policy "project_photos_delete_own"
  on public.project_photos for delete
  using ( public.user_owns_project(project_id) );

-- bid_photos: replace FOR ALL policy
drop policy if exists "bid_photos_all_own" on public.bid_photos;

create policy "bid_photos_select_own"
  on public.bid_photos for select
  using ( public.user_owns_bid(bid_id) );

create policy "bid_photos_insert_own"
  on public.bid_photos for insert
  with check ( public.user_owns_bid(bid_id) );

create policy "bid_photos_update_own"
  on public.bid_photos for update
  using ( public.user_owns_bid(bid_id) )
  with check ( public.user_owns_bid(bid_id) );

create policy "bid_photos_delete_own"
  on public.bid_photos for delete
  using ( public.user_owns_bid(bid_id) );

-- Storage: project folder paths
drop policy if exists "project_photos_storage_insert" on storage.objects;
drop policy if exists "project_photos_storage_select_own" on storage.objects;
drop policy if exists "project_photos_storage_update_own" on storage.objects;
drop policy if exists "project_photos_storage_delete_own" on storage.objects;

create policy "project_photos_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-photos'
    and public.storage_project_path_allowed(name)
  );

create policy "project_photos_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-photos'
    and public.storage_project_path_allowed(name)
  );

create policy "project_photos_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-photos'
    and public.storage_project_path_allowed(name)
  );

create policy "project_photos_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-photos'
    and public.storage_project_path_allowed(name)
  );

-- Storage: bid folder paths
drop policy if exists "bid_photos_storage_insert" on storage.objects;
drop policy if exists "bid_photos_storage_select_own" on storage.objects;
drop policy if exists "bid_photos_storage_update_own" on storage.objects;
drop policy if exists "bid_photos_storage_delete_own" on storage.objects;

create policy "bid_photos_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-photos'
    and public.storage_bid_path_allowed(name)
  );

create policy "bid_photos_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-photos'
    and public.storage_bid_path_allowed(name)
  );

create policy "bid_photos_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-photos'
    and public.storage_bid_path_allowed(name)
  );

create policy "bid_photos_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-photos'
    and public.storage_bid_path_allowed(name)
  );
