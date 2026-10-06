BEGIN;

ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'allocation_returned';
ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'refund_paid';
ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'payout_initiated';
ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'payout_paid';
ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'funding_reversed';

COMMIT;

BEGIN;

-- MVP-026 / Escrow §13 and §24.2. The ledger has no writer yet, so it is empty.
-- INTEGER to BIGINT is non-lossy. CASCADE and SET NULL become RESTRICT.
-- The free-text note is replaced by reason_code and metadata on an empty table.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM escrow_ledger) THEN
    RAISE EXCEPTION 'refusing ledger schema harden: escrow_ledger rows exist';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_account') THEN
    CREATE TYPE ledger_account AS ENUM (
      'EXTERNAL_BUYER',
      'ESCROW_UNALLOCATED',
      'ESCROW_ALLOCATION',
      'SELLER_ENTITLEMENT',
      'PAYOUT_IN_TRANSIT',
      'REFUND_IN_TRANSIT',
      'EXTERNAL_SELLER',
      'PLATFORM_REVENUE',
      'TAX_PAYABLE',
      'PROVIDER_FEE_EXPENSE',
      'CHARGEBACK_EXPOSURE'
    );
  END IF;
END $$;

ALTER TABLE escrow_ledger DROP CONSTRAINT escrow_ledger_amount_nonzero;
ALTER TABLE escrow_ledger ALTER COLUMN amount TYPE BIGINT;
ALTER TABLE escrow_ledger
  ADD CONSTRAINT escrow_ledger_amount_positive CHECK (amount > 0);

ALTER TABLE escrow_ledger RENAME COLUMN related_payment_id TO payment_id;
ALTER INDEX escrow_ledger_related_payment_id_idx RENAME TO escrow_ledger_payment_id_idx;

ALTER TABLE escrow_ledger DROP COLUMN note;

