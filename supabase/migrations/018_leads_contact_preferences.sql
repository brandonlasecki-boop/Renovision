alter table public.leads
  add column if not exists preferred_contact_method text;

alter table public.leads
  add column if not exists best_contact_time text;
