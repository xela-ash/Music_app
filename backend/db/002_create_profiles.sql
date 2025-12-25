BEGIN;

-- citext + pgcrypto were created in 001, but safe to keep idempotent
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,

  user_id UUID NOT NULL UNIQUE,
  CONSTRAINT profiles_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  handle CITEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NULL,
  artist_name TEXT NOT NULL,
  artist_name_is_legal_name BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT NOT NULL,

  genres TEXT[] NOT NULL DEFAULT '{}',
  city TEXT NOT NULL,
  country TEXT NOT NULL,

  bio TEXT NULL,
  profile_photo_asset_id UUID NULL, -- FK to assets(id) will be added after assets table exists
  dob DATE NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Optional (enable if you want at least one genre required):
  -- CONSTRAINT profiles_genres_min_one CHECK (array_length(genres, 1) >= 1)
  CONSTRAINT profiles_genres_not_null CHECK (genres IS NOT NULL)
);

COMMIT;
