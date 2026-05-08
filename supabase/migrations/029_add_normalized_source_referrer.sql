-- Normalize source attribution for analytics traffic reporting.

alter table public.analytics_sessions
  add column if not exists normalized_source text,
  add column if not exists normalized_referrer text;

alter table public.analytics_events
  add column if not exists normalized_source text,
  add column if not exists normalized_referrer text;

alter table public.analytics_page_views
  add column if not exists normalized_source text,
  add column if not exists normalized_referrer text;

create index if not exists analytics_sessions_normalized_source_idx
  on public.analytics_sessions (normalized_source);
create index if not exists analytics_events_normalized_source_idx
  on public.analytics_events (normalized_source);
create index if not exists analytics_page_views_normalized_source_idx
  on public.analytics_page_views (normalized_source);

with sessions_with_hosts as (
  select
    id,
    lower(nullif(trim(utm_source), '')) as utm_source_norm,
    lower(nullif(trim(referrer), '')) as referrer_norm,
    lower(nullif(trim(metadata->>'current_host'), '')) as current_host_norm,
    lower(
      nullif(
        regexp_replace(
          split_part(split_part(coalesce(referrer, ''), '//', 2), '/', 1),
          ':\d+$',
          ''
        ),
        ''
      )
    ) as ref_host_norm
  from public.analytics_sessions
)
update public.analytics_sessions s
set
  normalized_source = case
    when x.utm_source_norm is not null then x.utm_source_norm
    when x.referrer_norm is null then 'direct'
    when x.ref_host_norm in ('localhost', '127.0.0.1', '::1') then 'local_dev'
    when x.current_host_norm is not null and x.ref_host_norm = x.current_host_norm then 'internal'
    else coalesce(x.ref_host_norm, 'direct')
  end,
  normalized_referrer = case
    when x.ref_host_norm is null then null
    else x.ref_host_norm
  end
from sessions_with_hosts x
where s.id = x.id
  and (s.normalized_source is null or s.normalized_referrer is null);

with events_with_hosts as (
  select
    id,
    lower(nullif(trim(metadata->>'utm_source'), '')) as utm_source_norm,
    lower(nullif(trim(referrer), '')) as referrer_norm,
    lower(nullif(trim(metadata->>'current_host'), '')) as current_host_norm,
    lower(
      nullif(
        regexp_replace(
          split_part(split_part(coalesce(referrer, ''), '//', 2), '/', 1),
          ':\d+$',
          ''
        ),
        ''
      )
    ) as ref_host_norm
  from public.analytics_events
)
update public.analytics_events e
set
  normalized_source = case
    when x.utm_source_norm is not null then x.utm_source_norm
    when x.referrer_norm is null then 'direct'
    when x.ref_host_norm in ('localhost', '127.0.0.1', '::1') then 'local_dev'
    when x.current_host_norm is not null and x.ref_host_norm = x.current_host_norm then 'internal'
    else coalesce(x.ref_host_norm, 'direct')
  end,
  normalized_referrer = case
    when x.ref_host_norm is null then null
    else x.ref_host_norm
  end
from events_with_hosts x
where e.id = x.id
  and (e.normalized_source is null or e.normalized_referrer is null);

with page_views_with_hosts as (
  select
    id,
    lower(nullif(trim(metadata->>'utm_source'), '')) as utm_source_norm,
    lower(nullif(trim(referrer), '')) as referrer_norm,
    lower(nullif(trim(metadata->>'current_host'), '')) as current_host_norm,
    lower(
      nullif(
        regexp_replace(
          split_part(split_part(coalesce(referrer, ''), '//', 2), '/', 1),
          ':\d+$',
          ''
        ),
        ''
      )
    ) as ref_host_norm
  from public.analytics_page_views
)
update public.analytics_page_views pv
set
  normalized_source = case
    when x.utm_source_norm is not null then x.utm_source_norm
    when x.referrer_norm is null then 'direct'
    when x.ref_host_norm in ('localhost', '127.0.0.1', '::1') then 'local_dev'
    when x.current_host_norm is not null and x.ref_host_norm = x.current_host_norm then 'internal'
    else coalesce(x.ref_host_norm, 'direct')
  end,
  normalized_referrer = case
    when x.ref_host_norm is null then null
    else x.ref_host_norm
  end
from page_views_with_hosts x
where pv.id = x.id
  and (pv.normalized_source is null or pv.normalized_referrer is null);
