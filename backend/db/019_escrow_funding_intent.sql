BEGIN;

-- MVP-024 / Escrow §24.2. Tables are empty: no application path writes them.
-- INTEGER to BIGINT is non-lossy. Replacing UNIQUE+CASCADE with a partial
-- unique index and RESTRICT is the target in DATA-ESCROW-001 and DATA-ESCROW-002.
-- payments and escrow_ledger stay as they are; MVP-026 owns the ledger.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM escrows)
     OR EXISTS (SELECT 1 FROM escrow_allocations)
     OR EXISTS (SELECT 1 FROM payments)
     OR EXISTS (SELECT 1 FROM escrow_ledger) THEN
    RAISE EXCEPTION 'refusing escrow schema harden: financial rows exist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'escrows_project_id_key'
  ) THEN
    RAISE EXCEPTION 'expected escrows_project_id_key';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'escrow_allocations_milestone_id_key'
  ) THEN
    RAISE EXCEPTION 'expected escrow_allocations_milestone_id_key';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'allocation_status') THEN
    CREATE TYPE allocation_status AS ENUM (
      'planned',
      'funded',
      'released',
      'refunded',
      'cancelled',
      'superseded'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS escrow_fee_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  schedule_version TEXT NULL,
  fee_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  currency TEXT NOT NULL,
  currency_exponent SMALLINT NOT NULL,
  buyer_acknowledged_at TIMESTAMPTZ NULL,
  seller_acknowledged_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT escrow_fee_snapshots_external_id_unique UNIQUE (external_id),
  CONSTRAINT escrow_fee_snapshots_external_id_format
    CHECK (external_id ~ '^efs_[0-9a-f]{20}$'),
  CONSTRAINT escrow_fee_snapshots_fee_lines_array
    CHECK (jsonb_typeof(fee_lines) = 'array'),
  CONSTRAINT escrow_fee_snapshots_currency_inr
    CHECK (currency = 'INR' AND currency_exponent = 2)
);

CREATE OR REPLACE FUNCTION reject_fee_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'escrow_fee_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS escrow_fee_snapshots_no_update ON escrow_fee_snapshots;
CREATE TRIGGER escrow_fee_snapshots_no_update
  BEFORE UPDATE ON escrow_fee_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION reject_fee_snapshot_mutation();

DROP TRIGGER IF EXISTS escrow_fee_snapshots_no_delete ON escrow_fee_snapshots;
CREATE TRIGGER escrow_fee_snapshots_no_delete
  BEFORE DELETE ON escrow_fee_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION reject_fee_snapshot_mutation();

ALTER TABLE escrows RENAME COLUMN amount TO expected_amount;

ALTER TABLE escrows
  ALTER COLUMN expected_amount TYPE BIGINT,
  ALTER COLUMN funded_amount TYPE BIGINT,
  ALTER COLUMN released_amount TYPE BIGINT,
  ALTER COLUMN refunded_amount TYPE BIGINT;

