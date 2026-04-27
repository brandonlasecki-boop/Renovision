-- Version each AI mockup (v1, v2, …) instead of replacing a single row.

alter table public.bid_photos
  add column if not exists mockup_generation int;

comment on column public.bid_photos.mockup_generation is
  'For kind after_mockup: 1-based generation number (v1, v2). Null for before photos.';

-- Backfill existing mockups: oldest per bid = v1, then v2, …
with ranked as (
  select
    id,
    row_number() over (partition by bid_id order by created_at asc) as rn
  from public.bid_photos
  where kind = 'after_mockup'
)
update public.bid_photos p
set mockup_generation = ranked.rn
from ranked
where p.id = ranked.id
  and p.mockup_generation is null;
