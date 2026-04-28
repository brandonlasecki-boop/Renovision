alter table public.renovision_anonymous_sessions
  add column if not exists attribution jsonb;

alter table public.homeowner_try_projects
  add column if not exists attribution jsonb;

alter table public.bathroom_generations
  add column if not exists attribution jsonb;

alter table public.renovision_saved_projects
  add column if not exists attribution jsonb;

alter table public.leads
  add column if not exists attribution jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    alter table public.profiles
      add column if not exists last_renovision_attribution jsonb;
  end if;
end $$;
