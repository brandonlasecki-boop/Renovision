-- Link bid copies so the UI can list and switch between related quotes.

alter table public.bids add column if not exists quote_family_id uuid;

-- Each existing bid becomes its own family until linked by "copy quote".
update public.bids
set quote_family_id = id
where quote_family_id is null;

create index if not exists bids_company_quote_family_idx
  on public.bids (company_id, quote_family_id);
