BEGIN;

-- MVP-016 / REQ-PROJECTS-009 / DATA-PROJECTS-004 / BR-PROJECTS-017 / SEC-PROJECTS-004.
-- Adds the project amendment record and stops a silent rewrite of accepted
-- live commercial columns. No existing column is dropped and no commercial
-- row is rewritten.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_amendment_status') THEN
    CREATE TYPE project_amendment_status AS ENUM (
      'proposed',
      'accepted',
      'rejected',
      'withdrawn',
      'expired',
      'superseded'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  proposer_user_id UUID NOT NULL,
  counterparty_user_id UUID NOT NULL,
  base_project_version INTEGER NOT NULL,
  base_term_version INTEGER NOT NULL,
  current_term_version INTEGER NULL,
  patch JSONB NOT NULL,
  old_snapshot_hash TEXT NOT NULL,
  new_snapshot_hash TEXT NOT NULL,
  status project_amendment_status NOT NULL DEFAULT 'proposed',
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ NULL,
  decided_by_user_id UUID NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT project_amendments_external_id_unique UNIQUE (external_id),
  CONSTRAINT project_amendments_external_id_format
    CHECK (external_id ~ '^amd_[0-9a-f]{20}$'),
  CONSTRAINT project_amendments_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT project_amendments_proposer_fk
    FOREIGN KEY (proposer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT project_amendments_counterparty_fk
    FOREIGN KEY (counterparty_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT project_amendments_decided_by_fk
    FOREIGN KEY (decided_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT project_amendments_parties_distinct
    CHECK (proposer_user_id <> counterparty_user_id),
  CONSTRAINT project_amendments_base_project_version_positive
    CHECK (base_project_version > 0),
  CONSTRAINT project_amendments_base_term_version_positive
    CHECK (base_term_version > 0),
  CONSTRAINT project_amendments_current_term_after_base
    CHECK (current_term_version IS NULL OR current_term_version > base_term_version),
  CONSTRAINT project_amendments_patch_object
    CHECK (jsonb_typeof(patch) = 'object' AND patch <> '{}'::jsonb),
  CONSTRAINT project_amendments_patch_keys
    CHECK (
      (patch - ARRAY['title', 'brief', 'revision_limit', 'start_at', 'due_at', 'service_snapshot']::text[])
      = '{}'::jsonb
    ),
  CONSTRAINT project_amendments_patch_title
    CHECK (NOT (patch ? 'title') OR (jsonb_typeof(patch->'title') = 'string' AND char_length(patch->>'title') >= 1)),
  CONSTRAINT project_amendments_patch_brief
    CHECK (NOT (patch ? 'brief') OR (jsonb_typeof(patch->'brief') = 'string' AND char_length(patch->>'brief') >= 1)),
  CONSTRAINT project_amendments_patch_revision
    CHECK (
      NOT (patch ? 'revision_limit')
      OR (
        jsonb_typeof(patch->'revision_limit') = 'number'
        AND (patch->>'revision_limit')::numeric >= 0
        AND (patch->>'revision_limit')::numeric = trunc((patch->>'revision_limit')::numeric)
      )
    ),
  CONSTRAINT project_amendments_patch_start
    CHECK (NOT (patch ? 'start_at') OR jsonb_typeof(patch->'start_at') IN ('string', 'null')),
  CONSTRAINT project_amendments_patch_due
    CHECK (NOT (patch ? 'due_at') OR jsonb_typeof(patch->'due_at') IN ('string', 'null')),
  CONSTRAINT project_amendments_patch_service
    CHECK (NOT (patch ? 'service_snapshot') OR jsonb_typeof(patch->'service_snapshot') = 'object'),
  CONSTRAINT project_amendments_old_hash_format
    CHECK (old_snapshot_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT project_amendments_new_hash_format
    CHECK (new_snapshot_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT project_amendments_hashes_differ
    CHECK (old_snapshot_hash <> new_snapshot_hash),
  CONSTRAINT project_amendments_expiry_after_creation
    CHECK (expires_at > created_at),
  CONSTRAINT project_amendments_version_positive
    CHECK (version > 0),
  CONSTRAINT project_amendments_decision_shape
    CHECK (
      (
        status = 'proposed'
        AND decided_at IS NULL
        AND decided_by_user_id IS NULL
        AND current_term_version IS NULL
      )
      OR (
        status = 'accepted'
        AND decided_at IS NOT NULL
        AND decided_by_user_id IS NOT NULL
        AND current_term_version IS NOT NULL
      )
      OR (
        status IN ('rejected', 'withdrawn')
        AND decided_at IS NOT NULL
        AND decided_by_user_id IS NOT NULL
        AND current_term_version IS NULL
      )
      OR (
        status = 'expired'
        AND decided_at IS NOT NULL
        AND decided_by_user_id IS NULL
        AND current_term_version IS NULL
      )
      OR (
        status = 'superseded'
        AND decided_at IS NOT NULL
        AND current_term_version IS NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_amendments_one_proposed_per_project
  ON project_amendments (project_id)
  WHERE status = 'proposed';

CREATE INDEX IF NOT EXISTS project_amendments_project_status_idx
  ON project_amendments (project_id, status);

CREATE INDEX IF NOT EXISTS project_amendments_counterparty_status_idx
  ON project_amendments (counterparty_user_id, status);

CREATE OR REPLACE FUNCTION project_amendments_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'project_amendments cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'proposed' THEN
    RAISE EXCEPTION 'terminal project_amendments are immutable'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'proposed' THEN
    RAISE EXCEPTION 'a proposed amendment cannot be rewritten in place'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.proposer_user_id IS DISTINCT FROM OLD.proposer_user_id
     OR NEW.counterparty_user_id IS DISTINCT FROM OLD.counterparty_user_id
     OR NEW.base_project_version IS DISTINCT FROM OLD.base_project_version
     OR NEW.base_term_version IS DISTINCT FROM OLD.base_term_version
     OR NEW.patch IS DISTINCT FROM OLD.patch
     OR NEW.old_snapshot_hash IS DISTINCT FROM OLD.old_snapshot_hash
     OR NEW.new_snapshot_hash IS DISTINCT FROM OLD.new_snapshot_hash
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'amendment identity and proposal facts are immutable'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'amendment version must increase by one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_amendments_guard ON project_amendments;
CREATE TRIGGER project_amendments_guard
  BEFORE UPDATE OR DELETE ON project_amendments
  FOR EACH ROW
  EXECUTE FUNCTION project_amendments_guard();

-- BR-PROJECTS-017. Once a project has an agreed term version, live commercial
-- columns change only in the same update that points at a new agreed version
-- whose snapshot matches those columns. delivery_days is not a snapshot field
-- and does not move with the pointer.
CREATE OR REPLACE FUNCTION projects_protect_agreed_terms()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.agreed_term_version IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.delivery_days IS DISTINCT FROM OLD.delivery_days THEN
    RAISE EXCEPTION 'accepted project delivery_days cannot change'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.title IS NOT DISTINCT FROM OLD.title
     AND NEW.requirements IS NOT DISTINCT FROM OLD.requirements
     AND NEW.revision_limit IS NOT DISTINCT FROM OLD.revision_limit
     AND NEW.service_snapshot IS NOT DISTINCT FROM OLD.service_snapshot
     AND NEW.price_amount IS NOT DISTINCT FROM OLD.price_amount
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.currency_exponent IS NOT DISTINCT FROM OLD.currency_exponent
  THEN
    RETURN NEW;
  END IF;
  IF NEW.agreed_term_version IS NOT DISTINCT FROM OLD.agreed_term_version
     OR NEW.agreed_term_version IS NULL
  THEN
    RAISE EXCEPTION 'accepted project terms change only with a new agreed term version'
      USING ERRCODE = '23514';
  END IF;
  PERFORM 1
  FROM project_term_versions
  WHERE project_id = NEW.id
    AND version_number = NEW.agreed_term_version
    AND represented_state = 'agreed'
    AND title = NEW.title
    AND brief = NEW.requirements
    AND revision_limit = NEW.revision_limit
    AND service_snapshot = NEW.service_snapshot
    AND currency = NEW.currency
    AND currency_exponent = NEW.currency_exponent
    AND total_amount = NEW.price_amount;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accepted project terms do not match the agreed term version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_protect_agreed_terms ON projects;
CREATE TRIGGER projects_protect_agreed_terms
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION projects_protect_agreed_terms();

COMMIT;
