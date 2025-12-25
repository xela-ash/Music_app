BEGIN;

-- Enum for verification status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status') THEN
    CREATE TYPE verification_status AS ENUM (
      'not_started',
      'submitted',
      'approved',
      'rejected'
    );
  END IF;
END$$;

-- Table: profile_verifications
CREATE TABLE IF NOT EXISTS profile_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,

  user_id UUID NOT NULL UNIQUE,
  CONSTRAINT profile_verifications_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  status verification_status NOT NULL DEFAULT 'not_started',
  submitted_at TIMESTAMPTZ NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_notes TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;