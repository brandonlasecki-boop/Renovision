-- Reusable line-item presets per company (owner-only via RLS).

create table public.company_line_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  trade text not null default 'general',
  quantity numeric not null default 1,
  unit text not null default 'ea',
  notes text,
  default_unit_price_usd numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index company_line_templates_company_id_idx
  on public.company_line_templates (company_id, created_at desc);

create trigger company_line_templates_updated_at
  before update on public.company_line_templates
  for each row execute function public.set_updated_at();

alter table public.company_line_templates enable row level security;

create policy "company_line_templates_select_own"
  on public.company_line_templates for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "company_line_templates_insert_own"
  on public.company_line_templates for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "company_line_templates_update_own"
  on public.company_line_templates for update
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy "company_line_templates_delete_own"
  on public.company_line_templates for delete
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );
