alter table public.leads
  add column if not exists first_name text;

alter table public.leads
  add column if not exists last_name text;

alter table public.leads
  add column if not exists estimate_breakdown jsonb;

alter table public.leads
  add column if not exists estimate_detailed_breakdown jsonb;

alter table public.leads
  add column if not exists estimate_reasoning jsonb;

alter table public.leads
  add column if not exists estimate_assumptions jsonb;

alter table public.leads
  add column if not exists estimate_confidence text;
