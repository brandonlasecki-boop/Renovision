create table if not exists public.renovision_saved_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.homeowner_try_projects (id) on delete cascade,
  generation_id uuid,
  before_storage_path text,
  generated_storage_path text,
  selected_style text,
  estimate_min integer,
  estimate_max integer,
  zip_code text,
  lead_id uuid,
  status text not null default 'saved' check (status in ('saved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id)
);

create index if not exists renovision_saved_projects_user_created_idx
  on public.renovision_saved_projects (user_id, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'bathroom_generations'
  ) then
    alter table public.renovision_saved_projects
      add constraint renovision_saved_projects_generation_fk
      foreign key (generation_id) references public.bathroom_generations (id) on delete set null;
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'leads'
  ) then
    alter table public.renovision_saved_projects
      add constraint renovision_saved_projects_lead_fk
      foreign key (lead_id) references public.leads (id) on delete set null;
  end if;
exception
  when duplicate_object then null;
end $$;

drop trigger if exists renovision_saved_projects_updated_at on public.renovision_saved_projects;
create trigger renovision_saved_projects_updated_at
  before update on public.renovision_saved_projects
  for each row execute function public.set_updated_at();

alter table public.renovision_saved_projects enable row level security;

revoke all on table public.renovision_saved_projects from anon, authenticated;
grant all on table public.renovision_saved_projects to service_role;
