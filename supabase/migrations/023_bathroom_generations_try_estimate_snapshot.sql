-- Full /try cost estimate (breakdown, tweak suggestions) after deferred OpenAI vision pass
alter table public.bathroom_generations
  add column if not exists try_estimate_snapshot jsonb;
