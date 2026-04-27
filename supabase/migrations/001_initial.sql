-- Contractor client-experience MVP schema
-- Run in Supabase SQL Editor or via supabase db push

-- Extensions
create extension if not exists "pgcrypto";

-- Companies (one per contractor for MVP simplicity)
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  tagline text,
  logo_url text,
  brand_color text default '#0f172a',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  share_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_company_id_idx on public.projects (company_id);

create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  note text not null default '',
  next_step text not null default '',
  progress_percent int not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  created_at timestamptz not null default now()
);

create index project_updates_project_id_idx on public.project_updates (project_id);

create table public.project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  caption text,
  created_at timestamptz not null default now()
);

create index project_photos_project_id_idx on public.project_photos (project_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- RLS
alter table public.companies enable row level security;
alter table public.projects enable row level security;
alter table public.project_updates enable row level security;
alter table public.project_photos enable row level security;

-- Companies: owner only
create policy "companies_select_own"
  on public.companies for select
  using (auth.uid() = owner_id);

create policy "companies_insert_own"
  on public.companies for insert
  with check (auth.uid() = owner_id);

create policy "companies_update_own"
  on public.companies for update
  using (auth.uid() = owner_id);

create policy "companies_delete_own"
  on public.companies for delete
  using (auth.uid() = owner_id);

-- Projects: via company ownership
create policy "projects_select_own"
  on public.projects for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "projects_insert_own"
  on public.projects for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "projects_update_own"
  on public.projects for update
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "projects_delete_own"
  on public.projects for delete
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

-- Updates: via project
create policy "project_updates_all_own"
  on public.project_updates for all
  using (
    exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = project_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = project_id and c.owner_id = auth.uid()
    )
  );

-- Photos: via project
create policy "project_photos_all_own"
  on public.project_photos for all
  using (
    exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = project_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = project_id and c.owner_id = auth.uid()
    )
  );

-- Public read by share token (anon + authenticated) via security definer RPC
create or replace function public.get_public_project(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_company public.companies;
  v_updates jsonb;
  v_photos jsonb;
begin
  select * into v_project from public.projects where share_token = p_token;
  if not found then
    return null;
  end if;

  select * into v_company from public.companies where id = v_project.company_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'title', u.title,
      'note', u.note,
      'next_step', u.next_step,
      'progress_percent', u.progress_percent,
      'created_at', u.created_at
    ) order by u.created_at desc
  ), '[]'::jsonb)
  into v_updates
  from public.project_updates u
  where u.project_id = v_project.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ph.id,
      'storage_path', ph.storage_path,
      'sort_order', ph.sort_order,
      'caption', ph.caption,
      'created_at', ph.created_at
    ) order by ph.sort_order asc, ph.created_at asc
  ), '[]'::jsonb)
  into v_photos
  from public.project_photos ph
  where ph.project_id = v_project.id;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'title', v_project.title,
      'share_token', v_project.share_token,
      'created_at', v_project.created_at
    ),
    'company', jsonb_build_object(
      'id', v_company.id,
      'name', v_company.name,
      'tagline', v_company.tagline,
      'logo_url', v_company.logo_url,
      'brand_color', coalesce(v_company.brand_color, '#0f172a')
    ),
    'updates', v_updates,
    'photos', v_photos
  );
end;
$$;

grant execute on function public.get_public_project(uuid) to anon, authenticated;

-- Storage: create bucket "project-photos" (private) in Dashboard → Storage if SQL insert is not permitted.
-- Path format: {project_id}/{filename}

-- Storage policies: authenticated users manage files under folders named by project id
create policy "project_photos_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-photos'
    and split_part(name, '/', 1) <> ''
    and exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id::text = split_part(name, '/', 1)
        and c.owner_id = auth.uid()
    )
  );

create policy "project_photos_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-photos'
    and exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id::text = split_part(name, '/', 1)
        and c.owner_id = auth.uid()
    )
  );

create policy "project_photos_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-photos'
    and exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id::text = split_part(name, '/', 1)
        and c.owner_id = auth.uid()
    )
  );

create policy "project_photos_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-photos'
    and exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id::text = split_part(name, '/', 1)
        and c.owner_id = auth.uid()
    )
  );

-- Service role / signed URLs used for public reads; optional: allow anon read with path check via RPC only.
-- For signed URL generation server-side, no extra SELECT policy needed for anon.
