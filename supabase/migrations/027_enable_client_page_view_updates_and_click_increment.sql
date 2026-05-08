-- Enable constrained client updates for analytics_page_views lifecycle fields.
-- Keeps analytics ingestion mostly insert-first while allowing active-row updates:
-- - max_scroll_depth
-- - click_count
-- - ended_at
-- - duration_seconds

grant update (ended_at, duration_seconds, max_scroll_depth, click_count)
  on table public.analytics_page_views
  to anon, authenticated;

drop policy if exists analytics_page_views_client_update on public.analytics_page_views;
create policy analytics_page_views_client_update
  on public.analytics_page_views
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- Atomic click increment to avoid lost updates under concurrent clicks.
create or replace function public.analytics_page_view_increment_click_count(p_page_view_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.analytics_page_views
  set click_count = coalesce(click_count, 0) + 1
  where id = p_page_view_id;
$$;

revoke all on function public.analytics_page_view_increment_click_count(uuid) from public;
grant execute on function public.analytics_page_view_increment_click_count(uuid) to anon, authenticated, service_role;
