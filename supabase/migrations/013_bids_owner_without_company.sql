-- Homeowner-focused flow: bids belong to auth.users (owner_id). company_id is optional (legacy contractor data).

alter table public.bids add column if not exists owner_id uuid references auth.users (id) on delete cascade;

update public.bids b
set owner_id = c.owner_id
from public.companies c
where b.company_id = c.id
  and b.owner_id is null;

do $$
begin
  if exists (select 1 from public.bids where owner_id is null) then
    raise exception 'Migration 013: bids.owner_id backfill failed — every bid must map to a company owner. Fix data then re-run.';
  end if;
end $$;

alter table public.bids alter column owner_id set not null;

alter table public.bids drop constraint if exists bids_company_id_fkey;

alter table public.bids alter column company_id drop not null;

alter table public.bids
  add constraint bids_company_id_fkey
  foreign key (company_id) references public.companies (id) on delete set null;

create index if not exists bids_owner_id_idx on public.bids (owner_id);
create index if not exists bids_owner_status_idx on public.bids (owner_id, status);

-- Bid ownership for RLS + storage helpers (no company join required).
create or replace function public.user_owns_bid(p_bid_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bids b
    where b.id = p_bid_id
      and b.owner_id = auth.uid()
  );
$$;

drop policy if exists "bids_select_own" on public.bids;
drop policy if exists "bids_insert_own" on public.bids;
drop policy if exists "bids_update_own" on public.bids;
drop policy if exists "bids_delete_own" on public.bids;

create policy "bids_select_own"
  on public.bids for select
  using (owner_id = auth.uid());

create policy "bids_insert_own"
  on public.bids for insert
  with check (owner_id = auth.uid());

create policy "bids_update_own"
  on public.bids for update
  using (owner_id = auth.uid());

create policy "bids_delete_own"
  on public.bids for delete
  using (owner_id = auth.uid());
