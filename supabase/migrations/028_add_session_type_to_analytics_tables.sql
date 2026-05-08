-- Separate admin traffic from customer traffic in analytics.
-- Defaults all existing and new rows to customer unless marked otherwise.

alter table public.analytics_sessions
  add column if not exists session_type text not null default 'customer';

alter table public.analytics_events
  add column if not exists session_type text not null default 'customer';

alter table public.analytics_page_views
  add column if not exists session_type text not null default 'customer';

update public.analytics_sessions
set session_type = 'admin'
where session_type <> 'admin'
  and (
    first_page like '/admin%'
    or last_page like '/admin%'
    or coalesce(metadata->>'page_path', '') like '/admin%'
  );

update public.analytics_events
set session_type = 'admin'
where session_type <> 'admin'
  and (
    page_path like '/admin%'
    or coalesce(metadata->>'page_path', '') like '/admin%'
  );

update public.analytics_page_views
set session_type = 'admin'
where session_type <> 'admin'
  and (
    page_path like '/admin%'
    or coalesce(metadata->>'page_path', '') like '/admin%'
  );

create index if not exists analytics_sessions_session_type_idx
  on public.analytics_sessions (session_type);
create index if not exists analytics_events_session_type_idx
  on public.analytics_events (session_type);
create index if not exists analytics_page_views_session_type_idx
  on public.analytics_page_views (session_type);
