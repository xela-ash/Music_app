BEGIN;

-- MVP-012 / verification.md §10–§13, §20–§21, §28–§29.
-- Reviewer identity (SEC-VERIFY-004), one current attempt (SEC-VERIFY-002),
-- and append-only audit (AUD-IDENTITY-001–003). No expiry column: the
-- validity period is open (verification.md §34.1 item 3).

ALTER TABLE profile_verifications
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'profile_verifications'::regclass
    AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 1
    AND a.attname = 'user_id';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE profile_verifications DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_verifications_reviewed_by_fk'
  ) THEN
    ALTER TABLE profile_verifications
      ADD CONSTRAINT profile_verifications_reviewed_by_fk
      FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profile_verifications_one_current_per_user
  ON profile_verifications (user_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS profile_verifications_review_queue_idx
  ON profile_verifications (submitted_at, id)
  WHERE is_current = true AND status = 'submitted';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_verifications_decision_actor_check'
  ) THEN
    ALTER TABLE profile_verifications
      ADD CONSTRAINT profile_verifications_decision_actor_check
      CHECK (
        (
          status IN ('approved', 'rejected')
          AND reviewed_by IS NOT NULL
          AND reviewed_at IS NOT NULL
        )
        OR (
          status IN ('not_started', 'submitted')
          AND reviewed_by IS NULL
          AND reviewed_at IS NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_verifications_submitted_at_check'
  ) THEN
    ALTER TABLE profile_verifications
      ADD CONSTRAINT profile_verifications_submitted_at_check
      CHECK (
        (status = 'not_started' AND submitted_at IS NULL)
        OR (status <> 'not_started' AND submitted_at IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_verifications_rejection_reason_check'
  ) THEN
    ALTER TABLE profile_verifications
      ADD CONSTRAINT profile_verifications_rejection_reason_check
      CHECK (
        (
          status = 'rejected'
          AND review_notes IS NOT NULL
          AND length(btrim(review_notes)) > 0
        )
        OR status <> 'rejected'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS verification_documents_one_current_asset
  ON verification_documents (asset_id)
  WHERE is_current = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'verification_documents_rejection_reason_check'
  ) THEN
    ALTER TABLE verification_documents
      ADD CONSTRAINT verification_documents_rejection_reason_check
      CHECK (
        (
          status = 'rejected'
          AND rejection_reason IS NOT NULL
          AND length(btrim(rejection_reason)) > 0
        )
        OR status <> 'rejected'
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS verification_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  verification_id UUID NOT NULL,
  owning_user_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  document_id UUID NULL,
  prior_status TEXT NULL,
  new_status TEXT NULL,
  reason TEXT NULL,
  correlation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT verification_audit_events_external_id_unique UNIQUE (external_id),
  CONSTRAINT verification_audit_events_external_id_format
    CHECK (external_id ~ '^vae_[0-9a-f]{20}$'),
  CONSTRAINT verification_audit_events_verification_fk
    FOREIGN KEY (verification_id) REFERENCES profile_verifications (id) ON DELETE RESTRICT,
  CONSTRAINT verification_audit_events_owner_fk
    FOREIGN KEY (owning_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT verification_audit_events_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT verification_audit_events_document_fk
    FOREIGN KEY (document_id) REFERENCES verification_documents (id) ON DELETE RESTRICT,
  CONSTRAINT verification_audit_events_type_check
    CHECK (event_type IN ('AUD-IDENTITY-001', 'AUD-IDENTITY-003')),
  CONSTRAINT verification_audit_events_transition_shape
    CHECK (
      (
        event_type = 'AUD-IDENTITY-001'
        AND document_id IS NULL
        AND new_status IN ('submitted', 'approved', 'rejected')
        AND (
          (prior_status IS NULL AND new_status = 'submitted')
          OR (prior_status = 'not_started' AND new_status = 'submitted')
          OR (prior_status = 'submitted' AND new_status IN ('approved', 'rejected'))
        )
        AND (
          new_status <> 'rejected'
          OR (reason IS NOT NULL AND length(btrim(reason)) > 0)
        )
      )
      OR (
        event_type = 'AUD-IDENTITY-003'
        AND document_id IS NOT NULL
        AND prior_status IS NULL
        AND new_status IS NULL
        AND reason IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS verification_audit_events_verification_idx
  ON verification_audit_events (verification_id, created_at);

CREATE TABLE IF NOT EXISTS verification_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  document_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT verification_access_grants_external_id_unique UNIQUE (external_id),
  CONSTRAINT verification_access_grants_external_id_format
    CHECK (external_id ~ '^vag_[0-9a-f]{20}$'),
  CONSTRAINT verification_access_grants_document_fk
    FOREIGN KEY (document_id) REFERENCES verification_documents (id) ON DELETE RESTRICT,
  CONSTRAINT verification_access_grants_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT verification_access_grants_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT verification_access_grants_token_hash_format
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT verification_access_grants_expiry_after_create
    CHECK (expires_at > created_at),
  CONSTRAINT verification_access_grants_used_after_create
    CHECK (used_at IS NULL OR used_at >= created_at)
);

CREATE OR REPLACE FUNCTION profile_verifications_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'profile_verifications cannot be deleted';
  END IF;
  IF current_setting('musicapp.verification_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'profile_verifications cannot be updated directly';
  END IF;
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_verifications_guard ON profile_verifications;
CREATE TRIGGER profile_verifications_guard
  BEFORE UPDATE OR DELETE ON profile_verifications
  FOR EACH ROW
  EXECUTE FUNCTION profile_verifications_guard();

CREATE OR REPLACE FUNCTION verification_documents_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'verification_documents cannot be deleted';
  END IF;
  IF current_setting('musicapp.verification_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'verification_documents cannot be updated directly';
  END IF;
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verification_documents_guard ON verification_documents;
CREATE TRIGGER verification_documents_guard
  BEFORE UPDATE OR DELETE ON verification_documents
  FOR EACH ROW
  EXECUTE FUNCTION verification_documents_guard();

CREATE OR REPLACE FUNCTION verification_audit_events_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'verification_audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS verification_audit_events_no_update ON verification_audit_events;
CREATE TRIGGER verification_audit_events_no_update
  BEFORE UPDATE ON verification_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION verification_audit_events_reject_mutation();

DROP TRIGGER IF EXISTS verification_audit_events_no_delete ON verification_audit_events;
CREATE TRIGGER verification_audit_events_no_delete
  BEFORE DELETE ON verification_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION verification_audit_events_reject_mutation();

CREATE OR REPLACE FUNCTION verification_access_grants_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'verification_access_grants cannot be deleted';
  END IF;
  IF current_setting('musicapp.verification_grant_use', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'verification_access_grants cannot be updated directly';
  END IF;
  IF OLD.used_at IS NOT NULL OR NEW.used_at IS NULL THEN
    RAISE EXCEPTION 'verification_access_grants cannot be updated directly';
  END IF;
  IF NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'verification_access_grants cannot be updated directly';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verification_access_grants_guard ON verification_access_grants;
CREATE TRIGGER verification_access_grants_guard
  BEFORE UPDATE OR DELETE ON verification_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION verification_access_grants_guard();

COMMIT;
