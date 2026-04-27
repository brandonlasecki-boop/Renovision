-- Renovision internal admin: profiles (is_admin), analytics events, remodeler requests,
-- project conversion tracking, and optional room kind for reporting.

-- ---------------------------------------------------------------------------
-- Profiles (1:1 auth.users) — admin flag + future homeowner fields
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_is_admin_idx on public.profiles (is_admin) where is_admin = true;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Server-side / service role only (no client reads until you add homeowner profile UX + RLS).
revoke all on table public.profiles from anon, authenticated;
grant all on table public.profiles to service_role;

-- Backfill existing auth users (idempotent)
insert into public.profiles (id, is_admin)
select id, false from auth.users
on conflict (id) do nothing;

-- New signups
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, is_admin)
  values (new.id, false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- ---------------------------------------------------------------------------
-- Homeowner try projects: conversion + room kind (defaults for /try bathroom flow)
-- ---------------------------------------------------------------------------
alter table public.homeowner_try_projects
  add column if not exists room_kind text not null default 'bathroom';

alter table public.homeowner_try_projects
  add column if not exists converted_from_anon_session_id uuid;

alter table public.homeowner_try_projects
  add column if not exists anon_converted_at timestamptz;

comment on column public.homeowner_try_projects.converted_from_anon_session_id is
  'Anonymous session id preserved when the project is claimed after signup (analytics).';

comment on column public.homeowner_try_projects.anon_converted_at is
  'Timestamp when an anonymous preview project was claimed by a signed-in user.';

create index if not exists homeowner_try_projects_converted_from_idx
  on public.homeowner_try_projects (converted_from_anon_session_id)
  where converted_from_anon_session_id is not null;

-- ---------------------------------------------------------------------------
-- Remodeler interest (homeowner /try — internal pipeline)
-- ---------------------------------------------------------------------------
create table if not exists public.renovision_remodeler_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  project_id uuid references public.homeowner_try_projects (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists renovision_remodeler_requests_created_idx
  on public.renovision_remodeler_requests (created_at desc);

create index if not exists renovision_remodeler_requests_user_idx
  on public.renovision_remodeler_requests (user_id);

alter table public.renovision_remodeler_requests enable row level security;

revoke all on table public.renovision_remodeler_requests from anon, authenticated;
grant all on table public.renovision_remodeler_requests to service_role;

-- ---------------------------------------------------------------------------
-- Append-only analytics events (Supabase + triggers; app may insert too)
-- ---------------------------------------------------------------------------
create table if not exists public.renovision_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  occurred_at timestamptz not null default now(),
  anonymous_session_id uuid references public.renovision_anonymous_sessions (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  project_id uuid references public.homeowner_try_projects (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists renovision_analytics_events_occurred_idx
  on public.renovision_analytics_events (occurred_at desc);

create index if not exists renovision_analytics_events_type_occurred_idx
  on public.renovision_analytics_events (event_type, occurred_at desc);

alter table public.renovision_analytics_events enable row level security;

revoke all on table public.renovision_analytics_events from anon, authenticated;
grant all on table public.renovision_analytics_events to service_role;

-- ---------------------------------------------------------------------------
-- Triggers: session + mockup → events
-- ---------------------------------------------------------------------------
create or replace function public.renovision_track_anon_session_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.renovision_analytics_events (event_type, anonymous_session_id, metadata)
  values ('anonymous_session_created', new.id, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists renovision_anon_session_created_event on public.renovision_anonymous_sessions;
create trigger renovision_anon_session_created_event
  after insert on public.renovision_anonymous_sessions
  for each row execute function public.renovision_track_anon_session_created();

create or replace function public.renovision_track_mockup_generated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_anon_id uuid;
begin
  select p.user_id, p.anonymous_session_id
  into v_user_id, v_anon_id
  from public.homeowner_try_projects p
  where p.id = new.project_id;

  insert into public.renovision_analytics_events (
    event_type,
    project_id,
    user_id,
    anonymous_session_id,
    metadata
  )
  values (
    'mockup_generated',
    new.project_id,
    v_user_id,
    v_anon_id,
    jsonb_build_object('mockup_generation', new.mockup_generation)
  );
  return new;
end;
$$;

drop trigger if exists renovision_mockup_generated_event on public.homeowner_try_mockups;
create trigger renovision_mockup_generated_event
  after insert on public.homeowner_try_mockups
  for each row execute function public.renovision_track_mockup_generated();
