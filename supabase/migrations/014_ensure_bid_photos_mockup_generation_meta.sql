-- Ensures bid_photos.mockup_generation_meta exists (fixes "column not found in schema cache"
-- when 010 was skipped or PostgREST cache is stale). Safe to re-run.

alter table public.bid_photos
  add column if not exists mockup_generation_meta jsonb;

comment on column public.bid_photos.mockup_generation_meta is
  'For kind after_mockup: prompts and scope snapshot for this generation (initial + regenerations).';

-- Ask PostgREST to reload schema (Supabase API layer)
notify pgrst, 'reload schema';
