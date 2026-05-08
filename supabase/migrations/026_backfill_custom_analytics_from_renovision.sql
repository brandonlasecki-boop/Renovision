-- Backfill new custom analytics tables from existing Renovision data.
-- Idempotent: uses NOT EXISTS checks + session-level merge updates.
-- Marks imported rows with metadata.backfilled = true.

-- ---------------------------------------------------------------------------
-- 1) Backfill sessions from anonymous sessions + projects + events
-- ---------------------------------------------------------------------------
with base as (
  select
    s.id as anon_id,
    s.created_at as session_created_at,
    coalesce(
      nullif(trim(p.attribution ->> 'landing_url'), ''),
      nullif(trim(g.attribution ->> 'landing_url'), ''),
      nullif(trim(l.attribution ->> 'landing_url'), ''),
      nullif(trim(pr.last_renovision_attribution ->> 'landing_url'), '')
    ) as landing_url,
    coalesce(
      nullif(trim(p.attribution ->> 'referrer'), ''),
      nullif(trim(g.attribution ->> 'referrer'), ''),
      nullif(trim(l.attribution ->> 'referrer'), ''),
      nullif(trim(pr.last_renovision_attribution ->> 'referrer'), '')
    ) as referrer,
    coalesce(
      nullif(trim(p.attribution ->> 'source'), ''),
      nullif(trim(g.attribution ->> 'source'), ''),
      nullif(trim(l.attribution ->> 'source'), ''),
      nullif(trim(pr.last_renovision_attribution ->> 'source'), '')
    ) as utm_source,
    coalesce(
      nullif(trim(p.attribution ->> 'campaign'), ''),
      nullif(trim(g.attribution ->> 'campaign'), ''),
      nullif(trim(l.attribution ->> 'campaign'), ''),
      nullif(trim(pr.last_renovision_attribution ->> 'campaign'), '')
    ) as utm_campaign,
    coalesce(p.user_id, g.user_id, r.user_id) as user_id
  from public.renovision_anonymous_sessions s
  left join lateral (
    select p.*
    from public.homeowner_try_projects p
    where p.anonymous_session_id = s.id
    order by p.created_at desc
    limit 1
  ) p on true
  left join lateral (
    select g.*
    from public.bathroom_generations g
    where g.session_id = s.id
    order by g.created_at desc
    limit 1
  ) g on true
  left join lateral (
    select l.*
    from public.leads l
    where l.generation_id = g.id
    order by l.created_at desc
    limit 1
  ) l on true
  left join public.renovision_remodeler_requests r
    on r.project_id = p.id
  left join public.profiles pr
    on pr.id = coalesce(p.user_id, g.user_id, r.user_id)
),
prepared as (
  select
    anon_id::text as session_id_text,
    session_created_at,
    case
      when landing_url ilike 'http%' then regexp_replace(landing_url, '^https?://[^/]+', '')
      else '/try'
    end as first_page,
    case
      when landing_url ilike 'http%' then regexp_replace(landing_url, '^https?://[^/]+', '')
      else '/try'
    end as last_page,
    nullif(referrer, '') as referrer,
    nullif(utm_source, '') as utm_source,
    nullif(utm_campaign, '') as utm_campaign,
    user_id
  from base
)
insert into public.analytics_sessions (
  created_at,
  last_seen_at,
  session_id,
  first_page,
  last_page,
  referrer,
  utm_source,
  utm_campaign,
  user_id,
  metadata
)
select
  p.session_created_at,
  p.session_created_at,
  p.session_id_text,
  coalesce(nullif(p.first_page, ''), '/try'),
  coalesce(nullif(p.last_page, ''), '/try'),
  p.referrer,
  p.utm_source,
  p.utm_campaign,
  p.user_id,
  jsonb_build_object('backfilled', true, 'source', 'renovision_anonymous_sessions')
from prepared p
where not exists (
  select 1 from public.analytics_sessions a where a.session_id = p.session_id_text
);

