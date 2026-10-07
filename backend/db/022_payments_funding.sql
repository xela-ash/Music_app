-- MVP-025 funding payments. Adds the idempotency and expiry columns the
-- existing payments table needs. Does not drop or rewrite a financial row.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS continuation JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_event_at TIMESTAMPTZ;

UPDATE payments
SET idempotency_key = 'legacy_' || replace(id::text, '-', '')
WHERE idempotency_key IS NULL;

ALTER TABLE payments
  ALTER COLUMN idempotency_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_idempotency_unique'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_idempotency_unique
      UNIQUE (escrow_id, type, idempotency_key);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_open_escrow_fund
  ON payments (escrow_id)
  WHERE type = 'escrow_fund'
    AND status NOT IN ('failed', 'cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_unique
  ON payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_webhook_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  outcome TEXT NOT NULL,
  provider_event_id TEXT NULL,
  payment_id UUID NULL REFERENCES payments (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payment_webhook_receipts_external_id_unique UNIQUE (external_id),
  CONSTRAINT payment_webhook_receipts_outcome
    CHECK (outcome IN ('rejected_signature', 'applied', 'ignored', 'quarantined'))
);

CREATE OR REPLACE FUNCTION reject_payment_webhook_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payment_webhook_receipts are immutable';
END;
$$;

DROP TRIGGER IF EXISTS payment_webhook_receipts_no_update ON payment_webhook_receipts;
CREATE TRIGGER payment_webhook_receipts_no_update
  BEFORE UPDATE ON payment_webhook_receipts
  FOR EACH ROW
  EXECUTE FUNCTION reject_payment_webhook_receipt_mutation();

DROP TRIGGER IF EXISTS payment_webhook_receipts_no_delete ON payment_webhook_receipts;
CREATE TRIGGER payment_webhook_receipts_no_delete
  BEFORE DELETE ON payment_webhook_receipts
  FOR EACH ROW
  EXECUTE FUNCTION reject_payment_webhook_receipt_mutation();
