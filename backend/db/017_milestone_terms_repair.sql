BEGIN;

-- Databases that applied the first version of migration 016 have
-- project_milestones_frozen_terms_complete. That check requires every frozen
-- row to already have a revision allowance and a deliverable definition.
-- Milestones Section 26.2 backfills a locked plan to frozen without inventing
-- those fields, so the check aborts the migration. Agreed rows still must be
-- complete. A later draft-to-frozen update is rejected by the trigger below.

ALTER TABLE project_milestones
  DROP CONSTRAINT IF EXISTS project_milestones_frozen_terms_complete;

DO $$
BEGIN
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

-- Same function as migration 016. CREATE OR REPLACE repairs a database whose
-- 016 function was installed before the incomplete-terms guard.
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
