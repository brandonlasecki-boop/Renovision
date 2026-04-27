-- Optional floor plan / blueprint file per bid (first-step capture).

alter table public.bids
  add column if not exists blueprint_storage_path text;

comment on column public.bids.blueprint_storage_path is
  'Storage path in project-photos for an uploaded blueprint or plan (PDF or image).';
