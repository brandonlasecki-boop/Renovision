-- Allow signed-in users to have multiple distinct Renovision try projects.
-- Keep one-project-per-anonymous-session behavior unchanged.

drop index if exists public.homeowner_try_projects_one_per_user;
