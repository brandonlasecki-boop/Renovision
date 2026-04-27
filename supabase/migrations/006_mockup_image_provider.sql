-- Which API produced each mockup (A/B testing OpenAI vs Vertex Gemini image).

alter table public.bid_photos
  add column if not exists mockup_image_provider text;

comment on column public.bid_photos.mockup_image_provider is
  'For kind after_mockup: openai | vertex_gemini — which backend generated this image.';
