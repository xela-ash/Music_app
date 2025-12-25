BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================
-- ENUMS
-- =========================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'milestone_state') THEN
    CREATE TYPE milestone_state AS ENUM (
      'planned',
      'funded',
      'in_progress',
      'delivered',
      'buyer_approved',
      'released',
      'refunded',
      'disputed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'escrow_status') THEN
    CREATE TYPE escrow_status AS ENUM (
      'created',
      'funding_pending',
      'funded',
      'partially_released',
      'released',
      'refund_pending',
      'refunded',
      'disputed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM (
      'created',
      'requires_action',
      'processing',
      'succeeded',
      'failed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_type') THEN
    CREATE TYPE payment_type AS ENUM (
      'escrow_fund',
      'milestone_release',
      'milestone_refund',
      'platform_fee',
      'escrow_fee'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entry_type') THEN
    CREATE TYPE ledger_entry_type AS ENUM (
      'funded',
      'allocated_to_milestone',
      'released_to_seller',
      'refunded_to_buyer',
      'platform_fee',
      'escrow_fee',
      'adjustment',
      'chargeback'
    );
  END IF;
END$$;

-- =========================
-- 1) PROJECT MILESTONES
-- =========================

CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,

  project_id UUID NOT NULL,
  milestone_no INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,

  amount INT NOT NULL,
  currency TEXT NOT NULL,
  due_at TIMESTAMPTZ NULL,

  state milestone_state NOT NULL DEFAULT 'planned',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT project_milestones_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,

  CONSTRAINT project_milestones_amount_positive
    CHECK (amount > 0),

  CONSTRAINT project_milestones_no_positive
    CHECK (milestone_no > 0),

  CONSTRAINT project_milestones_unique_no_per_project
    UNIQUE (project_id, milestone_no)
);

CREATE INDEX IF NOT EXISTS project_milestones_project_no_idx
  ON project_milestones (project_id, milestone_no);

CREATE INDEX IF NOT EXISTS project_milestones_project_state_idx
  ON project_milestones (project_id, state);

-- =========================
-- 2) ESCROWS (1 per project)
-- =========================

CREATE TABLE IF NOT EXISTS escrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,

  project_id UUID NOT NULL UNIQUE,

  amount INT NOT NULL,
  currency TEXT NOT NULL,

  status escrow_status NOT NULL DEFAULT 'created',

  funded_amount INT NOT NULL DEFAULT 0,
  released_amount INT NOT NULL DEFAULT 0,
  refunded_amount INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT escrows_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,

  CONSTRAINT escrows_amount_positive
    CHECK (amount > 0),

  CONSTRAINT escrows_funded_nonnegative
    CHECK (funded_amount >= 0),

  CONSTRAINT escrows_released_nonnegative
    CHECK (released_amount >= 0),

  CONSTRAINT escrows_refunded_nonnegative
    CHECK (refunded_amount >= 0)
);

CREATE INDEX IF NOT EXISTS escrows_status_idx
  ON escrows (status);

-- =========================
-- 3) ESCROW ALLOCATIONS
-- =========================

CREATE TABLE IF NOT EXISTS escrow_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,

  escrow_id UUID NOT NULL,
  milestone_id UUID NOT NULL UNIQUE,

  allocated_amount INT NOT NULL,
  released_amount INT NOT NULL DEFAULT 0,
  refunded_amount INT NOT NULL DEFAULT 0,

  currency TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT escrow_allocations_escrow_fk
    FOREIGN KEY (escrow_id) REFERENCES escrows(id) ON DELETE CASCADE,

  CONSTRAINT escrow_allocations_milestone_fk
    FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE CASCADE,

  CONSTRAINT escrow_allocations_allocated_positive
    CHECK (allocated_amount > 0),

  CONSTRAINT escrow_allocations_released_nonnegative
    CHECK (released_amount >= 0),

  CONSTRAINT escrow_allocations_refunded_nonnegative
    CHECK (refunded_amount >= 0),

  CONSTRAINT escrow_allocations_totals_within_allocated
    CHECK (released_amount + refunded_amount <= allocated_amount)
);

CREATE INDEX IF NOT EXISTS escrow_allocations_escrow_id_idx
  ON escrow_allocations (escrow_id);

