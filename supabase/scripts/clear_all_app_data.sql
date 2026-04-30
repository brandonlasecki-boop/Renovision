-- =============================================================================
-- Reset app data + all Auth users except one admin account.
-- Run in Supabase Dashboard → SQL Editor (postgres role).
--
-- Prefer the CLI (uses .env.local; no SQL Editor):
--   npm run storage:empty-project-photos && npm run clear:app-data
--
-- Or manually: (1) npm run storage:empty-project-photos
-- (2) Set v_admin_email below, then run this block in SQL Editor.
--
-- Clear browser site data for your app origin if you want a clean client state.
-- =============================================================================

do $$
declare
  -- Matches ADMIN_EMAILS in .env.local:
  v_admin_email text := 'brandon@brandonlasecki.dev';

  v_admin_id uuid;
begin
  select u.id
    into strict v_admin_id
  from auth.users u
  where lower(trim(u.email)) = lower(trim(v_admin_email));

  truncate table
    public.leads,
    public.renovision_saved_projects,
    public.homeowner_try_mockups,
    public.bathroom_generations,
    public.renovision_analytics_events,
    public.renovision_remodeler_requests,
    public.homeowner_try_projects,
    public.renovision_anonymous_sessions,
    public.renovision_user_generation_usage,
    public.bid_photos,
    public.bids,
    public.project_updates,
    public.project_photos,
    public.projects,
    public.company_line_templates,
    public.companies
  restart identity cascade;

  delete from public.profiles
  where id <> v_admin_id;

  insert into public.profiles (id, is_admin)
  values (v_admin_id, true)
  on conflict (id) do update
    set is_admin = excluded.is_admin,
        updated_at = now();

  delete from auth.users
  where id <> v_admin_id;
exception
  when no_data_found then
    raise exception
      'No auth user found for email %. Create that user first or fix v_admin_email.',
      v_admin_email;
  when too_many_rows then
    raise exception 'Multiple auth users matched email %.', v_admin_email;
end $$;
