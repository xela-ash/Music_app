BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Confirmed 2026-10-01: stored amounts are integer minor units. Widening
-- INT to BIGINT is non-lossy. The application still rejects a line that
-- cannot sum into projects.price_amount, which remains INTEGER.
ALTER TABLE project_milestones
  ALTER COLUMN amount TYPE BIGINT;

ALTER TABLE project_milestones
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT,
  ADD COLUMN IF NOT EXISTS deliverable_definition JSONB,
  ADD COLUMN IF NOT EXISTS revision_allowance INTEGER,
  ADD COLUMN IF NOT EXISTS terms_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS current_term_version INTEGER;

UPDATE project_milestones AS milestone
SET currency_exponent = project.currency_exponent
FROM projects AS project
WHERE milestone.project_id = project.id
  AND milestone.currency = project.currency
  AND milestone.currency_exponent IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM project_milestones WHERE currency_exponent IS NULL) THEN
    RAISE EXCEPTION 'milestone currency does not match its project; refusing to invent currency_exponent';
  END IF;
END $$;

ALTER TABLE project_milestones
  ALTER COLUMN currency_exponent SET NOT NULL;

-- Locked plans become frozen while the migration 008 trigger is still installed.
-- That trigger does not know terms_status. Do not require revision_allowance
-- or deliverable_definition here: Section 26.2 forbids inventing them.
-- The replacement trigger below rejects a later draft-to-frozen move that
-- omits those fields.
UPDATE project_milestones AS milestone
SET terms_status = 'frozen'
FROM projects AS project
WHERE milestone.project_id = project.id
  AND project.milestones_locked_at IS NOT NULL
  AND milestone.terms_status = 'draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_currency_exponent_nonnegative'
  ) THEN
    ALTER TABLE project_milestones
      ADD CONSTRAINT project_milestones_currency_exponent_nonnegative
      CHECK (currency_exponent >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_revision_allowance_nonnegative'
  ) THEN
    ALTER TABLE project_milestones
      ADD CONSTRAINT project_milestones_revision_allowance_nonnegative
      CHECK (revision_allowance IS NULL OR revision_allowance >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_terms_status'
  ) THEN
    ALTER TABLE project_milestones
      ADD CONSTRAINT project_milestones_terms_status
      CHECK (terms_status IN ('draft', 'frozen', 'agreed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_current_term_version_positive'
  ) THEN
    ALTER TABLE project_milestones
      ADD CONSTRAINT project_milestones_current_term_version_positive
      CHECK (current_term_version IS NULL OR current_term_version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_agreed_terms_complete'
  ) THEN
    ALTER TABLE project_milestones
      ADD CONSTRAINT project_milestones_agreed_terms_complete
      CHECK (
        terms_status <> 'agreed'
        OR (revision_allowance IS NOT NULL AND deliverable_definition IS NOT NULL)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS milestone_term_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  milestone_id UUID NOT NULL,
  project_term_version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  milestone_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  deliverable_definition JSONB NOT NULL,
  revision_allowance INTEGER NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL,
  currency_exponent SMALLINT NOT NULL,
  due_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT milestone_term_versions_external_id_unique UNIQUE (external_id),
  CONSTRAINT milestone_term_versions_external_id_format
    CHECK (external_id ~ '^mtv_[0-9a-f]{20}$'),
  CONSTRAINT milestone_term_versions_milestone_fk
    FOREIGN KEY (milestone_id) REFERENCES project_milestones (id) ON DELETE RESTRICT,
  CONSTRAINT milestone_term_versions_unique_kind
    UNIQUE (milestone_id, project_term_version, kind),
  CONSTRAINT milestone_term_versions_kind
    CHECK (kind IN ('proposal', 'agreed', 'amendment')),
  CONSTRAINT milestone_term_versions_version_positive
    CHECK (project_term_version > 0),
  CONSTRAINT milestone_term_versions_no_positive
    CHECK (milestone_no > 0),
  CONSTRAINT milestone_term_versions_amount_positive
    CHECK (amount > 0),
  CONSTRAINT milestone_term_versions_allowance_nonnegative
    CHECK (revision_allowance >= 0),
  CONSTRAINT milestone_term_versions_exponent_nonnegative
    CHECK (currency_exponent >= 0)
);

CREATE INDEX IF NOT EXISTS milestone_term_versions_version_idx
  ON milestone_term_versions (project_term_version, kind);

CREATE OR REPLACE FUNCTION milestone_term_versions_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'milestone_term_versions are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milestone_term_versions_no_update ON milestone_term_versions;
CREATE TRIGGER milestone_term_versions_no_update
  BEFORE UPDATE ON milestone_term_versions
  FOR EACH ROW
  EXECUTE FUNCTION milestone_term_versions_append_only();

DROP TRIGGER IF EXISTS milestone_term_versions_no_delete ON milestone_term_versions;
CREATE TRIGGER milestone_term_versions_no_delete
  BEFORE DELETE ON milestone_term_versions
  FOR EACH ROW
  EXECUTE FUNCTION milestone_term_versions_append_only();

-- Extends migration 008. The original seven columns stay protected. Frozen
-- and agreed rows stay immutable even when milestones_locked_at is unset.
CREATE OR REPLACE FUNCTION protect_locked_milestones() RETURNS TRIGGER AS $$
DECLARE
  v_locked_at TIMESTAMPTZ;
  v_proposal_version INTEGER;
  v_commercial_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.terms_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'A milestone starts as draft';
    END IF;
    SELECT milestones_locked_at, proposal_version
      INTO v_locked_at, v_proposal_version
      FROM projects
      WHERE id = NEW.project_id;
    IF v_locked_at IS NOT NULL OR v_proposal_version IS NOT NULL THEN
      RAISE EXCEPTION 'Project milestones are locked and cannot be changed';
    END IF;
    IF EXISTS (
      SELECT 1 FROM project_milestones
      WHERE project_id = NEW.project_id
        AND terms_status IN ('frozen', 'agreed')
    ) THEN
      RAISE EXCEPTION 'Project milestones are locked and cannot be changed';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT milestones_locked_at, proposal_version
      INTO v_locked_at, v_proposal_version
      FROM projects
      WHERE id = OLD.project_id;
    IF v_locked_at IS NOT NULL
      OR v_proposal_version IS NOT NULL
      OR OLD.terms_status IN ('frozen', 'agreed')
    THEN
      RAISE EXCEPTION 'Project milestones are locked and cannot be changed';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_commercial_changed :=
      NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.milestone_no IS DISTINCT FROM OLD.milestone_no
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.currency_exponent IS DISTINCT FROM OLD.currency_exponent
      OR NEW.deliverable_definition IS DISTINCT FROM OLD.deliverable_definition
      OR NEW.revision_allowance IS DISTINCT FROM OLD.revision_allowance
      OR NEW.due_at IS DISTINCT FROM OLD.due_at;

    SELECT milestones_locked_at INTO v_locked_at FROM projects WHERE id = OLD.project_id;
    IF v_locked_at IS NOT NULL AND v_commercial_changed THEN
      RAISE EXCEPTION 'Project milestones are locked and cannot be changed';
    END IF;
    IF OLD.terms_status IN ('frozen', 'agreed') AND v_commercial_changed THEN
      RAISE EXCEPTION 'Project milestones are locked and cannot be changed';
    END IF;

    IF NEW.terms_status IS DISTINCT FROM OLD.terms_status THEN
      IF NOT (
        (OLD.terms_status = 'draft' AND NEW.terms_status = 'frozen')
        OR (OLD.terms_status = 'frozen' AND NEW.terms_status = 'agreed')
      ) THEN
        RAISE EXCEPTION 'Milestone terms status cannot move backward';
      END IF;
      IF OLD.terms_status = 'draft' AND NEW.terms_status = 'frozen' THEN
        IF NEW.revision_allowance IS NULL OR NEW.deliverable_definition IS NULL THEN
          RAISE EXCEPTION 'Milestone terms are incomplete';
        END IF;
      END IF;
    ELSIF NEW.current_term_version IS DISTINCT FROM OLD.current_term_version THEN
      RAISE EXCEPTION 'Project milestones are locked and cannot be changed';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
