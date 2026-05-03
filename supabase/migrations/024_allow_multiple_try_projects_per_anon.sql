-- Allow multiple /try preview rows per anonymous session (same as signed-in in 020).
-- The unique index caused inserts to fail once a second project was created for the same anon id.

drop index if exists public.homeowner_try_projects_one_per_anon;

create index if not exists homeowner_try_projects_anon_session_idx
  on public.homeowner_try_projects (anonymous_session_id)
  where anonymous_session_id is not null;

comment on table public.homeowner_try_projects is
  'Preview projects for Renovision /try; multiple rows per anonymous session or user.';
