-- AE Finance v1.0 - الجزء التاني: الأمان + المراجعة (Audit)
-- شغّله في Supabase SQL Editor *بعد* schema.sql. آمن لو اتشغل أكتر من مرة.

-- 1) أعمدة إضافية لتسجيل "مين المهندس اللي عدّل"
alter table public.clients      add column if not exists modified_by_engineer_id uuid references public.engineers(id);
alter table public.transactions add column if not exists modified_by_engineer_id uuid references public.engineers(id);
alter table public.audit_logs   add column if not exists actor_user uuid;

-- 2) updated_at بيتغير فقط لو البيانات فعلاً اتغيرت
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_clients_updated on public.clients;
create trigger trg_clients_updated before update on public.clients
  for each row execute function public.set_updated_at();
drop trigger if exists trg_transactions_updated on public.transactions;
create trigger trg_transactions_updated before update on public.transactions
  for each row execute function public.set_updated_at();

-- 3) Audit: كل إضافة/تعديل/حذف بيتسجل (before/after + المستخدم)
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  j_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
begin
  insert into public.audit_logs(action, entity_table, entity_id, before_data, after_data, actor_user,
                                engineer_id)
  values (
    tg_op, tg_table_name,
    nullif(coalesce(j_new->>'id', j_old->>'id'), '')::uuid,
    j_old, j_new, auth.uid(),
    nullif(coalesce(j_new->>'modified_by_engineer_id', j_new->>'updated_by', ''), '')::uuid
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- أي UPDATE ما غيّرش حاجة ما يتسجلش (مهم لأن التطبيق بيعمل upsert تلقائي)
do $$
declare t text;
begin
  foreach t in array array['clients','transactions','app_settings','engineers','expense_categories'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_audit_ins_del_%1$s after insert or delete on public.%1$s
         for each row execute function public.audit_row()', t);
    execute format(
      'create trigger trg_audit_upd_%1$s after update on public.%1$s
         for each row when (old.* is distinct from new.*) execute function public.audit_row()', t);
  end loop;
end $$;

-- 4) Row Level Security: ممنوع على أي حد من غير تسجيل دخول
do $$
declare t text;
begin
  foreach t in array array['engineers','clients','expense_categories','transactions','app_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format(
      'create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

alter table public.audit_logs enable row level security;
drop policy if exists "authenticated read audit" on public.audit_logs;
create policy "authenticated read audit" on public.audit_logs for select to authenticated using (true);
-- (مفيش policy للكتابة: الـ trigger بس هو اللي بيكتب)

alter view public.client_account_summary set (security_invoker = true);

-- 5) تخزين اللوجو (bucket خاص)
drop policy if exists "ae_branding_authenticated" on storage.objects;
create policy "ae_branding_authenticated" on storage.objects for all to authenticated
  using (bucket_id = 'ae-branding') with check (bucket_id = 'ae-branding');
