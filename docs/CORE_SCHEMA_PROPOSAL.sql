-- PROPOSAL ONLY — do not run against production until reviewed and backed up.
-- Core v1 schema for asset registry, durable work orders, event history and shift handover.
-- Existing tables and rows are intentionally left untouched.

begin;

create table if not exists public.maintenance_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  asset_code text,
  name text not null,
  area text,
  line_name text,
  manufacturer text,
  model text,
  serial_number text,
  criticality text not null default 'medium'
    check (criticality in ('low','medium','high','critical')),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index if not exists maintenance_assets_user_code_uidx
  on public.maintenance_assets(user_id, asset_code)
  where asset_code is not null and asset_code <> '';

create table if not exists public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  work_order_no bigint generated always as identity,
  legacy_record_id uuid references public.maintenance_records(id) on delete set null,
  asset_id uuid,
  order_type text not null default 'corrective'
    check (order_type in ('corrective','preventive','inspection')),
  title text not null,
  original_description text not null,
  polished_description text,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  status text not null default 'new'
    check (status in ('new','inspection','in_progress','waiting_parts','waiting_external','repaired_pending_verification','closed','cancelled')),
  assigned_to text,
  reported_at timestamptz not null default now(),
  started_at timestamptz,
  repaired_at timestamptz,
  closed_at timestamptz,
  downtime_minutes numeric check (downtime_minutes is null or downtime_minutes >= 0),
  resolution_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, work_order_no),
  constraint maintenance_work_orders_asset_owner_fk
    foreign key (asset_id, user_id)
    references public.maintenance_assets(id, user_id)
    on delete restrict
);

create index if not exists maintenance_work_orders_user_status_idx
  on public.maintenance_work_orders(user_id, status, priority, reported_at desc);
create index if not exists maintenance_work_orders_asset_idx
  on public.maintenance_work_orders(asset_id, reported_at desc);
create index if not exists maintenance_work_orders_legacy_idx
  on public.maintenance_work_orders(legacy_record_id)
  where legacy_record_id is not null;

create table if not exists public.maintenance_work_order_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  work_order_id uuid not null,
  event_type text not null
    check (event_type in ('reported','assigned','status_changed','inspection','diagnosis_note','action_taken','part_requested','shift_handover','repair_recorded','verification','comment','attachment')),
  event_text text not null default '',
  from_status text,
  to_status text,
  actor_label text,
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint work_order_events_owner_fk
    foreign key (work_order_id, user_id)
    references public.maintenance_work_orders(id, user_id)
    on delete restrict
);
create index if not exists maintenance_work_order_events_timeline_idx
  on public.maintenance_work_order_events(work_order_id, event_at, created_at);

create table if not exists public.maintenance_handover_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  handover_date date not null default current_date,
  from_shift text not null,
  to_shift text not null,
  handed_over_by text,
  received_by text,
  summary text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists maintenance_handover_batches_user_date_idx
  on public.maintenance_handover_batches(user_id, handover_date desc);

create table if not exists public.maintenance_handover_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  handover_batch_id uuid not null,
  work_order_id uuid not null,
  handover_note text not null default '',
  pending_action text not null default '',
  received boolean not null default false,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  constraint handover_items_batch_owner_fk
    foreign key (handover_batch_id, user_id)
    references public.maintenance_handover_batches(id, user_id)
    on delete cascade,
  constraint handover_items_order_owner_fk
    foreign key (work_order_id, user_id)
    references public.maintenance_work_orders(id, user_id)
    on delete restrict,
  unique (handover_batch_id, work_order_id)
);
create index if not exists maintenance_handover_items_order_idx
  on public.maintenance_handover_items(work_order_id, created_at desc);

alter table public.maintenance_assets enable row level security;
alter table public.maintenance_work_orders enable row level security;
alter table public.maintenance_work_order_events enable row level security;
alter table public.maintenance_handover_batches enable row level security;
alter table public.maintenance_handover_items enable row level security;

drop policy if exists "Users manage their maintenance assets" on public.maintenance_assets;
create policy "Users manage their maintenance assets"
  on public.maintenance_assets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their maintenance work orders" on public.maintenance_work_orders;
create policy "Users manage their maintenance work orders"
  on public.maintenance_work_orders for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their maintenance work order events" on public.maintenance_work_order_events;
create policy "Users manage their maintenance work order events"
  on public.maintenance_work_order_events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their maintenance handover batches" on public.maintenance_handover_batches;
create policy "Users manage their maintenance handover batches"
  on public.maintenance_handover_batches for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their maintenance handover items" on public.maintenance_handover_items;
create policy "Users manage their maintenance handover items"
  on public.maintenance_handover_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