-- =========================
-- 4) PAYMENTS
-- =========================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,

  project_id UUID NOT NULL,
  escrow_id UUID NOT NULL,
  payer_user_id UUID NOT NULL,

  amount INT NOT NULL,
  currency TEXT NOT NULL,

  provider TEXT NOT NULL,
  provider_payment_id TEXT NULL,

  status payment_status NOT NULL DEFAULT 'created',

  milestone_id UUID NULL,
  allocation_id UUID NULL,

  type payment_type NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payments_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,

  CONSTRAINT payments_escrow_fk
    FOREIGN KEY (escrow_id) REFERENCES escrows(id) ON DELETE RESTRICT,

  CONSTRAINT payments_payer_fk
    FOREIGN KEY (payer_user_id) REFERENCES users(id) ON DELETE RESTRICT,

  CONSTRAINT payments_milestone_fk
    FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL,

  CONSTRAINT payments_allocation_fk
    FOREIGN KEY (allocation_id) REFERENCES escrow_allocations(id) ON DELETE SET NULL,

  CONSTRAINT payments_amount_positive
    CHECK (amount > 0),

  -- If type is milestone_release or milestone_refund, milestone_id must be present
  CONSTRAINT payments_milestone_required_for_milestone_types
    CHECK (
      (type IN ('milestone_release','milestone_refund') AND milestone_id IS NOT NULL)
      OR
      (type NOT IN ('milestone_release','milestone_refund'))
    ),

  -- If type is escrow_fund, milestone_id must be NULL
  CONSTRAINT payments_no_milestone_for_escrow_fund
    CHECK (
      (type = 'escrow_fund' AND milestone_id IS NULL)
      OR
      (type <> 'escrow_fund')
    ),

  -- Recommended: if allocation_id is present, milestone_id must be present
  CONSTRAINT payments_allocation_requires_milestone
    CHECK (
      (allocation_id IS NULL)
      OR
      (allocation_id IS NOT NULL AND milestone_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS payments_project_created_at_idx
  ON payments (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_escrow_created_at_idx
  ON payments (escrow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_milestone_created_at_idx
  ON payments (milestone_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_payer_created_at_idx
  ON payments (payer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_status_idx
  ON payments (status);

CREATE INDEX IF NOT EXISTS payments_provider_lookup_idx
  ON payments (provider, provider_payment_id);

-- =========================
-- 5) ESCROW LEDGER (immutable)
-- =========================

CREATE TABLE IF NOT EXISTS escrow_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,

  escrow_id UUID NOT NULL,
  project_id UUID NOT NULL,

  milestone_id UUID NULL,
  allocation_id UUID NULL,
  related_payment_id UUID NULL,

  entry_type ledger_entry_type NOT NULL,

  amount INT NOT NULL,
  currency TEXT NOT NULL,

  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT escrow_ledger_escrow_fk
    FOREIGN KEY (escrow_id) REFERENCES escrows(id) ON DELETE CASCADE,

  CONSTRAINT escrow_ledger_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,

  CONSTRAINT escrow_ledger_milestone_fk
    FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL,

  CONSTRAINT escrow_ledger_allocation_fk
    FOREIGN KEY (allocation_id) REFERENCES escrow_allocations(id) ON DELETE SET NULL,

  CONSTRAINT escrow_ledger_related_payment_fk
    FOREIGN KEY (related_payment_id) REFERENCES payments(id) ON DELETE SET NULL,

  CONSTRAINT escrow_ledger_amount_nonzero
    CHECK (amount <> 0),

  -- Recommended rule you specified
  CONSTRAINT escrow_ledger_alloc_requires_refs
    CHECK (
      entry_type <> 'allocated_to_milestone'
      OR
      (entry_type = 'allocated_to_milestone' AND milestone_id IS NOT NULL AND allocation_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS escrow_ledger_escrow_created_at_idx
  ON escrow_ledger (escrow_id, created_at);

CREATE INDEX IF NOT EXISTS escrow_ledger_project_created_at_idx
  ON escrow_ledger (project_id, created_at);

CREATE INDEX IF NOT EXISTS escrow_ledger_milestone_created_at_idx
  ON escrow_ledger (milestone_id, created_at);

CREATE INDEX IF NOT EXISTS escrow_ledger_related_payment_id_idx
  ON escrow_ledger (related_payment_id);

COMMIT;