ALTER TABLE escrow_ledger
  ADD COLUMN journal_id UUID NOT NULL,
  ADD COLUMN sequence INTEGER NOT NULL,
  ADD COLUMN currency_exponent SMALLINT NOT NULL,
  ADD COLUMN source_account ledger_account NOT NULL,
  ADD COLUMN destination_account ledger_account NOT NULL,
  ADD COLUMN beneficiary_user_id UUID NULL,
  ADD COLUMN provider_reference TEXT NULL,
  ADD COLUMN idempotency_key TEXT NOT NULL,
  ADD COLUMN correlation_id TEXT NOT NULL,
  ADD COLUMN actor_type TEXT NOT NULL,
  ADD COLUMN actor_id UUID NULL,
  ADD COLUMN source TEXT NOT NULL,
  ADD COLUMN reverses_entry_id UUID NULL,
  ADD COLUMN reason_code TEXT NULL,
  ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE escrow_ledger
  ADD CONSTRAINT escrow_ledger_external_id_format
    CHECK (external_id ~ '^led_[0-9a-f]{20}$'),
  ADD CONSTRAINT escrow_ledger_sequence_positive
    CHECK (sequence > 0),
  ADD CONSTRAINT escrow_ledger_currency_inr
    CHECK (currency = 'INR' AND currency_exponent = 2),
  ADD CONSTRAINT escrow_ledger_accounts_distinct
    CHECK (source_account <> destination_account),
  ADD CONSTRAINT escrow_ledger_idempotency_key_length
    CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  ADD CONSTRAINT escrow_ledger_correlation_present
    CHECK (char_length(correlation_id) >= 1),
  ADD CONSTRAINT escrow_ledger_source_present
    CHECK (char_length(source) >= 1),
  ADD CONSTRAINT escrow_ledger_actor_shape
    CHECK (
      (actor_type = 'system' AND actor_id IS NULL)
      OR (actor_type = 'user' AND actor_id IS NOT NULL)
    ),
  ADD CONSTRAINT escrow_ledger_reason_present
    CHECK (reason_code IS NULL OR char_length(reason_code) >= 1),
  ADD CONSTRAINT escrow_ledger_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT escrow_ledger_sequence_unique
    UNIQUE (escrow_id, sequence),
  ADD CONSTRAINT escrow_ledger_idempotency_unique
    UNIQUE (escrow_id, idempotency_key),
  ADD CONSTRAINT escrow_ledger_beneficiary_fk
    FOREIGN KEY (beneficiary_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  ADD CONSTRAINT escrow_ledger_reverses_fk
    FOREIGN KEY (reverses_entry_id) REFERENCES escrow_ledger (id) ON DELETE RESTRICT;

ALTER TABLE escrow_ledger DROP CONSTRAINT escrow_ledger_escrow_fk;
ALTER TABLE escrow_ledger DROP CONSTRAINT escrow_ledger_project_fk;
ALTER TABLE escrow_ledger DROP CONSTRAINT escrow_ledger_milestone_fk;
ALTER TABLE escrow_ledger DROP CONSTRAINT escrow_ledger_allocation_fk;
ALTER TABLE escrow_ledger DROP CONSTRAINT escrow_ledger_related_payment_fk;

ALTER TABLE escrow_ledger
  ADD CONSTRAINT escrow_ledger_escrow_fk
    FOREIGN KEY (escrow_id) REFERENCES escrows (id) ON DELETE RESTRICT,
  ADD CONSTRAINT escrow_ledger_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  ADD CONSTRAINT escrow_ledger_milestone_fk
    FOREIGN KEY (milestone_id) REFERENCES project_milestones (id) ON DELETE RESTRICT,
  ADD CONSTRAINT escrow_ledger_allocation_fk
    FOREIGN KEY (allocation_id) REFERENCES escrow_allocations (id) ON DELETE RESTRICT,
  ADD CONSTRAINT escrow_ledger_payment_fk
    FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX escrow_ledger_one_funded_per_payment
  ON escrow_ledger (payment_id)
  WHERE entry_type = 'funded' AND payment_id IS NOT NULL;

CREATE INDEX escrow_ledger_journal_id_idx
  ON escrow_ledger (journal_id);

CREATE INDEX escrow_ledger_escrow_sequence_idx
  ON escrow_ledger (escrow_id, sequence);

CREATE OR REPLACE FUNCTION escrow_ledger_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'escrow_ledger is append-only';
END;
$$;

DROP TRIGGER IF EXISTS escrow_ledger_no_update ON escrow_ledger;
CREATE TRIGGER escrow_ledger_no_update
  BEFORE UPDATE ON escrow_ledger
  FOR EACH ROW
  EXECUTE FUNCTION escrow_ledger_reject_mutation();

DROP TRIGGER IF EXISTS escrow_ledger_no_delete ON escrow_ledger;
CREATE TRIGGER escrow_ledger_no_delete
  BEFORE DELETE ON escrow_ledger
  FOR EACH ROW
  EXECUTE FUNCTION escrow_ledger_reject_mutation();

DROP TRIGGER IF EXISTS escrow_ledger_no_truncate ON escrow_ledger;
CREATE TRIGGER escrow_ledger_no_truncate
  BEFORE TRUNCATE ON escrow_ledger
  FOR EACH STATEMENT
  EXECUTE FUNCTION escrow_ledger_reject_mutation();

CREATE OR REPLACE FUNCTION escrow_ledger_entry_shape()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pair_ok boolean;
BEGIN
  pair_ok := CASE NEW.entry_type
    WHEN 'funded' THEN
      NEW.source_account = 'EXTERNAL_BUYER' AND NEW.destination_account = 'ESCROW_UNALLOCATED'
    WHEN 'allocated_to_milestone' THEN
      NEW.source_account = 'ESCROW_UNALLOCATED' AND NEW.destination_account = 'ESCROW_ALLOCATION'
    WHEN 'allocation_returned' THEN
      NEW.source_account = 'ESCROW_ALLOCATION' AND NEW.destination_account = 'ESCROW_UNALLOCATED'
    WHEN 'released_to_seller' THEN
      NEW.source_account = 'ESCROW_ALLOCATION' AND NEW.destination_account = 'SELLER_ENTITLEMENT'
    WHEN 'platform_fee' THEN
      NEW.destination_account = 'PLATFORM_REVENUE'
      AND NEW.source_account IN ('ESCROW_ALLOCATION', 'EXTERNAL_BUYER')
    WHEN 'escrow_fee' THEN
      NEW.destination_account = 'PLATFORM_REVENUE'
      AND NEW.source_account IN ('ESCROW_ALLOCATION', 'EXTERNAL_BUYER')
    WHEN 'refunded_to_buyer' THEN
      NEW.destination_account = 'REFUND_IN_TRANSIT'
      AND NEW.source_account IN ('ESCROW_ALLOCATION', 'ESCROW_UNALLOCATED')
    WHEN 'refund_paid' THEN
      NEW.source_account = 'REFUND_IN_TRANSIT' AND NEW.destination_account = 'EXTERNAL_BUYER'
    WHEN 'payout_initiated' THEN
      NEW.source_account = 'SELLER_ENTITLEMENT' AND NEW.destination_account = 'PAYOUT_IN_TRANSIT'
    WHEN 'payout_paid' THEN
      NEW.source_account = 'PAYOUT_IN_TRANSIT' AND NEW.destination_account = 'EXTERNAL_SELLER'
    WHEN 'funding_reversed' THEN
      NEW.destination_account = 'EXTERNAL_BUYER'
      AND NEW.source_account IN ('ESCROW_UNALLOCATED', 'ESCROW_ALLOCATION')
    WHEN 'chargeback' THEN
      NEW.destination_account = 'CHARGEBACK_EXPOSURE'
    WHEN 'adjustment' THEN
      NEW.reverses_entry_id IS NOT NULL AND NEW.reason_code IS NOT NULL
    ELSE FALSE
  END;

  IF NOT pair_ok OR NEW.source_account = NEW.destination_account THEN
    RAISE EXCEPTION 'ledger entry accounts do not match the entry type';
  END IF;

  IF NEW.entry_type IN ('released_to_seller', 'payout_initiated', 'payout_paid')
     AND NEW.beneficiary_user_id IS NULL THEN
    RAISE EXCEPTION 'release and payout entries record a beneficiary';
  END IF;

  IF NEW.source_account = 'ESCROW_ALLOCATION' OR NEW.destination_account = 'ESCROW_ALLOCATION' THEN
    IF NEW.allocation_id IS NULL OR NEW.milestone_id IS NULL THEN
      RAISE EXCEPTION 'allocation movements require milestone and allocation references';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM escrows
    WHERE id = NEW.escrow_id
      AND project_id = NEW.project_id
      AND currency = NEW.currency
      AND currency_exponent = NEW.currency_exponent
  ) THEN
    RAISE EXCEPTION 'ledger currency must equal the escrow currency';
  END IF;

  IF NEW.allocation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM escrow_allocations
    WHERE id = NEW.allocation_id AND escrow_id = NEW.escrow_id
  ) THEN
    RAISE EXCEPTION 'allocation does not belong to the escrow';
  END IF;

  IF NEW.milestone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM project_milestones
    WHERE id = NEW.milestone_id AND project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'milestone does not belong to the project';
  END IF;

  IF NEW.payment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM payments
    WHERE id = NEW.payment_id AND escrow_id = NEW.escrow_id
  ) THEN
    RAISE EXCEPTION 'payment does not belong to the escrow';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escrow_ledger_shape ON escrow_ledger;
