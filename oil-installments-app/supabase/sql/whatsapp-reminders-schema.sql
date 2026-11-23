-- Apply only in a dedicated Supabase project for دفتر الزيت.
-- This SQL is a setup script; generate a timestamped migration with
-- `supabase migration new oil_whatsapp_reminders` before production rollout.

create table if not exists public.oil_customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone_e164 text,
  whatsapp_opt_in boolean not null default false,
  opt_in_at timestamptz,
  auto_whatsapp_reminders boolean not null default false,
  created_at timestamptz not null default now(),
  constraint oil_customers_phone_e164_chk
    check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint oil_customers_reminder_consent_chk
    check (not auto_whatsapp_reminders or
      (whatsapp_opt_in and opt_in_at is not null and phone_e164 is not null)),
  constraint oil_customers_id_owner_unique unique (id, owner_id)
);

create table if not exists public.oil_installments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint oil_installments_customer_owner_fk
    foreign key (customer_id, owner_id)
    references public.oil_customers(id, owner_id) on delete cascade,
  constraint oil_installments_customer_number_unique
    unique (customer_id, installment_number)
);

create index if not exists oil_installments_due_unpaid_idx
  on public.oil_installments (due_date) where paid = false;

create table if not exists public.oil_whatsapp_reminder_log (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.oil_installments(id) on delete cascade,
  reminder_date date not null,
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  meta_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint oil_whatsapp_reminder_once_per_day
    unique (installment_id, reminder_date)
);

alter table public.oil_customers enable row level security;
alter table public.oil_installments enable row level security;
alter table public.oil_whatsapp_reminder_log enable row level security;

drop policy if exists "Owners manage their oil customers" on public.oil_customers;
create policy "Owners manage their oil customers"
  on public.oil_customers for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners manage their oil installments" on public.oil_installments;
create policy "Owners manage their oil installments"
  on public.oil_installments for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Reminder logs are backend-only. No client policies are intentionally created.
revoke all on public.oil_whatsapp_reminder_log from anon, authenticated;
