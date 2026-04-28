-- One-time reset: clear existing Renovision mockup history.
-- WARNING: destructive/irreversible data wipe for historical preview data.

begin;

-- Dependent rows first
delete from public.renovision_saved_projects;
delete from public.leads;
delete from public.bathroom_generations;
delete from public.homeowner_try_mockups;

-- Project-level history
delete from public.renovision_analytics_events
where project_id is not null;
delete from public.renovision_remodeler_requests
where project_id is not null;
delete from public.homeowner_try_projects;

commit;
