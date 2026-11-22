-- Run after the base office_members migration. No public sign-up; accounts are admin-created.
create table if not exists public.office_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,31}$'),
  role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);
alter table public.office_accounts enable row level security;
revoke all on public.office_accounts from public, anon, authenticated;
grant select on public.office_accounts to authenticated;
drop policy if exists "office accounts own" on public.office_accounts;
create policy "office accounts own" on public.office_accounts for select
  to authenticated using (user_id=(select auth.uid()));
drop index if exists public.office_members_one_account_only;
-- Initial administrator membership is created once during provisioning.
-- The initial office user is the only one allowed to create/disable/reset staff users.
