-- Normalize Renovision business data model (safe, additive-first).
-- - Ensures required tables/columns exist
-- - Backfills compatible defaults
-- - Adds status constraints and indexes
-- - Keeps service-role/admin full access under RLS

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- bathroom_generations
-- ---------------------------------------------------------------------------
create table if not exists public.bathroom_generations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Existing deployments may have session_id uuid + FK.
-- Normalize to text for app/session-level analytics joining.
alter table public.bathroom_generations
  drop constraint if exists bathroom_generations_session_id_fkey;

do $$
declare
  v_udt text;
begin
  select c.udt_name
  into v_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'bathroom_generations'
    and c.column_name = 'session_id';

  if v_udt is null then
    alter table public.bathroom_generations
      add column session_id text;
  elsif v_udt <> 'text' then
    alter table public.bathroom_generations
      alter column session_id type text using session_id::text;
  end if;
end $$;

alter table public.bathroom_generations
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists uploaded_image_url text,
  add column if not exists generated_image_url text,
  add column if not exists selected_style text,
  add column if not exists style_prompt text,
  add column if not exists user_description text,
  add column if not exists tweaks_used jsonb not null default '[]'::jsonb,
  add column if not exists estimate_low integer,
  add column if not exists estimate_expected integer,
  add column if not exists estimate_high integer,
  add column if not exists estimate_confidence text,
  add column if not exists scope_of_work jsonb,
  add column if not exists contractor_notes text,
  add column if not exists lead_submitted boolean not null default false,
  add column if not exists status text not null default 'completed',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Backfill normalized estimate fields from legacy columns when present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bathroom_generations'
      and column_name = 'estimate_min'
  ) then
    execute $sql$
      update public.bathroom_generations
      set estimate_low = coalesce(estimate_low, estimate_min)
      where estimate_low is null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bathroom_generations'
      and column_name = 'estimate_max'
  ) then
    execute $sql$
      update public.bathroom_generations
      set estimate_high = coalesce(estimate_high, estimate_max)
      where estimate_high is null
    $sql$;
  end if;
end $$;

update public.bathroom_generations
set estimate_expected = coalesce(estimate_expected, ((coalesce(estimate_low, 0) + coalesce(estimate_high, 0)) / 2))
where estimate_expected is null
  and (estimate_low is not null or estimate_high is not null);

-- Keep metadata null-safe.
update public.bathroom_generations
set metadata = '{}'::jsonb
where metadata is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bathroom_generations_status_chk'
      and conrelid = 'public.bathroom_generations'::regclass
  ) then
    alter table public.bathroom_generations
      add constraint bathroom_generations_status_chk
      check (status in ('completed', 'processing', 'failed'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Existing deployments may have generation_id FK to bathroom_generations already.
alter table public.leads
  add column if not exists generation_id uuid references public.bathroom_generations(id) on delete set null;

do $$
declare
  v_udt text;
begin
  select c.udt_name
  into v_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'leads'
    and c.column_name = 'session_id';

  if v_udt is null then
    alter table public.leads
      add column session_id text;
  elsif v_udt <> 'text' then
    alter table public.leads
      alter column session_id type text using session_id::text;
  end if;
end $$;

alter table public.leads
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists zip_code text,
  add column if not exists timeline text,
  add column if not exists budget_range text,
  add column if not exists project_notes text,
  add column if not exists selected_style text,
  add column if not exists uploaded_image_url text,
  add column if not exists generated_image_url text,
  add column if not exists estimate_low integer,
  add column if not exists estimate_expected integer,
  add column if not exists estimate_high integer,
  add column if not exists scope_of_work jsonb,
  add column if not exists contractor_notes text,
  add column if not exists status text not null default 'new',
  add column if not exists assigned_contractor_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Backfill normalized estimate fields from legacy columns when present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'estimate_min'
  ) then
    execute $sql$
      update public.leads
      set estimate_low = coalesce(estimate_low, estimate_min)
      where estimate_low is null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'estimate_max'
  ) then
    execute $sql$
      update public.leads
      set estimate_high = coalesce(estimate_high, estimate_max)
      where estimate_high is null
    $sql$;
  end if;
end $$;

update public.leads
set estimate_expected = coalesce(estimate_expected, ((coalesce(estimate_low, 0) + coalesce(estimate_high, 0)) / 2))
where estimate_expected is null
  and (estimate_low is not null or estimate_high is not null);

update public.leads
set metadata = '{}'::jsonb
where metadata is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_status_chk'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_status_chk
      check (status in ('new', 'reviewed', 'contacted', 'assigned', 'shared', 'closed', 'bad_fit'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- contractors
-- ---------------------------------------------------------------------------
create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  service_zip_codes text[] not null default '{}'::text[],
  active boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- leads.assigned_contractor_id FK (added after contractors table exists)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_assigned_contractor_id_fkey'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_assigned_contractor_id_fkey
      foreign key (assigned_contractor_id)
      references public.contractors(id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- lead_assignments
-- ---------------------------------------------------------------------------
create table if not exists public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  shared_by uuid references auth.users(id) on delete set null,
  shared_at timestamptz,
  status text not null default 'draft',
  contractor_viewed_at timestamptz,
  contractor_response text,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_assignments_status_chk'
      and conrelid = 'public.lead_assignments'::regclass
  ) then
    alter table public.lead_assignments
      add constraint lead_assignments_status_chk
      check (status in ('draft', 'shared', 'viewed', 'accepted', 'declined', 'expired'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_zip_code_idx on public.leads (zip_code);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_assigned_contractor_id_idx on public.leads (assigned_contractor_id);

create index if not exists bathroom_generations_created_at_idx on public.bathroom_generations (created_at desc);
create index if not exists bathroom_generations_session_id_idx on public.bathroom_generations (session_id);

create index if not exists contractors_active_idx on public.contractors (active);

create index if not exists lead_assignments_lead_id_idx on public.lead_assignments (lead_id);
create index if not exists lead_assignments_contractor_id_idx on public.lead_assignments (contractor_id);
create index if not exists lead_assignments_status_idx on public.lead_assignments (status);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.bathroom_generations enable row level security;
alter table public.leads enable row level security;
alter table public.contractors enable row level security;
alter table public.lead_assignments enable row level security;

-- Service role retains full admin/server access.
revoke all on table public.bathroom_generations from anon, authenticated;
revoke all on table public.leads from anon, authenticated;
revoke all on table public.contractors from anon, authenticated;
revoke all on table public.lead_assignments from anon, authenticated;

grant all on table public.bathroom_generations to service_role;
grant all on table public.leads to service_role;
grant all on table public.contractors to service_role;
grant all on table public.lead_assignments to service_role;

-- Placeholder contractor access model (future):
-- Contractors should eventually read only assigned leads via lead_assignments.
-- Policy scaffolding intentionally deferred to application auth model finalization.