CREATE TRIGGER escrow_ledger_shape
  BEFORE INSERT ON escrow_ledger
  FOR EACH ROW
  EXECUTE FUNCTION escrow_ledger_entry_shape();

CREATE OR REPLACE FUNCTION escrow_ledger_journal_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  currencies integer;
  debit_total bigint;
  credit_total bigint;
BEGIN
  SELECT COUNT(DISTINCT currency),
         COALESCE(SUM(amount), 0),
         COALESCE(SUM(amount), 0)
  INTO currencies, debit_total, credit_total
  FROM escrow_ledger
  WHERE journal_id = NEW.journal_id;

  IF currencies <> 1 OR debit_total <> credit_total OR debit_total <= 0 THEN
    RAISE EXCEPTION 'ledger journal must balance in one currency';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS escrow_ledger_journal_balance ON escrow_ledger;
CREATE CONSTRAINT TRIGGER escrow_ledger_journal_balance
  AFTER INSERT ON escrow_ledger
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION escrow_ledger_journal_balanced();

CREATE OR REPLACE FUNCTION escrow_ledger_matches_projections()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ledger_funded bigint;
  ledger_released bigint;
  ledger_refunded bigint;
  stored_funded bigint;
  stored_released bigint;
  stored_refunded bigint;
  allocation_drift bigint;
