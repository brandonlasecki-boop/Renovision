-- Bids (leads / proposals) for remodeling sales workflow

create type public.bid_status as enum (
  'draft',
  'sent',
  'won',
  'lost',
  'archived'
);

create type public.bid_photo_kind as enum (
  'before',
  'after_mockup'
);

create type public.bid_ai_status as enum (
  'idle',
  'pending',
  'complete',
  'failed'
);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  status public.bid_status not null default 'draft',
  title text not null,
  customer_name text not null default '',
  customer_email text,
  customer_phone text,
  site_address_line1 text,
  site_city text,
  site_state text,
  site_postal_code text,
  scope_description text not null default '',
  internal_notes text,
  material_estimate jsonb not null default '[]'::jsonb,
  ai_summary text,
  ai_status public.bid_ai_status not null default 'idle',
  ai_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bids_company_id_idx on public.bids (company_id);
create index bids_status_idx on public.bids (company_id, status);

create table public.bid_photos (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  caption text,
  kind public.bid_photo_kind not null default 'before',
  created_at timestamptz not null default now()
);

create index bid_photos_bid_id_idx on public.bid_photos (bid_id);

create trigger bids_updated_at
  before update on public.bids
  for each row execute function public.set_updated_at();

alter table public.bids enable row level security;
alter table public.bid_photos enable row level security;

create policy "bids_select_own"
  on public.bids for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "bids_insert_own"
  on public.bids for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "bids_update_own"
  on public.bids for update
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "bids_delete_own"
  on public.bids for delete
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "bid_photos_all_own"
  on public.bid_photos for all
  using (
    exists (
      select 1 from public.bids b
      join public.companies c on c.id = b.company_id
      where b.id = bid_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.bids b
      join public.companies c on c.id = b.company_id
      where b.id = bid_id and c.owner_id = auth.uid()
    )
  );

-- Storage: paths bids/{bid_id}/{filename} in bucket project-photos
create policy "bid_photos_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-photos'
    and split_part(name, '/', 1) = 'bids'
    and split_part(name, '/', 2) <> ''
    and exists (
      select 1 from public.bids b
      join public.companies c on c.id = b.company_id
      where b.id::text = split_part(name, '/', 2)
        and c.owner_id = auth.uid()
    )
  );

create policy "bid_photos_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-photos'
    and split_part(name, '/', 1) = 'bids'
    and exists (
      select 1 from public.bids b
      join public.companies c on c.id = b.company_id
      where b.id::text = split_part(name, '/', 2)
        and c.owner_id = auth.uid()
    )
  );

create policy "bid_photos_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-photos'
    and split_part(name, '/', 1) = 'bids'
    and exists (
      select 1 from public.bids b
      join public.companies c on c.id = b.company_id
      where b.id::text = split_part(name, '/', 2)
        and c.owner_id = auth.uid()
    )
  );

create policy "bid_photos_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-photos'
    and split_part(name, '/', 1) = 'bids'
    and exists (
      select 1 from public.bids b
      join public.companies c on c.id = b.company_id
      where b.id::text = split_part(name, '/', 2)
        and c.owner_id = auth.uid()
    )
  );
