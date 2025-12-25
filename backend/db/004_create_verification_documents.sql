BEGIN;

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    CREATE TYPE document_type AS ENUM ('selfie', 'government_id');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_side') THEN
    CREATE TYPE document_side AS ENUM ('selfie', 'front', 'back');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status') THEN
    CREATE TYPE document_status AS ENUM ('uploaded', 'submitted', 'approved', 'rejected');
  END IF;
END$$;

-- Table
CREATE TABLE IF NOT EXISTS verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,

  user_id UUID NOT NULL,
  verification_id UUID NOT NULL,

  doc_type document_type NOT NULL,
  doc_side document_side NOT NULL,

  country TEXT NOT NULL,
  id_type TEXT NULL,

  asset_id UUID NOT NULL, -- FK to assets(id) will be added after assets table exists
  file_mime_type TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT true,

  status document_status NOT NULL DEFAULT 'uploaded',
  rejection_reason TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT verification_documents_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  CONSTRAINT verification_documents_verification_fk
    FOREIGN KEY (verification_id) REFERENCES profile_verifications(id) ON DELETE CASCADE,

  -- Allowed mime types
  CONSTRAINT verification_documents_mime_allowed
    CHECK (file_mime_type IN ('image/jpeg','image/png','image/heic','image/heif')),

  -- Type/side consistency
  CONSTRAINT verification_documents_type_side_consistent
    CHECK (
      (doc_type = 'selfie' AND doc_side = 'selfie')
      OR
      (doc_type = 'government_id' AND doc_side IN ('front','back'))
    )
);

-- Only one current doc per user per slot (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS verification_documents_one_current_per_slot
  ON verification_documents (user_id, doc_type, doc_side)
  WHERE is_current = true;

COMMIT;
