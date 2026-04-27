-- Guided walkthrough: measurements, dictation, dynamic Q&A (SimplyWise-style flow).

alter table public.bids
  add column if not exists project_kind text not null default '';

alter table public.bids
  add column if not exists walkthrough_transcript text not null default '';

alter table public.bids
  add column if not exists room_measurements jsonb not null default '[]'::jsonb;

alter table public.bids
  add column if not exists project_questionnaire jsonb not null default '[]'::jsonb;

alter table public.bids
  add column if not exists walkthrough_completed_at timestamptz;

comment on column public.bids.project_kind is
  'e.g. bathroom, kitchen, basement, whole_home, exterior, other — drives AI questions.';

comment on column public.bids.walkthrough_transcript is
  'Voice / walkthrough notes from the job site (dictation).';

comment on column public.bids.room_measurements is
  'JSON array: [{ id, label, length_ft, width_ft, ceiling_ft? }, ...].';

comment on column public.bids.project_questionnaire is
  'JSON array: [{ question_id, question, answer }, ...] from dynamic follow-up questions.';
