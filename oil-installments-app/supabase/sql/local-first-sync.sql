-- Safe additive sync fields for the existing local-first app.
-- Apply only to a dedicated دفتر الزيت Supabase project after reviewing the base schema.

alter table public.oil_customers
  add column if not exists local_id text,
  add column if not exists sale_data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists oil_customers_owner_local_id_uidx
  on public.oil_customers(owner_id, local_id);

alter table public.oil_installments
  add column if not exists updated_at timestamptz not null default now();

-- Client access remains owner-scoped by the RLS policies in
-- whatsapp-reminders-schema.sql. Never grant service_role credentials to the app.

-- Explicit Data API privileges for authenticated users; RLS still scopes every row.
grant select, insert, update, delete on public.oil_customers to authenticated;
grant select, insert, update, delete on public.oil_installments to authenticated;
revoke all on public.oil_customers, public.oil_installments from anon;
