BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Project lifecycle enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_state') THEN
    CREATE TYPE project_state AS ENUM (
      'draft',
      'funded',
      'accepted',
      'in_progress',
      'delivered',
      'buyer_rated',
      'seller_rated',
      'completed',
      'cancelled',
      'disputed'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,

  -- Parties
  buyer_user_id UUID NOT NULL,
  seller_user_id UUID NOT NULL,

  -- Link to listing (FK added later when services table exists)
  service_id UUID NULL,
  service_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Buyer input
  title TEXT NOT NULL,
  requirements TEXT NOT NULL,

  -- Commercial terms
  price_amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  delivery_days INTEGER NOT NULL,
  revision_limit INTEGER NOT NULL DEFAULT 0,

  -- Lifecycle
  state project_state NOT NULL DEFAULT 'draft',

  accepted_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  cancel_reason TEXT NULL,
  dispute_reason TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- FKs
  CONSTRAINT projects_buyer_fk
    FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE RESTRICT,

  CONSTRAINT projects_seller_fk
    FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE RESTRICT,

  -- Business rule checks
  CONSTRAINT projects_no_self_dealing
    CHECK (buyer_user_id <> seller_user_id),

  CONSTRAINT projects_price_positive
    CHECK (price_amount > 0),

  CONSTRAINT projects_delivery_days_positive
    CHECK (delivery_days > 0),

  CONSTRAINT projects_revision_limit_nonnegative
    CHECK (revision_limit >= 0),

  CONSTRAINT projects_service_snapshot_is_object
    CHECK (jsonb_typeof(service_snapshot) = 'object')
);

-- Indexes
CREATE INDEX IF NOT EXISTS projects_buyer_created_at_idx
  ON projects (buyer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS projects_seller_created_at_idx
  ON projects (seller_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS projects_state_idx
  ON projects (state);

CREATE INDEX IF NOT EXISTS projects_service_id_idx
  ON projects (service_id);

COMMIT;
