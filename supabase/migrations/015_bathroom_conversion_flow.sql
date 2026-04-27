create table if not exists public.bathroom_generations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid references public.renovision_anonymous_sessions (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  project_id uuid references public.homeowner_try_projects (id) on delete set null,
  selected_style text not null,
  user_description text,
  uploaded_image_url text not null,
  generated_image_url text,
  estimate_min int not null,
  estimate_max int not null,
  refinements_used int not null default 0,
  selected_variation text,
  refinements_selected jsonb not null default '[]'::jsonb,
  lead_submitted boolean not null default false
);

create index if not exists bathroom_generations_created_at_idx
  on public.bathroom_generations (created_at desc);

create index if not exists bathroom_generations_session_id_idx
  on public.bathroom_generations (session_id);

create index if not exists bathroom_generations_user_id_idx
  on public.bathroom_generations (user_id);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  generation_id uuid references public.bathroom_generations (id) on delete set null,
  name text not null,
  email text not null,
  phone text not null,
  zip_code text not null,
  timeline text not null,
  budget_range text not null,
  project_notes text,
  selected_style text not null,
  estimate_min int not null,
  estimate_max int not null
);

create index if not exists leads_created_at_idx
  on public.leads (created_at desc);

create index if not exists leads_generation_id_idx
  on public.leads (generation_id);

alter table public.bathroom_generations enable row level security;
alter table public.leads enable row level security;

revoke all on table public.bathroom_generations from anon, authenticated;
grant all on table public.bathroom_generations to service_role;

revoke all on table public.leads from anon, authenticated;
grant all on table public.leads to service_role;