ALTER TABLE escrows
  ADD COLUMN allocated_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN currency_exponent SMALLINT NOT NULL,
  ADD COLUMN buyer_user_id UUID NOT NULL,
  ADD COLUMN seller_user_id UUID NOT NULL,
  ADD COLUMN agreed_term_version INTEGER NOT NULL,
  ADD COLUMN fee_snapshot_id UUID NOT NULL,
  ADD COLUMN funded_at TIMESTAMPTZ NULL,
  ADD COLUMN closed_at TIMESTAMPTZ NULL,
  ADD COLUMN cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE escrows
  ADD CONSTRAINT escrows_buyer_fk
    FOREIGN KEY (buyer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  ADD CONSTRAINT escrows_seller_fk
    FOREIGN KEY (seller_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  ADD CONSTRAINT escrows_fee_snapshot_fk
    FOREIGN KEY (fee_snapshot_id) REFERENCES escrow_fee_snapshots (id) ON DELETE RESTRICT,
  ADD CONSTRAINT escrows_fee_snapshot_unique UNIQUE (fee_snapshot_id),
  ADD CONSTRAINT escrows_external_id_format
    CHECK (external_id ~ '^esc_[0-9a-f]{20}$'),
  ADD CONSTRAINT escrows_currency_inr
    CHECK (currency = 'INR' AND currency_exponent = 2),
  ADD CONSTRAINT escrows_agreed_term_version_positive
    CHECK (agreed_term_version > 0),
  ADD CONSTRAINT escrows_version_positive
    CHECK (version > 0),
  ADD CONSTRAINT escrows_allocated_nonnegative
    CHECK (allocated_amount >= 0),
  ADD CONSTRAINT escrows_settled_within_funded
    CHECK (released_amount + refunded_amount <= funded_amount),
  ADD CONSTRAINT escrows_funded_within_expected
    CHECK (funded_amount <= expected_amount);

ALTER TABLE escrows DROP CONSTRAINT escrows_project_fk;
ALTER TABLE escrows DROP CONSTRAINT escrows_project_id_key;

ALTER TABLE escrows
  ADD CONSTRAINT escrows_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX escrows_one_active_per_project
  ON escrows (project_id)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS escrows_project_id_idx
  ON escrows (project_id);

ALTER TABLE escrow_allocations
  ALTER COLUMN allocated_amount TYPE BIGINT,
  ALTER COLUMN released_amount TYPE BIGINT,
  ALTER COLUMN refunded_amount TYPE BIGINT;

ALTER TABLE escrow_allocations
  ADD COLUMN revision_number INTEGER NOT NULL,
  ADD COLUMN term_version INTEGER NOT NULL,
  ADD COLUMN currency_exponent SMALLINT NOT NULL,
  ADD COLUMN allocation_status allocation_status NOT NULL,
  ADD COLUMN funded_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN supersedes_allocation_id UUID NULL,
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE escrow_allocations
  ADD CONSTRAINT escrow_allocations_external_id_format
    CHECK (external_id ~ '^eal_[0-9a-f]{20}$'),
  ADD CONSTRAINT escrow_allocations_currency_inr
    CHECK (currency = 'INR' AND currency_exponent = 2),
  ADD CONSTRAINT escrow_allocations_revision_positive
    CHECK (revision_number > 0),
  ADD CONSTRAINT escrow_allocations_term_version_positive
    CHECK (term_version > 0),
  ADD CONSTRAINT escrow_allocations_version_positive
    CHECK (version > 0),
  ADD CONSTRAINT escrow_allocations_funded_nonnegative
    CHECK (funded_amount >= 0),
  ADD CONSTRAINT escrow_allocations_funded_exact
    CHECK (funded_amount = 0 OR funded_amount = allocated_amount),
  ADD CONSTRAINT escrow_allocations_revision_unique
    UNIQUE (milestone_id, revision_number),
  ADD CONSTRAINT escrow_allocations_supersedes_fk
    FOREIGN KEY (supersedes_allocation_id) REFERENCES escrow_allocations (id) ON DELETE RESTRICT;

ALTER TABLE escrow_allocations DROP CONSTRAINT escrow_allocations_escrow_fk;
ALTER TABLE escrow_allocations DROP CONSTRAINT escrow_allocations_milestone_fk;
ALTER TABLE escrow_allocations DROP CONSTRAINT escrow_allocations_milestone_id_key;

ALTER TABLE escrow_allocations
  ADD CONSTRAINT escrow_allocations_escrow_fk
    FOREIGN KEY (escrow_id) REFERENCES escrows (id) ON DELETE RESTRICT,
  ADD CONSTRAINT escrow_allocations_milestone_fk
    FOREIGN KEY (milestone_id) REFERENCES project_milestones (id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX escrow_allocations_one_active_per_milestone
  ON escrow_allocations (milestone_id)
  WHERE allocation_status NOT IN ('cancelled', 'superseded');

CREATE OR REPLACE FUNCTION protect_escrow_financial_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  posting text;
BEGIN
  posting := current_setting('musicapp.ledger_posting', true);

  IF NEW.status IN ('funding_pending', 'partially_released', 'refund_pending', 'disputed') THEN
    RAISE EXCEPTION 'legacy escrow status is not a write target';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'created' THEN
      RAISE EXCEPTION 'escrow insert status must be created';
    END IF;
    IF NEW.funded_amount <> 0
       OR NEW.released_amount <> 0
       OR NEW.refunded_amount <> 0
       OR NEW.allocated_amount <> 0 THEN
      RAISE EXCEPTION 'escrow projections start at zero';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.buyer_user_id IS DISTINCT FROM OLD.buyer_user_id
     OR NEW.seller_user_id IS DISTINCT FROM OLD.seller_user_id
     OR NEW.agreed_term_version IS DISTINCT FROM OLD.agreed_term_version
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.currency_exponent IS DISTINCT FROM OLD.currency_exponent
     OR NEW.expected_amount IS DISTINCT FROM OLD.expected_amount
     OR NEW.fee_snapshot_id IS DISTINCT FROM OLD.fee_snapshot_id THEN
    RAISE EXCEPTION 'escrow snapshot columns are immutable';
  END IF;

  IF posting IS DISTINCT FROM 'on' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.funded_amount IS DISTINCT FROM OLD.funded_amount
       OR NEW.released_amount IS DISTINCT FROM OLD.released_amount
       OR NEW.refunded_amount IS DISTINCT FROM OLD.refunded_amount
       OR NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount
       OR NEW.funded_at IS DISTINCT FROM OLD.funded_at
       OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'escrow projections and status change only through ledger posting';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escrows_protect_financial_row ON escrows;
CREATE TRIGGER escrows_protect_financial_row
  BEFORE INSERT OR UPDATE ON escrows
  FOR EACH ROW
  EXECUTE FUNCTION protect_escrow_financial_row();

CREATE OR REPLACE FUNCTION reject_escrow_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'escrows are not hard-deleted';
END;
$$;

DROP TRIGGER IF EXISTS escrows_no_delete ON escrows;
CREATE TRIGGER escrows_no_delete
  BEFORE DELETE ON escrows
  FOR EACH ROW
  EXECUTE FUNCTION reject_escrow_delete();

CREATE OR REPLACE FUNCTION protect_allocation_financial_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  posting text;
BEGIN
  posting := current_setting('musicapp.ledger_posting', true);

  IF TG_OP = 'INSERT' THEN
    IF NEW.allocation_status IS DISTINCT FROM 'planned' THEN
      RAISE EXCEPTION 'allocation insert status must be planned';
    END IF;
    IF NEW.funded_amount <> 0 OR NEW.released_amount <> 0 OR NEW.refunded_amount <> 0 THEN
      RAISE EXCEPTION 'allocation projections start at zero';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.escrow_id IS DISTINCT FROM OLD.escrow_id
     OR NEW.milestone_id IS DISTINCT FROM OLD.milestone_id
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
     OR NEW.term_version IS DISTINCT FROM OLD.term_version
     OR NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.currency_exponent IS DISTINCT FROM OLD.currency_exponent
     OR NEW.supersedes_allocation_id IS DISTINCT FROM OLD.supersedes_allocation_id THEN
    RAISE EXCEPTION 'allocation snapshot columns are immutable';
  END IF;

  IF posting IS DISTINCT FROM 'on' THEN
    IF NEW.allocation_status IS DISTINCT FROM OLD.allocation_status
       OR NEW.funded_amount IS DISTINCT FROM OLD.funded_amount
       OR NEW.released_amount IS DISTINCT FROM OLD.released_amount
       OR NEW.refunded_amount IS DISTINCT FROM OLD.refunded_amount
       OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'allocation projections and status change only through ledger posting';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escrow_allocations_protect_financial_row ON escrow_allocations;
CREATE TRIGGER escrow_allocations_protect_financial_row
  BEFORE INSERT OR UPDATE ON escrow_allocations
  FOR EACH ROW
  EXECUTE FUNCTION protect_allocation_financial_row();

CREATE OR REPLACE FUNCTION reject_allocation_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'escrow_allocations are not hard-deleted';
END;
$$;

DROP TRIGGER IF EXISTS escrow_allocations_no_delete ON escrow_allocations;
CREATE TRIGGER escrow_allocations_no_delete
  BEFORE DELETE ON escrow_allocations
  FOR EACH ROW
  EXECUTE FUNCTION reject_allocation_delete();

CREATE OR REPLACE FUNCTION escrow_allocations_match_agreement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  milestone_amount bigint;
  milestone_currency text;
  milestone_exponent smallint;
  milestone_project uuid;
  escrow_project uuid;
  escrow_currency text;
  escrow_exponent smallint;
  escrow_term integer;
BEGIN
  SELECT amount, currency, currency_exponent, project_id
    INTO milestone_amount, milestone_currency, milestone_exponent, milestone_project
  FROM project_milestones
  WHERE id = NEW.milestone_id;

  SELECT project_id, currency, currency_exponent, agreed_term_version
    INTO escrow_project, escrow_currency, escrow_exponent, escrow_term
  FROM escrows
  WHERE id = NEW.escrow_id;

  IF milestone_amount IS NULL OR escrow_project IS NULL THEN
    RAISE EXCEPTION 'allocation references a missing escrow or milestone';
  END IF;
  IF milestone_project IS DISTINCT FROM escrow_project THEN
    RAISE EXCEPTION 'allocation milestone is not in the escrow project';
  END IF;
  IF NEW.allocated_amount IS DISTINCT FROM milestone_amount THEN
    RAISE EXCEPTION 'allocation amount must equal the milestone agreed amount';
  END IF;
  IF NEW.currency IS DISTINCT FROM escrow_currency
     OR NEW.currency IS DISTINCT FROM milestone_currency
     OR NEW.currency_exponent IS DISTINCT FROM escrow_exponent
     OR NEW.currency_exponent IS DISTINCT FROM milestone_exponent THEN
    RAISE EXCEPTION 'allocation currency must equal the escrow and the milestone';
  END IF;
  IF NEW.term_version IS DISTINCT FROM escrow_term THEN
    RAISE EXCEPTION 'allocation term version must equal the escrow agreed term';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escrow_allocations_match_agreement ON escrow_allocations;
CREATE TRIGGER escrow_allocations_match_agreement
  BEFORE INSERT OR UPDATE ON escrow_allocations
  FOR EACH ROW
  EXECUTE FUNCTION escrow_allocations_match_agreement();

CREATE OR REPLACE FUNCTION escrows_expected_matches_allocations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid;
  expected bigint;
  active_sum bigint;
BEGIN
  IF TG_TABLE_NAME = 'escrows' THEN
    target := COALESCE(NEW.id, OLD.id);
  ELSE
    target := COALESCE(NEW.escrow_id, OLD.escrow_id);
  END IF;

  SELECT expected_amount INTO expected FROM escrows WHERE id = target;
  IF expected IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(allocated_amount), 0) INTO active_sum
  FROM escrow_allocations
  WHERE escrow_id = target
    AND allocation_status NOT IN ('cancelled', 'superseded');

  IF expected IS DISTINCT FROM active_sum THEN
    RAISE EXCEPTION 'escrow expected amount does not equal active allocations'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS escrows_expected_matches_allocations ON escrows;
CREATE CONSTRAINT TRIGGER escrows_expected_matches_allocations
  AFTER INSERT OR UPDATE ON escrows
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION escrows_expected_matches_allocations();

DROP TRIGGER IF EXISTS escrow_allocations_expected_matches ON escrow_allocations;
CREATE CONSTRAINT TRIGGER escrow_allocations_expected_matches
  AFTER INSERT OR UPDATE OR DELETE ON escrow_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION escrows_expected_matches_allocations();

COMMIT;
