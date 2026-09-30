BEGIN;

-- MVP-015 / ADR-001 / BR-PROJECTS-081 / DATA-PROJECTS-018 / DATA-PROJECTS-005.
-- Adds the Projects-owned term-version sequence and the target project states.
-- No existing commercial row is rewritten and no column is dropped.

ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'proposed';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'seller_invited';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'seller_declined';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'awaiting_seller';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'awaiting_funding';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'delivery_pending';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'buyer_approved';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'ratings_pending';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'archived';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS proposal_version INTEGER NULL,
  ADD COLUMN IF NOT EXISTS agreed_term_version INTEGER NULL,
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS resume_state project_state NULL,
  ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_proposal_version_positive'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_proposal_version_positive
      CHECK (proposal_version IS NULL OR proposal_version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_agreed_term_version_positive'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_agreed_term_version_positive
      CHECK (agreed_term_version IS NULL OR agreed_term_version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_currency_exponent_nonnegative'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_currency_exponent_nonnegative
      CHECK (currency_exponent >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_term_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  represented_state TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  service_snapshot JSONB NOT NULL,
  genre_ids JSONB NOT NULL,
  skill_ids JSONB NOT NULL,
  currency TEXT NOT NULL,
  currency_exponent SMALLINT NOT NULL,
  total_amount BIGINT NOT NULL,
  start_at TIMESTAMPTZ NULL,
  due_at TIMESTAMPTZ NULL,
  revision_limit INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT project_term_versions_external_id_unique UNIQUE (external_id),
  CONSTRAINT project_term_versions_external_id_format
    CHECK (external_id ~ '^ptv_[0-9a-f]{20}$'),
  CONSTRAINT project_term_versions_project_version_unique
    UNIQUE (project_id, version_number),
  CONSTRAINT project_term_versions_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT project_term_versions_version_positive
    CHECK (version_number > 0),
  CONSTRAINT project_term_versions_represented_state
    CHECK (represented_state IN ('proposed', 'agreed')),
  CONSTRAINT project_term_versions_title_present
    CHECK (char_length(title) >= 1),
  CONSTRAINT project_term_versions_brief_present
    CHECK (char_length(brief) >= 1),
  CONSTRAINT project_term_versions_service_snapshot_object
    CHECK (jsonb_typeof(service_snapshot) = 'object'),
  CONSTRAINT project_term_versions_genre_ids_array
    CHECK (jsonb_typeof(genre_ids) = 'array'),
  CONSTRAINT project_term_versions_skill_ids_array
    CHECK (jsonb_typeof(skill_ids) = 'array'),
  CONSTRAINT project_term_versions_currency_code
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT project_term_versions_exponent_nonnegative
    CHECK (currency_exponent >= 0),
  CONSTRAINT project_term_versions_total_positive
    CHECK (total_amount > 0),
  CONSTRAINT project_term_versions_revision_nonnegative
    CHECK (revision_limit >= 0),
  CONSTRAINT project_term_versions_hash_format
    CHECK (content_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS project_term_versions_project_idx
  ON project_term_versions (project_id, version_number);

CREATE TABLE IF NOT EXISTS project_state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  source_state TEXT NOT NULL,
  target_state TEXT NOT NULL,
  trigger_action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  source_fact_id TEXT NULL,
  precondition_version INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  reason_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT project_state_transitions_external_id_unique UNIQUE (external_id),
  CONSTRAINT project_state_transitions_external_id_format
    CHECK (external_id ~ '^pst_[0-9a-f]{20}$'),
  CONSTRAINT project_state_transitions_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT project_state_transitions_actor_type
    CHECK (actor_type IN ('user', 'system')),
  CONSTRAINT project_state_transitions_outcome
    CHECK (outcome = 'completed'),
  CONSTRAINT project_state_transitions_version_positive
    CHECK (precondition_version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_state_transitions_source_fact_unique
  ON project_state_transitions (project_id, source_fact_id)
  WHERE source_fact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_state_transitions_project_time_idx
  ON project_state_transitions (project_id, created_at);

CREATE OR REPLACE FUNCTION project_term_version_content_hash(
  represented_state TEXT,
  title TEXT,
  brief TEXT,
  service_snapshot JSONB,
  genre_ids JSONB,
  skill_ids JSONB,
  currency TEXT,
  currency_exponent SMALLINT,
  total_amount BIGINT,
  start_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  revision_limit INTEGER
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(
    concat_ws('|',
      represented_state,
      title,
      brief,
      service_snapshot::text,
      genre_ids::text,
      skill_ids::text,
      currency,
      currency_exponent::text,
      total_amount::text,
      coalesce(start_at::text, ''),
      coalesce(due_at::text, ''),
      revision_limit::text
    ),
    'sha256'
  ), 'hex');
$$;

CREATE OR REPLACE FUNCTION project_term_versions_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_number INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO expected_number
    FROM project_term_versions
    WHERE project_id = NEW.project_id;
  IF NEW.version_number IS DISTINCT FROM expected_number THEN
    RAISE EXCEPTION 'project term version is not the next sequence number'
      USING ERRCODE = '23514';
  END IF;
  NEW.content_hash = project_term_version_content_hash(
    NEW.represented_state,
    NEW.title,
    NEW.brief,
    NEW.service_snapshot,
    NEW.genre_ids,
    NEW.skill_ids,
    NEW.currency,
    NEW.currency_exponent,
    NEW.total_amount,
    NEW.start_at,
    NEW.due_at,
    NEW.revision_limit
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_term_versions_before_insert ON project_term_versions;
CREATE TRIGGER project_term_versions_before_insert
  BEFORE INSERT ON project_term_versions
  FOR EACH ROW
  EXECUTE FUNCTION project_term_versions_before_insert();

CREATE OR REPLACE FUNCTION reject_project_term_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'project_term_versions are immutable'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS project_term_versions_no_update ON project_term_versions;
CREATE TRIGGER project_term_versions_no_update
  BEFORE UPDATE ON project_term_versions
  FOR EACH ROW
  EXECUTE FUNCTION reject_project_term_version_mutation();

DROP TRIGGER IF EXISTS project_term_versions_no_delete ON project_term_versions;
CREATE TRIGGER project_term_versions_no_delete
  BEFORE DELETE ON project_term_versions
  FOR EACH ROW
  EXECUTE FUNCTION reject_project_term_version_mutation();

CREATE OR REPLACE FUNCTION reject_project_state_transition_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'project_state_transitions are append-only'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS project_state_transitions_no_update ON project_state_transitions;
CREATE TRIGGER project_state_transitions_no_update
  BEFORE UPDATE ON project_state_transitions
  FOR EACH ROW
  EXECUTE FUNCTION reject_project_state_transition_mutation();

DROP TRIGGER IF EXISTS project_state_transitions_no_delete ON project_state_transitions;
CREATE TRIGGER project_state_transitions_no_delete
  BEFORE DELETE ON project_state_transitions
  FOR EACH ROW
  EXECUTE FUNCTION reject_project_state_transition_mutation();

CREATE OR REPLACE FUNCTION projects_enforce_stored_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state::text IN ('disputed', 'suspended', 'archived') THEN
    IF NEW.resume_state IS NULL THEN
      RAISE EXCEPTION 'stored state required'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.resume_state IS NOT NULL THEN
    RAISE EXCEPTION 'stored state must be empty'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.state::text = 'disputed' AND NEW.resume_state::text NOT IN (
    'funded', 'in_progress', 'delivery_pending', 'delivered', 'buyer_approved', 'ratings_pending'
  ) THEN
    RAISE EXCEPTION 'invalid dispute resume state'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.state::text = 'suspended' AND NEW.resume_state::text NOT IN (
    'awaiting_funding', 'funded', 'in_progress', 'delivery_pending', 'delivered'
  ) THEN
    RAISE EXCEPTION 'invalid suspension resume state'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.state::text = 'archived' AND NEW.resume_state::text NOT IN (
    'completed', 'cancelled', 'refunded'
  ) THEN
    RAISE EXCEPTION 'invalid archived terminal state'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_enforce_stored_state ON projects;
CREATE TRIGGER projects_enforce_stored_state
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION projects_enforce_stored_state();

COMMIT;
