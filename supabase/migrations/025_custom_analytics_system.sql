-- Custom analytics system: sessions, events, and page views.
-- Client (anon/authenticated) can only INSERT analytics rows.
-- Reads remain restricted to service role / admin backend usage.

create table if not exists public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  session_id text not null unique,
  first_page text,
  last_page text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_type text,
  browser text,
  os text,
  country text,
  region text,
  city text,
  ip_hash text,
  user_id uuid references auth.users (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  event_name text not null,
  page_path text,
  page_title text,
  referrer text,
  element_id text,
  element_text text,
  element_type text,
  scroll_depth integer,
  time_on_page_seconds integer,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.analytics_page_views (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  session_id text not null,
  page_path text not null,
  page_title text,
  referrer text,
  duration_seconds integer,
  max_scroll_depth integer not null default 0,
  click_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_session_id_idx
  on public.analytics_events (session_id);
create index if not exists analytics_events_event_name_idx
  on public.analytics_events (event_name);
create index if not exists analytics_events_page_path_idx
  on public.analytics_events (page_path);

create index if not exists analytics_page_views_session_id_idx
  on public.analytics_page_views (session_id);
create index if not exists analytics_page_views_page_path_idx
  on public.analytics_page_views (page_path);
create index if not exists analytics_page_views_created_at_idx
  on public.analytics_page_views (created_at desc);

create index if not exists analytics_sessions_session_id_idx
  on public.analytics_sessions (session_id);
create index if not exists analytics_sessions_created_at_idx
  on public.analytics_sessions (created_at desc);

alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_page_views enable row level security;

-- Remove broad permissions from client roles; allow service role full control.
revoke all on table public.analytics_sessions from anon, authenticated;
revoke all on table public.analytics_events from anon, authenticated;
revoke all on table public.analytics_page_views from anon, authenticated;

grant all on table public.analytics_sessions to service_role;
grant all on table public.analytics_events to service_role;
grant all on table public.analytics_page_views to service_role;

-- Client-side ingestion: insert-only, no reads/updates/deletes.
grant insert on table public.analytics_sessions to anon, authenticated;
grant insert on table public.analytics_events to anon, authenticated;
grant insert on table public.analytics_page_views to anon, authenticated;

drop policy if exists analytics_sessions_insert_only on public.analytics_sessions;
create policy analytics_sessions_insert_only
  on public.analytics_sessions
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists analytics_events_insert_only on public.analytics_events;
create policy analytics_events_insert_only
  on public.analytics_events
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists analytics_page_views_insert_only on public.analytics_page_views;
create policy analytics_page_views_insert_only
  on public.analytics_page_views
  for insert
  to anon, authenticated
  with check (true);
