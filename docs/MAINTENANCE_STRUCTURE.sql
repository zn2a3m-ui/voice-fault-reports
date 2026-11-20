-- Mill maintenance structure (owner-scoped)
-- Lines: 6000, 4000, and shared. Departments are editable; equipment is added by the user.
create table if not exists public.maintenance_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null check (code in ('line_6000','line_4000','shared')),
  name text not null,
  capacity numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, code)
);
create table if not exists public.maintenance_departments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  line_id uuid not null references public.maintenance_lines(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, line_id, name)
);
create table if not exists public.maintenance_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid not null references public.maintenance_departments(id) on delete cascade,
  name text not null,
  asset_code text,
  manufacturer text,
  model text,
  serial_number text,
  location_note text,
  status text not null default 'operational' check (status in ('operational','fault','maintenance','stopped','inactive')),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, department_id, name)
);
create table if not exists public.maintenance_fault_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid not null references public.maintenance_departments(id) on delete cascade,
  equipment_id uuid references public.maintenance_equipment(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.maintenance_records
  add column if not exists line_id uuid references public.maintenance_lines(id) on delete set null,
  add column if not exists department_id uuid references public.maintenance_departments(id) on delete set null,
  add column if not exists equipment_id uuid references public.maintenance_equipment(id) on delete set null,
  add column if not exists fault_catalog_id uuid references public.maintenance_fault_catalog(id) on delete set null,
  add column if not exists handover_group_id uuid;
create index if not exists maintenance_departments_user_line_idx on public.maintenance_departments(user_id,line_id,sort_order);
create index if not exists maintenance_equipment_user_department_idx on public.maintenance_equipment(user_id,department_id,is_active);
create index if not exists maintenance_fault_catalog_user_department_idx on public.maintenance_fault_catalog(user_id,department_id,is_active);
create index if not exists maintenance_records_equipment_created_idx on public.maintenance_records(user_id,equipment_id,created_at desc);
create index if not exists maintenance_records_handover_group_idx on public.maintenance_records(user_id,handover_group_id);
create index if not exists maintenance_departments_line_id_idx on public.maintenance_departments(line_id);
create index if not exists maintenance_equipment_department_id_idx on public.maintenance_equipment(department_id);
create index if not exists maintenance_fault_catalog_department_id_idx on public.maintenance_fault_catalog(department_id);
create index if not exists maintenance_fault_catalog_equipment_id_idx on public.maintenance_fault_catalog(equipment_id);
create index if not exists maintenance_records_line_id_idx on public.maintenance_records(line_id);
create index if not exists maintenance_records_department_id_idx on public.maintenance_records(department_id);
create index if not exists maintenance_records_equipment_id_idx on public.maintenance_records(equipment_id);
create index if not exists maintenance_records_fault_catalog_id_idx on public.maintenance_records(fault_catalog_id);
do $$
declare t text;
begin
 foreach t in array array['maintenance_lines','maintenance_departments','maintenance_equipment','maintenance_fault_catalog'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('drop policy if exists "Users manage their %I" on public.%I',t,t);
   execute format('create policy "Users manage their %I" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t,t);
   execute format('grant select, insert, update, delete on public.%I to authenticated',t);
 end loop;
end $$;
grant select, insert, update, delete on public.maintenance_records to authenticated;
