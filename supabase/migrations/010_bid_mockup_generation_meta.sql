-- Prompt + context for each mockup generation (admin analytics, debugging).

alter table public.bid_photos
  add column if not exists mockup_generation_meta jsonb;

comment on column public.bid_photos.mockup_generation_meta is
  'For kind after_mockup: prompts and scope snapshot for this generation (initial + regenerations).';
