-- Replace deposit-linked automatic collection with manual supervision collection.
-- Applied to Supabase project AE Finance (erc). Reversible in audit history;
-- manual supervision payments and original expense/deposit rows remain untouched.

DROP TRIGGER IF EXISTS trg_supervision_from_deposit ON public.transactions;
DROP TRIGGER IF EXISTS trg_supervision_on_client_update ON public.clients;

DROP FUNCTION IF EXISTS ae_internal.on_deposit_changed();
DROP FUNCTION IF EXISTS ae_internal.on_client_supervision_changed();
DROP FUNCTION IF EXISTS ae_internal.reconcile_supervision(uuid);

-- Only the old auto-generated collections get soft deleted. Their records remain
-- in the audit trail, and the original source deposits are not modified.
UPDATE public.transactions
SET deleted_at=now()
WHERE transaction_type='supervision'
  AND supervision_source_deposit_id IS NOT NULL
  AND deleted_at IS NULL;

COMMENT ON COLUMN public.clients.supervision_percent IS
  'Rate applied to expenses, for amount due only. Collection happens exclusively through manually created supervision transactions.';
COMMENT ON COLUMN public.transactions.supervision_source_deposit_id IS
  'Legacy deposit linkage retained on voided automatic supervision rows for audit/history.';
