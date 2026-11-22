-- AE-Finance supervision fees. Applied to Supabase as migration 20261122214851.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS supervision_percent numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_supervision_percent_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_supervision_percent_check CHECK (supervision_percent BETWEEN 0 AND 100);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS supervision_source_deposit_id uuid;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_supervision_source_deposit_id_fkey;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_supervision_source_deposit_id_fkey FOREIGN KEY(supervision_source_deposit_id) REFERENCES public.transactions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_supervision_source_deposit_unique ON public.transactions(supervision_source_deposit_id) WHERE supervision_source_deposit_id IS NOT NULL;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_supervision_source_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_supervision_source_type_check CHECK (supervision_source_deposit_id IS NULL OR transaction_type='supervision');
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transaction_type_check CHECK (transaction_type IN ('expense','deposit','supervision'));
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transaction_fields_valid;
ALTER TABLE public.transactions ADD CONSTRAINT transaction_fields_valid CHECK (
  (transaction_type='expense' AND expense_category_id IS NOT NULL AND expense_kind IS NOT NULL AND payment_method IS NULL AND received_by_engineer_id IS NULL)
  OR (transaction_type='deposit' AND expense_category_id IS NULL AND expense_kind IS NULL AND payment_method IS NOT NULL AND received_by_engineer_id IS NOT NULL AND supervision_source_deposit_id IS NULL)
  OR (transaction_type='supervision' AND expense_category_id IS NULL AND expense_kind IS NULL AND payment_method IS NULL AND received_by_engineer_id IS NULL)
);
CREATE SCHEMA IF NOT EXISTS ae_internal;
REVOKE ALL ON SCHEMA ae_internal FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION ae_internal.reconcile_supervision(p_source_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  dep public.transactions%ROWTYPE;
  rate numeric;
  charge numeric(14,2);
  caption text;
BEGIN
  SELECT * INTO dep FROM public.transactions WHERE id=p_source_id;
  IF dep.id IS NULL THEN RETURN; END IF;
  IF dep.transaction_type <> 'deposit' OR dep.deleted_at IS NOT NULL THEN
    UPDATE public.transactions
      SET deleted_at = now()
      WHERE supervision_source_deposit_id = p_source_id AND deleted_at IS NULL;
    RETURN;
  END IF;
  SELECT c.supervision_percent INTO rate FROM public.clients c WHERE c.id=dep.client_id;
  charge := round(dep.amount * coalesce(rate,0) / 100, 2);
  IF charge <= 0 THEN
    UPDATE public.transactions
      SET deleted_at = now()
      WHERE supervision_source_deposit_id = p_source_id AND deleted_at IS NULL;
    RETURN;
  END IF;
  caption := 'نسبة إشراف تلقائية (' || rate::text || '%)';
  INSERT INTO public.transactions(
    id, client_id, transaction_type, amount, transaction_date,
    description, notes, expense_category_id, expense_kind, payment_method,
    received_by_engineer_id, recorded_by_engineer_id, modified_by_engineer_id,
    supervision_source_deposit_id, idempotency_key, deleted_at
  )
  VALUES (
    gen_random_uuid(), dep.client_id, 'supervision', charge, dep.transaction_date,
    caption, 'تم حسابها تلقائيًا بناءً على إيداع العميل',
    NULL,NULL,NULL,NULL,
    dep.recorded_by_engineer_id, dep.modified_by_engineer_id,
    dep.id, 'supervision:' || dep.id::text, NULL
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET client_id=excluded.client_id,
      amount=excluded.amount,
      transaction_date=excluded.transaction_date,
      description=excluded.description,
      deleted_at=NULL,
      modified_by_engineer_id=excluded.modified_by_engineer_id
  WHERE (
    public.transactions.client_id,
    public.transactions.amount,
    public.transactions.transaction_date,
    public.transactions.description,
    public.transactions.deleted_at
  ) IS DISTINCT FROM (
    excluded.client_id,
    excluded.amount,
    excluded.transaction_date,
    excluded.description,
    excluded.deleted_at
  );
END
$function$;

CREATE OR REPLACE FUNCTION ae_internal.on_deposit_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.transaction_type = 'deposit' OR (TG_OP = 'UPDATE' AND OLD.transaction_type = 'deposit') THEN
     PERFORM ae_internal.reconcile_supervision(NEW.id);
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION ae_internal.on_client_supervision_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE deposit_id uuid;
BEGIN
  IF NEW.supervision_percent IS DISTINCT FROM OLD.supervision_percent THEN
     FOR deposit_id IN
       SELECT id FROM public.transactions
       WHERE client_id=NEW.id AND transaction_type='deposit'
     LOOP
       PERFORM ae_internal.reconcile_supervision(deposit_id);
     END LOOP;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION ae_internal.reconcile_supervision(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ae_internal.on_deposit_changed() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ae_internal.on_client_supervision_changed() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_supervision_from_deposit ON public.transactions;
DROP TRIGGER IF EXISTS trg_supervision_on_client_update ON public.clients;
CREATE TRIGGER trg_supervision_from_deposit AFTER INSERT OR UPDATE OF client_id, transaction_type, amount, transaction_date, deleted_at ON public.transactions FOR EACH ROW EXECUTE FUNCTION ae_internal.on_deposit_changed();
CREATE TRIGGER trg_supervision_on_client_update AFTER UPDATE OF supervision_percent ON public.clients FOR EACH ROW EXECUTE FUNCTION ae_internal.on_client_supervision_changed();