-- Backfill signed-in sessions based on user-level events (when anon session is null)
with user_events as (
  select
    e.user_id,
    min(e.occurred_at) as first_seen_at,
    max(e.occurred_at) as last_seen_at
  from public.renovision_analytics_events e
  where e.user_id is not null
    and e.anonymous_session_id is null
  group by e.user_id
),
prepared as (
  select
    concat('user-', ue.user_id::text) as session_id_text,
    ue.first_seen_at as created_at,
    ue.last_seen_at as last_seen_at,
    '/try'::text as first_page,
    '/try'::text as last_page,
    ue.user_id
  from user_events ue
)
insert into public.analytics_sessions (
  created_at,
  last_seen_at,
  session_id,
  first_page,
  last_page,
  user_id,
  metadata
)
select
  p.created_at,
  p.last_seen_at,
  p.session_id_text,
  p.first_page,
  p.last_page,
  p.user_id,
  jsonb_build_object('backfilled', true, 'source', 'renovision_user_events')
from prepared p
where not exists (
  select 1 from public.analytics_sessions a where a.session_id = p.session_id_text
);

-- ---------------------------------------------------------------------------
-- 2) Backfill events from renovision_analytics_events
-- ---------------------------------------------------------------------------
with mapped as (
  select
    e.id as legacy_event_id,
    e.occurred_at as created_at,
    case
      when e.anonymous_session_id is not null then e.anonymous_session_id::text
      when e.user_id is not null then concat('user-', e.user_id::text)
      else null
    end as session_id_text,
    e.user_id,
    case
      when e.event_type = 'home_page_view' then 'landing_page_viewed'
      when e.event_type = 'try_page_view' then 'page_viewed'
      else e.event_type
    end as event_name,
    case
      when e.event_type = 'home_page_view' then '/'
      when e.event_type = 'try_page_view' then '/try'
      else '/try'
    end as page_path,
    e.metadata
  from public.renovision_analytics_events e
)
insert into public.analytics_events (
  created_at,
  session_id,
  user_id,
  event_name,
  page_path,
  metadata
)
select
  m.created_at,
  m.session_id_text,
  m.user_id,
  m.event_name,
  m.page_path,
  coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object('backfilled', true, 'legacy_event_id', m.legacy_event_id::text)
from mapped m
where m.session_id_text is not null
  and not exists (
    select 1
    from public.analytics_events a
    where a.session_id = m.session_id_text
      and a.created_at = m.created_at
      and a.event_name = m.event_name
      and coalesce(a.metadata ->> 'legacy_event_id', '') = m.legacy_event_id::text
  );

-- ---------------------------------------------------------------------------
-- 3) Backfill page views (derived from page-view events)
-- ---------------------------------------------------------------------------
with page_events as (
  select
    e.id as legacy_event_id,
    e.occurred_at as created_at,
    case
      when e.anonymous_session_id is not null then e.anonymous_session_id::text
      when e.user_id is not null then concat('user-', e.user_id::text)
      else null
    end as session_id_text,
    case
      when e.event_type = 'home_page_view' then '/'
      when e.event_type = 'try_page_view' then '/try'
      else '/try'
    end as page_path
  from public.renovision_analytics_events e
  where e.event_type in ('home_page_view', 'try_page_view')
)
insert into public.analytics_page_views (
  created_at,
  session_id,
  page_path,
  metadata
)
select
  p.created_at,
  p.session_id_text,
  p.page_path,
  jsonb_build_object('backfilled', true, 'legacy_event_id', p.legacy_event_id::text)
from page_events p
where p.session_id_text is not null
  and not exists (
    select 1
    from public.analytics_page_views a
    where a.session_id = p.session_id_text
      and a.created_at = p.created_at
      and a.page_path = p.page_path
      and coalesce(a.metadata ->> 'legacy_event_id', '') = p.legacy_event_id::text
  );

-- ---------------------------------------------------------------------------
-- 4) Enrich sessions with more accurate last_seen_at and last_page
-- ---------------------------------------------------------------------------
with latest as (
  select
    a.session_id,
    max(a.created_at) as last_seen_at
  from public.analytics_events a
  group by a.session_id
),
latest_page as (
  select distinct on (a.session_id)
    a.session_id,
    a.page_path
  from public.analytics_events a
  where a.page_path is not null
  order by a.session_id, a.created_at desc
)
update public.analytics_sessions s
set
  last_seen_at = coalesce(l.last_seen_at, s.last_seen_at),
  last_page = coalesce(lp.page_path, s.last_page)
from latest l
left join latest_page lp on lp.session_id = l.session_id
where s.session_id = l.session_id;
