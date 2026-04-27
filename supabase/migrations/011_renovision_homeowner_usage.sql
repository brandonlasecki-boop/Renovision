-- Renovision homeowner try flow: anonymous session limits + signed-in free pool

create table if not exists public.renovision_anonymous_sessions (
  id uuid primary key default gen_random_uuid(),
  initial_generations_used int not null default 0,
  regenerations_used int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renovision_anon_initial_chk check (initial_generations_used >= 0 and initial_generations_used <= 1),
  constraint renovision_anon_regen_chk check (regenerations_used >= 0 and regenerations_used <= 3)
);

create table if not exists public.renovision_user_generation_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  signed_in_free_used int not null default 0,
  updated_at timestamptz not null default now(),
  constraint renovision_user_free_chk check (signed_in_free_used >= 0 and signed_in_free_used <= 5)
);

create table if not exists public.homeowner_try_projects (
  id uuid primary key default gen_random_uuid(),
  anonymous_session_id uuid references public.renovision_anonymous_sessions (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  before_storage_path text not null,
  scope_description text not null default '',
  ai_summary text,
  material_estimate jsonb not null default '[]'::jsonb,
  ai_status public.bid_ai_status not null default 'idle',
  ai_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists homeowner_try_projects_one_per_anon
  on public.homeowner_try_projects (anonymous_session_id)
  where anonymous_session_id is not null;

create unique index if not exists homeowner_try_projects_one_per_user
  on public.homeowner_try_projects (user_id)
  where user_id is not null;

create index if not exists homeowner_try_projects_user_id_idx on public.homeowner_try_projects (user_id);

create table if not exists public.homeowner_try_mockups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.homeowner_try_projects (id) on delete cascade,
  mockup_generation int not null,
  storage_path text not null,
  caption text,
  mockup_generation_meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists homeowner_try_mockups_project_id_idx
  on public.homeowner_try_mockups (project_id);

-- Read/change only via service role in app; block direct client access
alter table public.renovision_anonymous_sessions enable row level security;
alter table public.renovision_user_generation_usage enable row level security;
alter table public.homeowner_try_projects enable row level security;
alter table public.homeowner_try_mockups enable row level security;

create trigger renovision_anon_sessions_updated_at
  before update on public.renovision_anonymous_sessions
  for each row execute function public.set_updated_at();

create trigger renovision_user_gen_usage_updated_at
  before update on public.renovision_user_generation_usage
  for each row execute function public.set_updated_at();

create trigger homeowner_try_projects_updated_at
  before update on public.homeowner_try_projects
  for each row execute function public.set_updated_at();

comment on table public.renovision_anonymous_sessions is
  'Server-side usage for anonymous Renovision /try sessions (cookie id = id).';

comment on table public.renovision_user_generation_usage is
  'Free signed-in generation pool for Renovision homeowner previews (extend later for paid credits).';

comment on table public.homeowner_try_projects is
  'Single preview project per anonymous session or per user for /try.';

-- Atomic usage bumps (service role / RPC only — not granted to anon/authenticated)
create or replace function public.renovision_bump_anonymous_initial(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.renovision_anonymous_sessions
  set
    initial_generations_used = initial_generations_used + 1,
    updated_at = now()
  where id = p_id and initial_generations_used < 1;
  return found;
end;
$$;

create or replace function public.renovision_bump_anonymous_regeneration(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.renovision_anonymous_sessions
  set
    regenerations_used = regenerations_used + 1,
    updated_at = now()
  where id = p_id
    and initial_generations_used >= 1
    and regenerations_used < 3;
  return found;
end;
$$;

create or replace function public.renovision_bump_signed_in_free(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.renovision_user_generation_usage (user_id, signed_in_free_used)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.renovision_user_generation_usage
  set
    signed_in_free_used = signed_in_free_used + 1,
    updated_at = now()
  where user_id = p_user_id and signed_in_free_used < 5;
  return found;
end;
$$;

revoke all on function public.renovision_bump_anonymous_initial(uuid) from public;
revoke all on function public.renovision_bump_anonymous_regeneration(uuid) from public;
revoke all on function public.renovision_bump_signed_in_free(uuid) from public;
grant execute on function public.renovision_bump_anonymous_initial(uuid) to service_role;
grant execute on function public.renovision_bump_anonymous_regeneration(uuid) to service_role;
grant execute on function public.renovision_bump_signed_in_free(uuid) to service_role;
