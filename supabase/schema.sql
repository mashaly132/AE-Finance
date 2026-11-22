-- AE Finance v1.0 - Supabase PostgreSQL schema
-- Apply in Supabase SQL Editor. This schema is a starter; configure production Auth/RLS
-- before exposing the project to real customer financial data.

create extension if not exists pgcrypto;

create table if not exists public.engineers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_name text,
  phone text,
  address text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.engineers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  transaction_type text not null check (transaction_type in ('expense','deposit')),
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  description text not null,
  notes text,
  expense_category_id uuid references public.expense_categories(id),
  expense_kind text check (expense_kind in ('materials','labor')),
  payment_method text check (payment_method in ('cash','instapay','vodafone_cash')),
  received_by_engineer_id uuid references public.engineers(id),
  recorded_by_engineer_id uuid not null references public.engineers(id),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transaction_fields_valid check (
    (transaction_type = 'expense' and expense_category_id is not null and expense_kind is not null
      and payment_method is null and received_by_engineer_id is null)
    or
    (transaction_type = 'deposit' and expense_category_id is null and expense_kind is null
      and payment_method is not null and received_by_engineer_id is not null)
  )
);

create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid references public.engineers(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid references public.engineers(id),
  action text not null,
  entity_table text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_client_date
  on public.transactions(client_id, transaction_date desc) where deleted_at is null;
create index if not exists idx_transactions_category
  on public.transactions(expense_category_id) where deleted_at is null;
create index if not exists idx_transactions_recorder
  on public.transactions(recorded_by_engineer_id);

insert into public.engineers(display_name) values
 ('Eng-Ahmed Elsera'), ('Eng-Mahmoud Mashaly')
on conflict (display_name) do nothing;

insert into public.expense_categories(name, sort_order) values
 ('التكسير والتعديلات المعمارية',1), ('المحارة',2), ('السباكة',3), ('الكهرباء',4),
 ('العزل',5), ('الأرضيات والسيراميك',6), ('الجبسون بورد',7), ('النقاشة',8),
 ('النجارة',9), ('الألوميتال',10), ('الزجاج',11), ('الرخام',12), ('الأثاث',13),
 ('التكييف',14), ('الإشراف والمصروفات النثرية',15)
on conflict (name) do nothing;

insert into public.app_settings(setting_key, setting_value) values
 ('brand_logo_path', jsonb_build_object('path','branding/ae_logo.png')),
 ('offline_mode', '{"enabled":true}'::jsonb),
 ('settings_editable_by_all_engineers', '{"enabled":true}'::jsonb)
on conflict (setting_key) do nothing;

-- View: balances are derived from non-deleted transactions, never manually typed.
create or replace view public.client_account_summary as
select
  c.id as client_id,
  c.name as client_name,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'deposit' and t.deleted_at is null),0) as total_deposits,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'expense' and t.deleted_at is null),0) as total_expenses,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'deposit' and t.deleted_at is null),0)
    - coalesce(sum(t.amount) filter (where t.transaction_type = 'expense' and t.deleted_at is null),0) as balance
from public.clients c
left join public.transactions t on t.client_id = c.id
group by c.id, c.name;

-- Create a private Storage bucket for replaceable brand assets.
insert into storage.buckets(id, name, public)
values ('ae-branding', 'ae-branding', false)
on conflict (id) do nothing;

-- IMPORTANT SECURITY TODO:
-- Configure Supabase Auth and Row Level Security policies before production.
-- Engineer name selection in the UI is attribution, NOT authentication.
-- Do not ship a service-role key in the mobile app.
