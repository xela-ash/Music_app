BEGIN;

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";   -- case-insensitive email

-- Enum type for status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
  END IF;
END$$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT        NOT NULL UNIQUE,
  email       CITEXT      UNIQUE,
  phone_e164  TEXT        UNIQUE,
  status      user_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_email_or_phone_present
    CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);

COMMIT;