BEGIN
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE entry_type = 'funded'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE entry_type = 'funding_reversed'), 0),
    COALESCE(SUM(amount) FILTER (
      WHERE entry_type IN ('released_to_seller', 'platform_fee', 'escrow_fee')
        AND source_account = 'ESCROW_ALLOCATION'
    ), 0),
    COALESCE(SUM(amount) FILTER (
      WHERE entry_type = 'refunded_to_buyer'
        AND source_account = 'ESCROW_ALLOCATION'
    ), 0)
  INTO ledger_funded, ledger_released, ledger_refunded
  FROM escrow_ledger
  WHERE escrow_id = NEW.escrow_id;

  SELECT funded_amount, released_amount, refunded_amount
  INTO stored_funded, stored_released, stored_refunded
  FROM escrows
  WHERE id = NEW.escrow_id;

  IF stored_funded IS DISTINCT FROM ledger_funded
     OR stored_released IS DISTINCT FROM ledger_released
     OR stored_refunded IS DISTINCT FROM ledger_refunded THEN
    RAISE EXCEPTION 'escrow projections must equal the ledger';
  END IF;

  SELECT COUNT(*)
  INTO allocation_drift
  FROM escrow_allocations allocation
  WHERE allocation.escrow_id = NEW.escrow_id
    AND (
      allocation.funded_amount IS DISTINCT FROM (
        SELECT CASE
          WHEN net = 0 THEN 0
          WHEN net = allocation.allocated_amount THEN allocation.allocated_amount
          ELSE net
        END
        FROM (
          SELECT
            COALESCE(SUM(amount) FILTER (WHERE entry_type = 'allocated_to_milestone'), 0)
              - COALESCE(SUM(amount) FILTER (WHERE entry_type = 'allocation_returned'), 0)
              - COALESCE(SUM(amount) FILTER (WHERE entry_type = 'funding_reversed'), 0) AS net
          FROM escrow_ledger
          WHERE allocation_id = allocation.id
        ) nets
      )
      OR allocation.released_amount IS DISTINCT FROM (
        SELECT COALESCE(SUM(amount), 0)
        FROM escrow_ledger
        WHERE allocation_id = allocation.id
          AND entry_type IN ('released_to_seller', 'platform_fee', 'escrow_fee')
          AND source_account = 'ESCROW_ALLOCATION'
      )
      OR allocation.refunded_amount IS DISTINCT FROM (
        SELECT COALESCE(SUM(amount), 0)
        FROM escrow_ledger
        WHERE allocation_id = allocation.id
          AND entry_type = 'refunded_to_buyer'
          AND source_account = 'ESCROW_ALLOCATION'
      )
    );

  IF allocation_drift <> 0 THEN
    RAISE EXCEPTION 'allocation projections must equal the ledger';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS escrow_ledger_projection_check ON escrow_ledger;
CREATE CONSTRAINT TRIGGER escrow_ledger_projection_check
  AFTER INSERT ON escrow_ledger
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION escrow_ledger_matches_projections();

REVOKE UPDATE, DELETE, TRUNCATE ON escrow_ledger FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON escrow_ledger FROM musicapp;

COMMIT;
